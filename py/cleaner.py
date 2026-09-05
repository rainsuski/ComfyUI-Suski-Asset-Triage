# py/cleaner.py
"""
项目代号: Asset Triage
文件功能: Inbox Zero 物理清理机制（删除原图与缩略图/元数据缓存）
          以及插件冷启动时的孤儿缓存回收与三级容错寻径引擎。
"""

import json
import logging
from pathlib import Path
from typing import List, Tuple

from ..config import CACHE_META_DIR, CACHE_THUMBS_DIR, get_staging_dir
from .processor import ImageProcessor

logger = logging.getLogger("AssetTriage.Cleaner")


class AssetCleaner:
    """资产物理删除与生命周期垃圾回收器"""

    @staticmethod
    def get_current_staging_dir() -> Path:
        """动态获取当前有效的暂存仓库根目录"""
        return get_staging_dir()

    @classmethod
    def _resolve_paths_by_id(cls, asset_id: str) -> Tuple[Path, Path, List[Path]]:
        """
        三级高容错寻径引擎，确保 100% 精准定位磁盘上的待审原图：
        1. 优先读取 meta JSON 中的物理绝对路径 (orig_path)
        2. 动态读取当前审阅暂存根目录 + subfolder + filename
        3. 若仍未命中，启动当前暂存目录全局递归匹配
        """
        meta_file = CACHE_META_DIR / f"{asset_id}.json"
        staging_file = None
        current_staging_dir = cls.get_current_staging_dir()

        subfolder = ""
        filename = ""

        if meta_file.is_file():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    recorded_orig = data.get("orig_path")
                    if recorded_orig:
                        cand = Path(recorded_orig).resolve()
                        if cand.is_file():
                            staging_file = cand

                    subfolder = data.get("subfolder", "")
                    filename = data.get("filename", "")
            except Exception as e:
                logger.warning(f"读取元数据解析原图路径失败: {e}")

        # 2. 动态拼接当前暂存仓库目录
        if staging_file is None or not staging_file.is_file():
            if not filename:
                if "__" in asset_id:
                    parts = asset_id.split("__")
                    subfolder = "/".join(parts[:-1])
                    filename = parts[-1]
                else:
                    filename = asset_id

            cand = (current_staging_dir / subfolder / filename).resolve()
            if cand.is_file():
                staging_file = cand

        # 3. 终极兜底：在暂存仓库目录下递归匹配同名文件
        if (staging_file is None or not staging_file.is_file()) and filename:
            for matched in current_staging_dir.rglob(filename):
                if matched.is_file():
                    staging_file = matched.resolve()
                    logger.info(f"三级递归寻径命中原暂存文件: {staging_file}")
                    break

        if staging_file is None:
            staging_file = (current_staging_dir / subfolder / filename).resolve()

        thumb_files = list(CACHE_THUMBS_DIR.glob(f"{asset_id}_*.webp"))
        return staging_file, meta_file, thumb_files

    @classmethod
    def delete_single(cls, asset_id: str) -> bool:
        """物理删除单张资产及其关联缓存"""
        staging_file, meta_file, thumb_files = cls._resolve_paths_by_id(asset_id)
        success = True

        try:
            if staging_file.is_file():
                staging_file.unlink(missing_ok=True)
                logger.info(f"已物理删除暂存原图: {staging_file.name}")
        except Exception as e:
            logger.error(f"删除暂存文件失败 [{staging_file}]: {e}")
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
        """冷启动自动对齐与垃圾回收 (以当前配置的暂存目录为准)"""
        logger.info("正在执行冷启动资产对齐与垃圾回收 (Reconciliation GC)...")
        current_staging_dir = cls.get_current_staging_dir()
        if not current_staging_dir.exists():
            return

        current_staging_assets = set()
        supported_exts = {".png", ".webp", ".jpg", ".jpeg"}

        for file_path in current_staging_dir.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in supported_exts:
                try:
                    rel_path = file_path.relative_to(current_staging_dir)
                    subfolder = (
                        str(rel_path.parent) if rel_path.parent != Path(".") else ""
                    )
                except Exception:
                    subfolder = ""

                filename = file_path.name
                asset_id = ImageProcessor.get_asset_id(subfolder, filename)
                current_staging_assets.add(asset_id)

                meta_file = CACHE_META_DIR / f"{asset_id}.json"
                if not meta_file.exists():
                    try:
                        ImageProcessor.process_file(file_path, subfolder, filename)
                    except Exception as e:
                        logger.warning(f"冷启动补全缓存失败 [{file_path.name}]: {e}")

        for meta_file in CACHE_META_DIR.glob("*.json"):
            asset_id = meta_file.stem
            if asset_id not in current_staging_assets:
                meta_file.unlink(missing_ok=True)
                for thumb in CACHE_THUMBS_DIR.glob(f"{asset_id}_*.webp"):
                    thumb.unlink(missing_ok=True)

        logger.info(
            f"冷启动对齐完成，当前待审有效资产数: {len(current_staging_assets)}"
        )
