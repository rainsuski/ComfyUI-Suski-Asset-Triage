# py/presets.py
"""
项目代号: Asset Triage
文件功能: 转存规则预设 (Presets) 与用户偏好设置 (Settings) 的持久化管理。
"""

import json
import logging
from typing import Any, Dict, List

from ..config import (
    CACHE_PRESETS_FILE,
    CACHE_SETTINGS_FILE,
    DEFAULT_PRESET,
    DEFAULT_THUMB_MAX_EDGE,
)

logger = logging.getLogger("AssetTriage.Presets")


class PresetManager:
    """预设与系统设置管理器"""

    @classmethod
    def get_presets(cls) -> List[Dict[str, Any]]:
        """获取全部转存预设列表，自动兼容升级旧数据结构"""
        if not CACHE_PRESETS_FILE.exists():
            cls.save_presets([DEFAULT_PRESET])
            return [DEFAULT_PRESET]

        try:
            with open(CACHE_PRESETS_FILE, "r", encoding="utf-8") as f:
                presets = json.load(f)
                if isinstance(presets, list) and len(presets) > 0:
                    migrated = False
                    for p in presets:
                        if "template" not in p:
                            path_part = p.get(
                                "path_template", "%date%/%category%"
                            ).strip("/\\")
                            name_part = p.get(
                                "name_template", "%date%_%seed%_%count%"
                            ).strip("/\\")
                            p["template"] = (
                                f"{path_part}/{name_part}" if path_part else name_part
                            )
                            migrated = True
                        if "embed_workflow" not in p:
                            p["embed_workflow"] = True
                            migrated = True
                        if "embed_prompt" not in p:
                            p["embed_prompt"] = True
                            migrated = True
                        if "embed_lora" not in p:
                            p["embed_lora"] = True
                            migrated = True
                        if "embed_lora_recipe" not in p:
                            p["embed_lora_recipe"] = False
                            migrated = True
                    if migrated:
                        cls.save_presets(presets)
                    return presets
        except Exception as e:
            logger.error(f"读取预设配置文件异常: {e}")

        return [DEFAULT_PRESET]

    @classmethod
    def save_presets(cls, presets: List[Dict[str, Any]]) -> bool:
        """持久化保存预设列表"""
        try:
            with open(CACHE_PRESETS_FILE, "w", encoding="utf-8") as f:
                json.dump(presets, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"保存预设配置失败: {e}")
            return False

    @classmethod
    def get_settings(cls) -> Dict[str, Any]:
        """获取视图首选项与全局设置"""
        default_settings = {
            "staging_dir": "staging",  # 暂存仓库目录: 默认 staging，留空为原生 temp，填值则读取自定义目录
            "thumb_max_edge": DEFAULT_THUMB_MAX_EDGE,
            "default_view": "masonry",
            "auto_open_triage": False,
            "confirm_delete": True,
            "lineage_key": "dataflow_lineage",  # DataflowProbe 元数据注入键名
            "lineage_export_stage": 0,  # 导出占位符默认取用的阶段序号 (0-based)
        }

        if not CACHE_SETTINGS_FILE.exists():
            cls.save_settings(default_settings)
            return default_settings

        try:
            with open(CACHE_SETTINGS_FILE, "r", encoding="utf-8") as f:
                settings = json.load(f)
                default_settings.update(settings)
                return default_settings
        except Exception as e:
            logger.error(f"读取设置文件异常: {e}")
            return default_settings

    @classmethod
    def save_settings(cls, settings: Dict[str, Any]) -> bool:
        """持久化保存用户设置"""
        try:
            with open(CACHE_SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"保存设置文件失败: {e}")
            return False
