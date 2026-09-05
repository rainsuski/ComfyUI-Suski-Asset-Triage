# py/lineage_parser.py
"""
项目代号: Asset Triage
文件功能: 元数据具体解析引擎实现：
          提供针对 ComfyUI-DataflowProbe 时序血统探针规范的多阶段元数据解析器，
          以及针对原生工作流静态拓扑回溯的基础解析器。
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("AssetTriage.LineageParser")


class DataflowLineageParser:
    """DataflowProbe 动态多阶段时序血统探针解析器"""

    @classmethod
    def can_parse(
        cls,
        raw_info: Dict[str, Any],
        settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """检查是否存在匹配的 Lineage 元数据文本块"""
        if not raw_info:
            return False

        target_key = (
            (settings.get("lineage_key") if settings else None) or "dataflow_lineage"
        ).strip()

        # 优先检测用户指定的键，若无则做通用别名探测
        candidates = [target_key, "dataflow_lineage", "lineage_metadata"]
        for key in candidates:
            if key in raw_info and raw_info[key]:
                return True
        return False

    @classmethod
    def parse(
        cls,
        raw_info: Dict[str, Any],
        settings: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """执行 DataflowProbe 多阶段元数据标准化提取"""
        target_key = (
            (settings.get("lineage_key") if settings else None) or "dataflow_lineage"
        ).strip()

        raw_payload = None
        candidates = [target_key, "dataflow_lineage", "lineage_metadata"]
        for key in candidates:
            if key in raw_info and raw_info[key]:
                raw_payload = raw_info[key]
                break

        if not raw_payload:
            return None

        # 转换为字典对象
        payload_data: Dict[str, Any] = {}
        if isinstance(raw_payload, str):
            try:
                payload_data = json.loads(raw_payload)
            except Exception as e:
                logger.warning(f"反序列化 Lineage JSON 文本块失败: {e}")
                return None
        elif isinstance(raw_payload, dict):
            payload_data = raw_payload
        else:
            return None

        stages_raw = payload_data.get("stages", [])
        if not isinstance(stages_raw, list) or len(stages_raw) == 0:
            return None

        normalized_stages: List[Dict[str, Any]] = []
        for idx, stage in enumerate(stages_raw):
            if not isinstance(stage, dict):
                continue

            stage_name = stage.get("stage_name", f"Stage_{idx + 1}")
            node_id = str(stage.get("node_id", ""))
            timestamp = stage.get("timestamp", 0)
            params = stage.get("params", {})
            if not isinstance(params, dict):
                params = {}

            # 模型名称智能归一化
            model_name = "Unknown"
            if params.get("unet_name"):
                model_name = f"[Net] {Path(str(params['unet_name'])).stem}"
            elif params.get("ckpt_name"):
                model_name = Path(str(params["ckpt_name"])).stem
            elif params.get("model_name"):
                model_name = Path(str(params["model_name"])).stem
            elif params.get("model"):
                model_name = Path(str(params["model"])).stem

            # 采样核心参数归一化
            seed_val = int(params.get("seed", params.get("noise_seed", -1)))
            steps_val = int(params.get("steps", params.get("start_at_step", 0)))
            cfg_val = round(float(params.get("cfg", 0.0)), 2)
            sampler_val = str(
                params.get("sampler_name", params.get("sampler", "Unknown"))
            ).strip()
            scheduler_val = str(params.get("scheduler", "Unknown")).strip()

            # 提示词提取
            pos_prompt = str(
                params.get(
                    "positive_prompt", params.get("prompt", params.get("text", ""))
                )
            ).strip()
            neg_prompt = str(params.get("negative_prompt", "")).strip()

            # LoRA 多态兼容归一化（支持单个 dict、标准 list 或平铺字段）
            normalized_loras = cls._normalize_loras(params)

            stage_entry = {
                "stage_name": stage_name,
                "node_id": node_id,
                "timestamp": timestamp,
                "model": model_name,
                "seed": seed_val,
                "steps": steps_val,
                "cfg": cfg_val,
                "sampler_name": sampler_val,
                "scheduler": scheduler_val,
                "positive_prompt": pos_prompt,
                "negative_prompt": neg_prompt,
                "loras": normalized_loras,
                "params": params,
            }
            normalized_stages.append(stage_entry)

        if not normalized_stages:
            return None

        return {
            "has_lineage": True,
            "schema_version": str(payload_data.get("schema_version", "3.0")),
            "stage_count": len(normalized_stages),
            "stages": normalized_stages,
            "custom": payload_data.get("custom", {}),
            "raw_lineage": payload_data,
        }

    @staticmethod
    def _normalize_loras(params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """多态解析并归一化 LoRA 载荷"""
        raw_loras = params.get("loras")
        target_items = []

        if isinstance(raw_loras, list):
            target_items = raw_loras
        elif isinstance(raw_loras, dict):
            target_items = [raw_loras]
        elif params.get("lora_name"):
            target_items = [
                {
                    "lora_name": params.get("lora_name"),
                    "strength": params.get(
                        "strength", params.get("lora_strength", 1.0)
                    ),
                }
            ]

        results = []
        for item in target_items:
            if not isinstance(item, dict):
                continue
            l_name = item.get("lora_name") or item.get("name") or "Unknown"
            if str(l_name).strip().lower() in ("", "none"):
                continue

            raw_strength = item.get("strength", 1.0)
            try:
                strength = round(float(raw_strength), 2)
            except Exception:
                strength = 1.0

            results.append({"name": Path(str(l_name)).stem, "strength": strength})

        return results


class NativeWorkflowParser:
    """ComfyUI 原生标准工作流基础静态拓扑回溯解析器"""

    @classmethod
    def can_parse(cls, prompt_graph: Dict[str, Any]) -> bool:
        """只要图结构存在即可作为兜底方案"""
        return bool(prompt_graph and isinstance(prompt_graph, dict))

    @classmethod
    def parse(cls, prompt_graph: Dict[str, Any]) -> Dict[str, Any]:
        """执行单阶段标准原生拓扑抓取"""
        parsed_stage: Dict[str, Any] = {
            "stage_name": "Stage 1 (Native)",
            "node_id": "",
            "timestamp": 0,
            "model": "Unknown",
            "seed": -1,
            "steps": 0,
            "cfg": 0.0,
            "sampler_name": "Unknown",
            "scheduler": "Unknown",
            "positive_prompt": "",
            "negative_prompt": "",
            "loras": [],
            "params": {},
        }

        if not prompt_graph:
            return {
                "has_lineage": False,
                "schema_version": "1.0",
                "stage_count": 1,
                "stages": [parsed_stage],
                "custom": {},
            }

        sampler_node = cls._find_standard_sampler(prompt_graph)
        if not sampler_node:
            return {
                "has_lineage": False,
                "schema_version": "1.0",
                "stage_count": 1,
                "stages": [parsed_stage],
                "custom": {},
            }

        inputs = sampler_node.get("inputs", {})

        parsed_stage["seed"] = int(inputs.get("seed", inputs.get("noise_seed", -1)))
        parsed_stage["steps"] = int(inputs.get("steps", 0))
        parsed_stage["cfg"] = round(float(inputs.get("cfg", 0.0)), 2)
        parsed_stage["sampler_name"] = str(
            inputs.get("sampler_name", "Unknown")
        ).strip()
        parsed_stage["scheduler"] = str(inputs.get("scheduler", "Unknown")).strip()

        parsed_stage["positive_prompt"] = cls._trace_text(
            prompt_graph, inputs.get("positive"), visited=set()
        )
        parsed_stage["negative_prompt"] = cls._trace_text(
            prompt_graph, inputs.get("negative"), visited=set()
        )

        parsed_stage["model"] = cls._trace_model_name(
            prompt_graph, inputs.get("model"), visited=set()
        )
        parsed_stage["loras"] = cls._trace_loras(
            prompt_graph, inputs.get("model"), visited=set()
        )

        return {
            "has_lineage": False,
            "schema_version": "1.0",
            "stage_count": 1,
            "stages": [parsed_stage],
            "custom": {},
        }

    @staticmethod
    def _find_standard_sampler(graph: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """寻找标准采样节点"""
        standard_types = ("KSampler", "KSamplerAdvanced", "SamplerCustom")
        for node in graph.values():
            if isinstance(node, dict) and node.get("class_type") in standard_types:
                return node

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
        """追溯文本编码器节点内容"""
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

        if "CLIPTextEncode" in class_type:
            if "text_g" in inputs or "text_l" in inputs:
                tg = str(inputs.get("text_g", "")).strip()
                tl = str(inputs.get("text_l", "")).strip()
                if tg and tl and tg != tl:
                    return f"{tg}, {tl}"
                return tg or tl
            return str(inputs.get("text", "")).strip()

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
        """沿 model 连线追溯模型名称"""
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

        if "CheckpointLoader" in class_type or "ckpt_name" in inputs:
            ckpt = inputs.get("ckpt_name", "Unknown")
            return Path(str(ckpt)).stem

        if "UNETLoader" in class_type or "unet_name" in inputs:
            unet = inputs.get("unet_name", "Unknown")
            return f"[Net] {Path(str(unet)).stem}"

        if "model" in inputs and isinstance(inputs["model"], list):
            return cls._trace_model_name(graph, inputs["model"], visited)

        return "Unknown"

    @classmethod
    def _trace_loras(
        cls, graph: Dict[str, Any], link: Any, visited: Set[str]
    ) -> List[Dict[str, Any]]:
        """抓取挂载的标准 LoRA"""
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
