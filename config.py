# config.py
"""
项目代号: Asset Triage (ComfyUI-Suski-Asset-Triage)
文件功能: 全局配置、跨平台路径管理与常量定义
"""

import json
from pathlib import Path
import folder_paths

# ---------------------------------------------------------
# 1. 跨平台路径拓扑定义 (明确原图与插件缓存边界)
# ---------------------------------------------------------
COMFY_TEMP_DIR = Path(folder_paths.get_temp_directory()).resolve()
COMFY_OUTPUT_DIR = Path(folder_paths.get_output_directory()).resolve()

# 插件根目录: custom_nodes/ComfyUI-Suski-Asset-Triage/
PLUGIN_ROOT = Path(__file__).parent.resolve()

# 插件专用自闭环缓存目录
CACHE_ROOT = PLUGIN_ROOT / ".cache"
CACHE_THUMBS_DIR = CACHE_ROOT / "thumbs"
CACHE_META_DIR = CACHE_ROOT / "meta"
CACHE_PRESETS_FILE = CACHE_ROOT / "presets.json"
CACHE_SETTINGS_FILE = CACHE_ROOT / "settings.json"

for directory in (CACHE_THUMBS_DIR, CACHE_META_DIR):
    directory.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# 2. 审阅暂存仓库目录动态解析引擎
# ---------------------------------------------------------
def get_staging_dir() -> Path:
    """
    动态获取审阅仓库暂存目录:
    1. 默认读取 output/staging 目录。
    2. 若 settings.json 中的 staging_dir 显式配置为空，则回退至 ComfyUI 原生 temp 目录。
    3. 若配置了自定义路径:
       - 绝对路径: 直接返回并自动创建
       - 相对路径: 自动相对于 ComfyUI output 目录解析，方便原生 Save Image 节点直接匹配
    """
    custom_staging = "staging"
    if CACHE_SETTINGS_FILE.is_file():
        try:
            with open(CACHE_SETTINGS_FILE, "r", encoding="utf-8") as f:
                settings = json.load(f)
                if "staging_dir" in settings:
                    custom_staging = settings.get("staging_dir", "").strip()
        except Exception:
            pass

    if custom_staging:
        p = Path(custom_staging)
        if not p.is_absolute():
            resolved = (
                Path(folder_paths.get_output_directory()).resolve() / p
            ).resolve()
        else:
            resolved = p.resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    # 显式为空时回退到 ComfyUI 运行时 temp 临时目录
    return Path(folder_paths.get_temp_directory()).resolve()


def is_custom_staging_enabled() -> bool:
    """判断当前是否启用了自定义暂存目录"""
    current_staging = get_staging_dir()
    default_temp = Path(folder_paths.get_temp_directory()).resolve()
    return current_staging != default_temp


# ---------------------------------------------------------
# 3. 默认缩略图与画质规范
# ---------------------------------------------------------
DEFAULT_THUMB_MAX_EDGE = 512
DEFAULT_THUMB_QUALITY = 80
DEFAULT_THUMB_FORMAT = "WEBP"

# ---------------------------------------------------------
# 4. 预设与系统常量
# ---------------------------------------------------------
PLUGIN_NAME = "Asset-Triage"
WS_EVENT_ITEM_ADDED = "asset_triage_item_added"
WS_EVENT_ITEM_REMOVED = "asset_triage_item_removed"

# 默认转存预设 (纯粹路径与命名模板，支持直接写目录)
DEFAULT_PRESET = {
    "id": "default",
    "name": "默认转存",
    "template": "%date%/%model:30%_%seed%_%count%",
    "format": "PNG",  # PNG / WEBP / JPEG
    "quality": 95,  # 仅 WEBP/JPEG 生效 (1-100)
    "embed_workflow": True,
    "embed_prompt": True,
    "embed_lora": True,
    "embed_lora_recipe": False,
}
