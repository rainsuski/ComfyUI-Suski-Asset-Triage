# py/exporter.py
"""
项目代号: Asset Triage
文件功能: 转存调度器：解析占位符 Token、多格式转码 (PNG/WebP/JPEG)、
          EXIF/XMP/PNGinfo 元数据注入、防重名与并发安全锁、转存后连带清除。
"""

from datetime import datetime
import io
import json
import logging
from pathlib import Path
import re
import shutil
import threading
from typing import Any, Dict, List, Tuple
from PIL import Image, PngImagePlugin

from ..config import COMFY_OUTPUT_DIR
from .cleaner import AssetCleaner

logger = logging.getLogger("AssetTriage.Exporter")

_export_lock = threading.Lock()


class AssetExporter:
    """资产转存核心引擎"""

    @classmethod
    def export_assets(
        cls, items: List[Dict[str, Any]], preset: Dict[str, Any]
    ) -> Dict[str, Any]:
        """批量/单张转存总入口"""
        exported = []
        failed = []

        with _export_lock:
            for item_info in items:
                asset_id = item_info.get("id", "")
                category = item_info.get("category", "")

                res, err_msg = cls._export_single_locked(asset_id, category, preset)
                if res:
                    exported.append(asset_id)
                else:
                    failed.append({"id": asset_id, "error": err_msg})

        return {"success": len(failed) == 0, "exported": exported, "failed": failed}

    @classmethod
    def _export_single_locked(
        cls, asset_id: str, category: str, preset: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """单文件转存逻辑"""
        temp_file, meta_file, _ = AssetCleaner._resolve_paths_by_id(asset_id)
        if not temp_file.is_file():
            return False, "原临时文件已不存在"

        meta = {}
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
            except Exception as e:
                logger.warning(f"读取元数据缓存失败: {e}")

        export_format = preset.get("format", "PNG").upper()
        target_dir = cls._build_target_directory(
            preset.get("path_template", "%date%"), category, meta
        )
        target_dir.mkdir(parents=True, exist_ok=True)

        target_stem = cls._build_target_filename(
            preset.get("name_template", "%date%_%seed%"), meta, target_dir
        )
        ext_map = {"PNG": ".png", "WEBP": ".webp", "JPEG": ".jpg", "JPG": ".jpg"}
        target_ext = ext_map.get(export_format, ".png")
        target_path = target_dir / f"{target_stem}{target_ext}"

        target_path = cls._ensure_unique_path(target_path)

        try:
            if export_format == "PNG" and temp_file.suffix.lower() == ".png":
                shutil.move(str(temp_file), str(target_path))
            else:
                with open(temp_file, "rb") as f:
                    img_bytes = io.BytesIO(f.read())

                with Image.open(img_bytes) as img:
                    save_kwargs: Dict[str, Any] = {}
                    quality = int(preset.get("quality", 95))

                    if export_format in ("JPEG", "JPG"):
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        save_kwargs["format"] = "JPEG"
                        save_kwargs["quality"] = quality
                    elif export_format == "WEBP":
                        save_kwargs["format"] = "WEBP"
                        save_kwargs["quality"] = quality
                    else:
                        save_kwargs["format"] = "PNG"

                    if preset.get("embed_workflow") or preset.get("embed_prompt"):
                        cls._inject_metadata(img, save_kwargs, meta, preset)

                    img.save(target_path, **save_kwargs)

                temp_file.unlink(missing_ok=True)

        except Exception as e:
            logger.error(f"转存写入文件失败 [{asset_id} -> {target_path}]: {e}")
            return False, str(e)

        AssetCleaner.delete_single(asset_id)
        logger.info(f"资产转存成功: {asset_id} -> {target_path}")
        return True, ""

    @staticmethod
    def _build_target_directory(
        template: str, category: str, meta: Dict[str, Any]
    ) -> Path:
        """根据模板生成转存绝对路径"""
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H%M%S")

        cleaned_cat = re.sub(r'[\\/:*?"<>|]', "_", category).strip() if category else ""

        path_str = template.replace("%date%", date_str)
        path_str = path_str.replace("%time%", time_str)
        path_str = path_str.replace("%category%", cleaned_cat or "Default")
        path_str = path_str.replace("%model%", str(meta.get("model", "Unknown")))

        path_str = path_str.strip("/\\")
        return (COMFY_OUTPUT_DIR / path_str).resolve()

    @classmethod
    def _build_target_filename(
        cls, template: str, meta: Dict[str, Any], target_dir: Path
    ) -> str:
        """根据 Token 解析生成文件名"""
        now = datetime.now()
        name = template.replace("%date%", now.strftime("%Y-%m-%d"))
        name = name.replace("%time%", now.strftime("%H%M%S"))
        name = name.replace("%model%", str(meta.get("model", "Unknown")))
        name = name.replace("%sampler%", str(meta.get("sampler_name", "Unknown")))
        name = name.replace("%scheduler%", str(meta.get("scheduler", "Unknown")))
        name = name.replace("%seed%", str(meta.get("seed", 0)))
        name = name.replace("%cfg%", str(meta.get("cfg", 0.0)))
        name = name.replace("%steps%", str(meta.get("steps", 0)))

        if "%count%" in name:
            count = cls._calculate_next_count(target_dir)
            name = name.replace("%count%", f"{count:03d}")

        name = re.sub(r'[\\/:*?"<>|]', "_", name).strip()
        return name or f"export_{now.strftime('%Y%m%d_%H%M%S')}"

    @staticmethod
    def _calculate_next_count(target_dir: Path) -> int:
        """扫描目标目录，计算下一个可用自增序列号"""
        if not target_dir.exists():
            return 1
        existing_files = list(target_dir.iterdir())
        return len(existing_files) + 1

    @staticmethod
    def _ensure_unique_path(target_path: Path) -> Path:
        """防重名追加序列保护"""
        if not target_path.exists():
            return target_path

        parent = target_path.parent
        stem = target_path.stem
        suffix = target_path.suffix
        counter = 1

        while True:
            new_path = parent / f"{stem}_{counter:02d}{suffix}"
            if not new_path.exists():
                return new_path
            counter += 1

    @classmethod
    def _inject_metadata(
        cls,
        img: Image.Image,
        save_kwargs: Dict[str, Any],
        meta: Dict[str, Any],
        preset: Dict[str, Any],
    ) -> None:
        """注入元数据"""
        fmt = save_kwargs.get("format", "PNG")

        pos = meta.get("positive_prompt", "")
        neg = meta.get("negative_prompt", "")
        steps = meta.get("steps", 0)
        sampler = meta.get("sampler_name", "Unknown")
        cfg = meta.get("cfg", 0.0)
        seed = meta.get("seed", 0)
        model = meta.get("model", "Unknown")

        param_str = f"{pos}\nNegative prompt: {neg}\nSteps: {steps}, Sampler: {sampler}, CFG scale: {cfg}, Seed: {seed}, Model: {model}"

        if preset.get("embed_lora") and meta.get("loras"):
            lora_strs = [f"<lora:{l['name']}:{l['strength']}>" for l in meta["loras"]]
            param_str += f", LoRA: {', '.join(lora_strs)}"

        if fmt == "PNG":
            pnginfo = PngImagePlugin.PngInfo()
            if preset.get("embed_prompt") and "raw_prompt" in meta:
                pnginfo.add_text("prompt", json.dumps(meta["raw_prompt"]))
            if preset.get("embed_workflow") and "raw_workflow" in meta:
                pnginfo.add_text("workflow", json.dumps(meta["raw_workflow"]))
            pnginfo.add_text("parameters", param_str)
            save_kwargs["pnginfo"] = pnginfo

        elif fmt in ("JPEG", "WEBP"):
            try:
                exif = img.getexif()
                exif[0x9286] = param_str.encode("utf-8")
                save_kwargs["exif"] = exif
            except Exception as e:
                logger.warning(f"注入 EXIF 元数据失败: {e}")
