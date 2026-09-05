# py/meta_parser.py
"""
项目代号: Asset Triage
文件功能: 通用图片元数据解析调度器与统一抽象接口：
          支持模块化引擎扩展，优先探测血统探针 (DataflowProbe) 多阶段元数据，
          未命中时平滑降级至原生工作流基础静态拓扑抓取。
"""

import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from PIL import Image

from .lineage_parser import DataflowLineageParser, NativeWorkflowParser
from .presets import PresetManager

logger = logging.getLogger("AssetTriage.MetaParser")


class BaseMetaParser:
    """元数据解析器统一抽象基类"""

    @classmethod
    def can_parse(
        cls,
        raw_info: Dict[str, Any],
        prompt_graph: Dict[str, Any],
        workflow: Dict[str, Any],
        settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """检查当前解析引擎是否能够解析该数据"""
        raise NotImplementedError

    @classmethod
    def parse(
        cls,
        raw_info: Dict[str, Any],
        prompt_graph: Dict[str, Any],
        workflow: Dict[str, Any],
        settings: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """执行具体元数据提取逻辑"""
        raise NotImplementedError


class MetadataParser:
    """通用元数据解析调度器门面"""

    @staticmethod
    def read_all_metadata_from_bytes(
        image_bytes: io.BytesIO,
    ) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        """从内存字节流中读取原始 info 文本字典、prompt 图结构与 workflow"""
        raw_info: Dict[str, Any] = {}
        prompt_graph: Dict[str, Any] = {}
        workflow: Dict[str, Any] = {}

        try:
            image_bytes.seek(0)
            with Image.open(image_bytes) as img:
                raw_info = dict(img.info or {})

                if "prompt" in raw_info:
                    p_data = raw_info["prompt"]
                    prompt_graph = (
                        json.loads(p_data) if isinstance(p_data, str) else p_data
                    )
                if "workflow" in raw_info:
                    wf_data = raw_info["workflow"]
                    workflow = (
                        json.loads(wf_data) if isinstance(wf_data, str) else wf_data
                    )
        except Exception as e:
            logger.warning(f"读取图片元数据块失败: {e}")

        return (
            raw_info,
            prompt_graph if isinstance(prompt_graph, dict) else {},
            workflow if isinstance(workflow, dict) else {},
        )

    @staticmethod
    def read_png_metadata_from_bytes(
        image_bytes: io.BytesIO,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """保持向后兼容的原生签名接口"""
        _, prompt_graph, workflow = MetadataParser.read_all_metadata_from_bytes(
            image_bytes
        )
        return prompt_graph, workflow

    @classmethod
    def parse(
        cls,
        image_bytes: io.BytesIO,
        file_path: Path,
        settings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """统一解析调度主入口"""
        if settings is None:
            settings = PresetManager.get_settings()

        raw_info, prompt_graph, workflow = cls.read_all_metadata_from_bytes(image_bytes)

        parsed_result: Optional[Dict[str, Any]] = None

        # 1. 优先策略：检测并解析 DataflowProbe 注入的动态元数据
        try:
            if DataflowLineageParser.can_parse(raw_info, settings=settings):
                parsed_result = DataflowLineageParser.parse(raw_info, settings=settings)
                if parsed_result:
                    logger.debug(
                        f"成功匹配并解析 DataflowProbe 元数据: {file_path.name}"
                    )
        except Exception as e:
            logger.warning(f"DataflowProbe 解析引擎处理异常，自动平滑降级: {e}")
            parsed_result = None

        # 2. 降级策略：标准原生工作流静态拓扑回溯
        if not parsed_result:
            parsed_result = NativeWorkflowParser.parse(prompt_graph)

        # 3. 标准化封装与顶层向下兼容映射
        stages = parsed_result.get("stages", [])
        export_stage_idx = int(settings.get("lineage_export_stage", 0))
        target_idx = export_stage_idx if 0 <= export_stage_idx < len(stages) else 0
        active_stage = stages[target_idx] if stages else {}

        final_meta: Dict[str, Any] = {
            # 基础兼容顶层字段 (供老旧卡片视图与快捷读取直接使用)
            "model": active_stage.get("model", "Unknown"),
            "seed": active_stage.get("seed", -1),
            "steps": active_stage.get("steps", 0),
            "cfg": active_stage.get("cfg", 0.0),
            "sampler_name": active_stage.get("sampler_name", "Unknown"),
            "scheduler": active_stage.get("scheduler", "Unknown"),
            "positive_prompt": active_stage.get("positive_prompt", ""),
            "negative_prompt": active_stage.get("negative_prompt", ""),
            "loras": active_stage.get("loras", []),
            # 多阶段时序扩展字段
            "has_lineage": parsed_result.get("has_lineage", False),
            "schema_version": parsed_result.get("schema_version", "1.0"),
            "stage_count": len(stages),
            "stages": stages,
            "custom": parsed_result.get("custom", {}),
            # 原生图结构保留
            "raw_prompt": prompt_graph,
            "raw_workflow": workflow,
            "raw_lineage": parsed_result.get("raw_lineage"),
        }

        return final_meta
