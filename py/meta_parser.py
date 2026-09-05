# py/meta_parser.py
"""
项目代号: Asset Triage
文件功能: 解析 PNG 文本块 (tEXt/iTXt) 中的 prompt 与 workflow，
          仅提供针对标准原生工作流的基础静态拓扑抓取。
"""

import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from PIL import Image

logger = logging.getLogger("AssetTriage.MetaParser")


class MetadataParser:
    """标准原生工作流基础静态元数据解析器"""

    @staticmethod
    def read_png_metadata_from_bytes(
        image_bytes: io.BytesIO,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """从内存字节流中安全读取 PNG prompt 与 workflow 文本块"""
        prompt_graph = {}
        workflow = {}
        try:
            image_bytes.seek(0)
            with Image.open(image_bytes) as img:
                info = img.info or {}
                if "prompt" in info:
                    p_data = info["prompt"]
                    prompt_graph = (
                        json.loads(p_data) if isinstance(p_data, str) else p_data
                    )
                if "workflow" in info:
                    wf_data = info["workflow"]
                    workflow = (
                        json.loads(wf_data) if isinstance(wf_data, str) else wf_data
                    )
        except Exception as e:
            logger.warning(f"读取 PNG 元数据块失败: {e}")
        return (
            prompt_graph if isinstance(prompt_graph, dict) else {},
            workflow if isinstance(workflow, dict) else {},
        )

    @classmethod
    def parse(cls, image_bytes: io.BytesIO, file_path: Path) -> Dict[str, Any]:
        """基础静态解析主入口"""
        prompt_graph, workflow = cls.read_png_metadata_from_bytes(image_bytes)

        parsed: Dict[str, Any] = {
            "model": "Unknown",
            "seed": -1,
            "steps": 0,
            "cfg": 0.0,
            "sampler_name": "Unknown",
            "scheduler": "Unknown",
            "positive_prompt": "",
            "negative_prompt": "",
            "loras": [],
            "raw_prompt": prompt_graph,
            "raw_workflow": workflow,
        }

        if not prompt_graph:
            return parsed

        # 1. 查找核心 KSampler 节点
        sampler_node = cls._find_standard_sampler(prompt_graph)
        if not sampler_node:
            return parsed

        inputs = sampler_node.get("inputs", {})

        # 2. 静态提取基础数值
        parsed["seed"] = int(inputs.get("seed", inputs.get("noise_seed", -1)))
        parsed["steps"] = int(inputs.get("steps", 0))
        parsed["cfg"] = round(float(inputs.get("cfg", 0.0)), 2)
        parsed["sampler_name"] = str(inputs.get("sampler_name", "Unknown")).strip()
        parsed["scheduler"] = str(inputs.get("scheduler", "Unknown")).strip()

        # 3. 静态追溯正/负向提示词
        parsed["positive_prompt"] = cls._trace_text(
            prompt_graph, inputs.get("positive"), visited=set()
        )
        parsed["negative_prompt"] = cls._trace_text(
            prompt_graph, inputs.get("negative"), visited=set()
        )

        # 4. 静态追溯主模型与沿途 LoRA
        parsed["model"] = cls._trace_model_name(
            prompt_graph, inputs.get("model"), visited=set()
        )
        parsed["loras"] = cls._trace_loras(
            prompt_graph, inputs.get("model"), visited=set()
        )

        return parsed

    # ---------------------------------------------------------
    # 基础节点查找与静态回溯引擎
    # ---------------------------------------------------------
    @staticmethod
    def _find_standard_sampler(graph: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """寻找标准 KSampler 节点"""
        standard_types = ("KSampler", "KSamplerAdvanced", "SamplerCustom")
        for node in graph.values():
            if isinstance(node, dict) and node.get("class_type") in standard_types:
                return node

        # 基础兜底：任一具备 seed, steps, cfg 的采样节点
        for node in graph.values():
            if isinstance(node, dict):
                inputs = node.get("inputs", {})
                if (
                    isinstance(inputs, dict)
                    and "seed" in inputs
                    and "steps" in inputs
                    and "cfg" in inputs
                ):
                    return node
        return None

    @classmethod
    def _trace_text(cls, graph: Dict[str, Any], link: Any, visited: Set[str]) -> str:
        """沿 conditioning 连线追溯标准 CLIPTextEncode 文本"""
        if not link or not isinstance(link, list) or len(link) < 1:
            return ""

        node_id = str(link[0])
        if node_id in visited:
            return ""
        visited.add(node_id)

        node = graph.get(node_id)
        if not isinstance(node, dict):
            return ""

        class_type = str(node.get("class_type", ""))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            return ""

        # 标准文本编码器
        if "CLIPTextEncode" in class_type:
            # 兼容 SDXL 原生双输入 (text_g / text_l)
            if "text_g" in inputs or "text_l" in inputs:
                tg = str(inputs.get("text_g", "")).strip()
                tl = str(inputs.get("text_l", "")).strip()
                if tg and tl and tg != tl:
                    return f"{tg}, {tl}"
                return tg or tl
            return str(inputs.get("text", "")).strip()

        # 处理 Conditioning 级联/组合节点
        for forward_key in ("conditioning", "conditioning_1", "conditioning_2", "clip"):
            if forward_key in inputs and isinstance(inputs[forward_key], list):
                res = cls._trace_text(graph, inputs[forward_key], visited)
                if res:
                    return res

        return ""

    @classmethod
    def _trace_model_name(
        cls, graph: Dict[str, Any], link: Any, visited: Set[str]
    ) -> str:
        """沿 model 连线追溯模型加载器名称"""
        if not link or not isinstance(link, list) or len(link) < 1:
            return "Unknown"

        node_id = str(link[0])
        if node_id in visited:
            return "Unknown"
        visited.add(node_id)

        node = graph.get(node_id)
        if not isinstance(node, dict):
            return "Unknown"

        class_type = str(node.get("class_type", ""))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            return "Unknown"

        # Checkpoint 加载器
        if "CheckpointLoader" in class_type or "ckpt_name" in inputs:
            ckpt = inputs.get("ckpt_name", "Unknown")
            return Path(str(ckpt)).stem

        # UNET / Diffusion Model 加载器
        if "UNETLoader" in class_type or "unet_name" in inputs:
            unet = inputs.get("unet_name", "Unknown")
            return f"[Net] {Path(str(unet)).stem}"

        # 向上穿透
        if "model" in inputs and isinstance(inputs["model"], list):
            return cls._trace_model_name(graph, inputs["model"], visited)

        return "Unknown"

    @classmethod
    def _trace_loras(
        cls, graph: Dict[str, Any], link: Any, visited: Set[str]
    ) -> List[Dict[str, Any]]:
        """沿 model 连线向上抓取挂载的标准 LoRA"""
        loras = []
        curr_link = link

        while curr_link and isinstance(curr_link, list) and len(curr_link) >= 1:
            node_id = str(curr_link[0])
            if node_id in visited:
                break
            visited.add(node_id)

            node = graph.get(node_id)
            if not isinstance(node, dict):
                break

            class_type = str(node.get("class_type", ""))
            inputs = node.get("inputs", {})
            if not isinstance(inputs, dict):
                break

            if "LoraLoader" in class_type:
                lora_name = Path(str(inputs.get("lora_name", "Unknown"))).stem
                strength = float(inputs.get("strength_model", 1.0))
                if lora_name and lora_name != "None":
                    loras.append({"name": lora_name, "strength": strength})

            curr_link = inputs.get("model")

        return loras
