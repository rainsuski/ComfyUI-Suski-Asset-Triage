# config.py
"""
项目代号: Asset Triage (ComfyUI-Suski-Asset-Triage)
文件功能: 全局配置、跨平台路径管理与常量定义
"""

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
# 2. 默认缩略图与画质规范
# ---------------------------------------------------------
DEFAULT_THUMB_MAX_EDGE = 512
DEFAULT_THUMB_QUALITY = 80
DEFAULT_THUMB_FORMAT = "WEBP"

# ---------------------------------------------------------
# 3. 预设与系统常量
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
}
