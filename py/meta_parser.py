# py/meta_parser.py
"""
项目代号: Asset Triage
文件功能: 解析 PNG 文本块 (tEXt/iTXt) 中的 prompt 与 workflow，
          提供针对复杂工作流的启发式回溯算法，精准提取采样参数。
"""

import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image

logger = logging.getLogger("AssetTriage.MetaParser")


class MetadataParser:
    """PNG 元数据与生成参数解析引擎"""

    @staticmethod
    def read_png_metadata_from_bytes(
        image_bytes: io.BytesIO,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        从内存字节流中安全读取 PNG 块信息，绝不锁定磁盘原文件。
        :return: (prompt_graph, workflow)
        """
        prompt_graph = {}
        workflow = {}
        try:
            image_bytes.seek(0)
            with Image.open(image_bytes) as img:
                info = img.info
                if "prompt" in info:
                    prompt_data = info["prompt"]
                    prompt_graph = (
                        json.loads(prompt_data)
                        if isinstance(prompt_data, str)
                        else prompt_data
                    )
                if "workflow" in info:
                    workflow_data = info["workflow"]
                    workflow = (
                        json.loads(workflow_data)
                        if isinstance(workflow_data, str)
                        else workflow_data
                    )
        except Exception as e:
            logger.warning(f"读取 PNG 元数据块失败: {e}")
        return prompt_graph, workflow

    @classmethod
    def parse(cls, image_bytes: io.BytesIO, file_path: Path) -> Dict[str, Any]:
        """全量解析入口"""
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

        if not prompt_graph or not isinstance(prompt_graph, dict):
            return parsed

        sampler_node = cls._find_sampler_node(prompt_graph)
        if sampler_node and isinstance(sampler_node, dict):
            inputs = sampler_node.get("inputs", {})
            parsed["seed"] = inputs.get("seed", inputs.get("noise_seed", -1))
            parsed["steps"] = inputs.get("steps", 0)
            parsed["cfg"] = float(inputs.get("cfg", 0.0))
            parsed["sampler_name"] = str(inputs.get("sampler_name", "Unknown"))
            parsed["scheduler"] = str(inputs.get("scheduler", "Unknown"))

            parsed["positive_prompt"] = cls._trace_clip_text(
                prompt_graph, inputs.get("positive")
            )
            parsed["negative_prompt"] = cls._trace_clip_text(
                prompt_graph, inputs.get("negative")
            )
            parsed["model"] = cls._trace_model_name(prompt_graph, inputs.get("model"))
            parsed["loras"] = cls._trace_loras(prompt_graph, inputs.get("model"))

        return parsed

    @staticmethod
    def _find_sampler_node(graph: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """启发式查找图中的核心采样节点 (强化防御非 dict 节点)"""
        priority_types = {
            "KSampler",
            "KSamplerAdvanced",
            "KSampler (Efficient)",
            "KSamplerPipe",
            "ImpactKSamplerBasic",
        }
        for node in graph.values():
            if not isinstance(node, dict):
                continue
            if node.get("class_type") in priority_types:
                return node

        for node in graph.values():
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs", {})
            if (
                isinstance(inputs, dict)
                and "seed" in inputs
                and "cfg" in inputs
                and "steps" in inputs
            ):
                return node
        return None

    @classmethod
    def _trace_clip_text(cls, graph: Dict[str, Any], link: Any) -> str:
        """向上回溯提取文本提示词"""
        if not link or not isinstance(link, list) or len(link) < 1:
            return ""

        node_id = str(link[0])
        node = graph.get(node_id)
        if not node or not isinstance(node, dict):
            return ""

        class_type = node.get("class_type", "")
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            return ""

        if class_type in (
            "CLIPTextEncode",
            "CLIPTextEncodeSDXL",
            "BNK_CLIPTextEncodeAdvanced",
        ):
            text = inputs.get("text", "")
            return str(text).strip() if text else ""

        if "conditioning_1" in inputs:
            text1 = cls._trace_clip_text(graph, inputs.get("conditioning_1"))
            text2 = cls._trace_clip_text(graph, inputs.get("conditioning_2"))
            return f"{text1}\n{text2}".strip()

        for key in ("conditioning", "clip"):
            if key in inputs and isinstance(inputs[key], list):
                return cls._trace_clip_text(graph, inputs[key])

        return ""

    @classmethod
    def _trace_model_name(cls, graph: Dict[str, Any], link: Any) -> str:
        """向上回溯主 Checkpoint 模型名称"""
        if not link or not isinstance(link, list) or len(link) < 1:
            return "Unknown"

        node_id = str(link[0])
        node = graph.get(node_id)
        if not node or not isinstance(node, dict):
            return "Unknown"

        class_type = node.get("class_type", "")
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            return "Unknown"

        if "CheckpointLoader" in class_type or "UNETLoader" in class_type:
            ckpt = inputs.get("ckpt_name", inputs.get("unet_name", "Unknown"))
            return Path(str(ckpt)).stem

        if "model" in inputs and isinstance(inputs["model"], list):
            return cls._trace_model_name(graph, inputs["model"])

        return "Unknown"

    @classmethod
    def _trace_loras(cls, graph: Dict[str, Any], link: Any) -> List[Dict[str, Any]]:
        """向上回溯整条链路挂载的所有 LoRA"""
        loras = []
        curr_link = link
        visited = set()

        while curr_link and isinstance(curr_link, list) and len(curr_link) >= 1:
            node_id = str(curr_link[0])
            if node_id in visited:
                break
            visited.add(node_id)

            node = graph.get(node_id)
            if not node or not isinstance(node, dict):
                break

            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            if not isinstance(inputs, dict):
                break

            if "LoraLoader" in class_type:
                lora_name = Path(str(inputs.get("lora_name", "Unknown"))).stem
                strength_model = float(inputs.get("strength_model", 1.0))
                loras.append({"name": lora_name, "strength": strength_model})

            curr_link = inputs.get("model")

        return loras
