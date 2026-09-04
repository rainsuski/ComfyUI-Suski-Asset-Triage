# py/cleaner.py
"""
项目代号: Asset Triage
文件功能: Inbox Zero 物理清理机制（删除 temp 原图与缩略图/元数据缓存）
          以及插件冷启动时的孤儿缓存回收与对齐 (Reconciliation & GC)。
"""

import json
import logging
from pathlib import Path
from typing import List, Tuple

from ..config import CACHE_META_DIR, CACHE_THUMBS_DIR, COMFY_TEMP_DIR
from .processor import ImageProcessor

logger = logging.getLogger("AssetTriage.Cleaner")


class AssetCleaner:
    """资产物理删除与生命周期垃圾回收器"""

    @staticmethod
    def _resolve_paths_by_id(asset_id: str) -> Tuple[Path, Path, List[Path]]:
        """
        根据 asset_id 精准解析 temp 原图路径、meta JSON 路径及 thumbs 缩略图路径。
        优先读取 meta JSON 中的精确 filename 和 subfolder，杜绝双下划线误判。
        """
        meta_file = CACHE_META_DIR / f"{asset_id}.json"
        temp_file = None

        if meta_file.is_file():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    subfolder = data.get("subfolder", "")
                    filename = data.get("filename", "")
                    if filename:
                        temp_file = (COMFY_TEMP_DIR / subfolder / filename).resolve()
            except Exception as e:
                logger.warning(f"读取元数据解析原图路径失败: {e}")

        # 若未成功通过 meta 获取，则降级按分隔符回退解析
        if temp_file is None:
            if "__" in asset_id:
                parts = asset_id.split("__")
                subfolder = "/".join(parts[:-1])
                filename = parts[-1]
                temp_file = (COMFY_TEMP_DIR / subfolder / filename).resolve()
            else:
                temp_file = (COMFY_TEMP_DIR / asset_id).resolve()

        thumb_files = list(CACHE_THUMBS_DIR.glob(f"{asset_id}_*.webp"))
        return temp_file, meta_file, thumb_files

    @classmethod
    def delete_single(cls, asset_id: str) -> bool:
        """物理删除单张资产"""
        temp_file, meta_file, thumb_files = cls._resolve_paths_by_id(asset_id)
        success = True

        try:
            if temp_file.is_file():
                temp_file.unlink(missing_ok=True)
                logger.info(f"已物理删除 temp 原图: {temp_file.name}")
        except Exception as e:
            logger.error(f"删除 temp 文件失败 [{temp_file}]: {e}")
            success = False

        try:
            meta_file.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"删除元数据缓存失败 [{meta_file}]: {e}")

        for thumb in thumb_files:
            try:
                thumb.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"删除缩略图缓存失败 [{thumb}]: {e}")

        return success

    @classmethod
    def reconcile_on_startup(cls) -> None:
        """冷启动自动对齐与垃圾回收"""
        logger.info("正在执行冷启动资产对齐与垃圾回收 (Reconciliation GC)...")
        if not COMFY_TEMP_DIR.exists():
            return

        current_temp_assets = set()
        supported_exts = {".png", ".webp", ".jpg", ".jpeg"}

        for file_path in COMFY_TEMP_DIR.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in supported_exts:
                rel_path = file_path.relative_to(COMFY_TEMP_DIR)
                subfolder = str(rel_path.parent) if rel_path.parent != Path(".") else ""
                filename = rel_path.name
                asset_id = ImageProcessor.get_asset_id(subfolder, filename)
                current_temp_assets.add(asset_id)

                meta_file = CACHE_META_DIR / f"{asset_id}.json"
                if not meta_file.exists():
                    try:
                        ImageProcessor.process_file(file_path, subfolder, filename)
                    except Exception as e:
                        logger.warning(f"冷启动补全缓存失败 [{file_path.name}]: {e}")

        for meta_file in CACHE_META_DIR.glob("*.json"):
            asset_id = meta_file.stem
            if asset_id not in current_temp_assets:
                meta_file.unlink(missing_ok=True)
                for thumb in CACHE_THUMBS_DIR.glob(f"{asset_id}_*.webp"):
                    thumb.unlink(missing_ok=True)

        logger.info(f"冷启动对齐完成，当前待审有效资产数: {len(current_temp_assets)}")
