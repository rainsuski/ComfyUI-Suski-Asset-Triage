# py/processor.py
"""
项目代号: Asset Triage
文件功能: 异步任务工作线程，生成轻量 WebP 缩略图并写入缓存，持久化原图物理绝对路径与专用视图路由。
"""

import hashlib
import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image

from ..config import (
    CACHE_META_DIR,
    CACHE_THUMBS_DIR,
    DEFAULT_THUMB_MAX_EDGE,
    DEFAULT_THUMB_QUALITY,
)
from .meta_parser import MetadataParser

logger = logging.getLogger("AssetTriage.Processor")


class ImageProcessor:
    """静默图像预处理与缓存构建器"""

    @staticmethod
    def get_asset_id(subfolder: str, filename: str) -> str:
        """生成跨平台安全的唯一标识符"""
        clean_sub = subfolder.strip("/\\").replace("/", "__").replace("\\", "__")
        return f"{clean_sub}__{filename}" if clean_sub else filename

    @staticmethod
    def compute_file_hash(image_bytes: io.BytesIO) -> str:
        """计算图像二进制流的 SHA256 哈希值 (取前 16 位)"""
        image_bytes.seek(0)
        hasher = hashlib.sha256()
        hasher.update(image_bytes.read())
        image_bytes.seek(0)
        return hasher.hexdigest()[:16]

    @classmethod
    def process_file(
        cls, file_path: Path, subfolder: str = "", filename: str = ""
    ) -> Optional[Dict[str, Any]]:
        """对单张图片执行静默预处理"""
        if not file_path.is_file():
            logger.warning(f"预处理目标文件不存在: {file_path}")
            return None

        actual_resolved_path = str(file_path.resolve())

        try:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            img_bytes = io.BytesIO(raw_bytes)
        except Exception as e:
            logger.error(f"读取文件失败 [{file_path}]: {e}")
            return None

        actual_filename = filename or file_path.name
        asset_id = cls.get_asset_id(subfolder, actual_filename)
        file_hash = cls.compute_file_hash(img_bytes)
        thumb_filename = f"{asset_id}_{file_hash}.webp"
        thumb_path = CACHE_THUMBS_DIR / thumb_filename
        meta_path = CACHE_META_DIR / f"{asset_id}.json"

        # 清理由于同名覆盖产生的旧哈希缩略图
        for old_thumb in CACHE_THUMBS_DIR.glob(f"{asset_id}_*.webp"):
            if old_thumb.name != thumb_filename:
                old_thumb.unlink(missing_ok=True)

        width, height = 0, 0
        try:
            img_bytes.seek(0)
            with Image.open(img_bytes) as img:
                width, height = img.size

                if not thumb_path.exists():
                    img_copy = img.copy()
                    if img_copy.mode in ("RGBA", "LA") or (
                        img_copy.mode == "P" and "transparency" in img_copy.info
                    ):
                        img_copy = img_copy.convert("RGBA")
                    else:
                        img_copy = img_copy.convert("RGB")

                    img_copy.thumbnail(
                        (DEFAULT_THUMB_MAX_EDGE, DEFAULT_THUMB_MAX_EDGE),
                        Image.Resampling.LANCZOS,
                    )
                    thumb_io = io.BytesIO()
                    img_copy.save(
                        thumb_io, format="WEBP", quality=DEFAULT_THUMB_QUALITY, method=4
                    )
                    with open(thumb_path, "wb") as tf:
                        tf.write(thumb_io.getvalue())
        except Exception as e:
            logger.error(f"生成缩略图异常 [{asset_id}]: {e}")
            return None

        # 提取结构化元数据并持久化物理绝对路径 (orig_path) 与带版本戳的大图访问路由
        file_mtime = file_path.stat().st_mtime
        metadata = MetadataParser.parse(img_bytes, file_path)
        metadata.update(
            {
                "id": asset_id,
                "orig_path": actual_resolved_path,
                "filename": actual_filename,
                "subfolder": subfolder,
                "width": width,
                "height": height,
                "file_size": len(raw_bytes),
                "created_at": file_mtime,
                "thumb_url": f"/asset_triage/thumb/{thumb_filename}",
                "view_url": f"/asset_triage/view/{asset_id}?t={int(file_mtime * 1000)}",
            }
        )

        try:
            with open(meta_path, "w", encoding="utf-8") as mf:
                json.dump(metadata, mf, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"写入元数据缓存失败 [{asset_id}]: {e}")

        return {
            "id": asset_id,
            "filename": metadata["filename"],
            "subfolder": metadata["subfolder"],
            "thumb_url": metadata["thumb_url"],
            "view_url": metadata["view_url"],
            "width": width,
            "height": height,
            "created_at": metadata["created_at"],
            "model": metadata["model"],
            "seed": metadata["seed"],
            "cfg": metadata["cfg"],
            "steps": metadata["steps"],
        }
