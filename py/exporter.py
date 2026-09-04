# py/exporter.py
"""
项目代号: Asset Triage
文件功能: 转存调度器：解析自由多层模板、%token:N% 切片截断、
          全格式画质控制 (PNG/WebP/JPEG)、元数据注入 (Workflow/A1111/LoRA/EXIF) 与防重名。
"""

import io
import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image, PngImagePlugin

import folder_paths

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
                res, err_msg = cls._export_single_locked(asset_id, preset)
                if res:
                    exported.append(asset_id)
                else:
                    failed.append({"id": asset_id, "error": err_msg})

        return {"success": len(failed) == 0, "exported": exported, "failed": failed}

    @classmethod
    def _export_single_locked(
        cls, asset_id: str, preset: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """单文件转存逻辑"""
        temp_file, meta_file, _ = AssetCleaner._resolve_paths_by_id(asset_id)

        # 遇到文件丢失，立即执行自愈 GC，清理掉死缓存
        if not temp_file.is_file():
            AssetCleaner.delete_single(asset_id)
            logger.warning(
                f"定位原临时文件失败，已自动销毁幽灵缓存 [asset_id: {asset_id}]"
            )
            return False, f"原临时文件已在外部被清理销毁 ({temp_file.name})"

        meta = {}
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
            except Exception as e:
                logger.warning(f"读取元数据缓存失败: {e}")

        # 1. 提取模板与扩展名
        template = preset.get("template", "%date%/%model:30%_%seed%_%count%").strip()
        export_format = preset.get("format", "PNG").upper()
        ext_map = {"PNG": ".png", "WEBP": ".webp", "JPEG": ".jpg", "JPG": ".jpg"}
        target_ext = ext_map.get(export_format, ".png")

        # 2. 自由路径与文件名解析
        target_dir, target_stem = cls._resolve_path_and_stem(template, meta)
        target_dir.mkdir(parents=True, exist_ok=True)

        # 3. 解析自增序号 %count%
        if "%count%" in target_stem:
            count = cls._calculate_next_count(target_dir)
            target_stem = target_stem.replace("%count%", f"{count:03d}")

        target_path = target_dir / f"{target_stem}{target_ext}"
        target_path = cls._ensure_unique_path(target_path)

        # 4. 执行文件转码、画质控制与元数据注入
        try:
            embed_wf = preset.get("embed_workflow", True)
            embed_pm = preset.get("embed_prompt", True)
            embed_lr = preset.get("embed_lora", True)
            quality = max(1, min(100, int(preset.get("quality", 95))))

            with open(temp_file, "rb") as f:
                img_bytes = io.BytesIO(f.read())

            with Image.open(img_bytes) as img:
                save_kwargs: Dict[str, Any] = {}
                param_str = cls._build_parameter_string(meta, embed_lora=embed_lr)

                if export_format in ("JPEG", "JPG"):
                    if img.mode != "RGB":
                        img = img.convert("RGB")
                    save_kwargs["format"] = "JPEG"
                    save_kwargs["quality"] = quality
                    save_kwargs["subsampling"] = 0
                    if embed_pm or embed_wf:
                        cls._inject_exif_user_comment(img, save_kwargs, param_str)

                elif export_format == "WEBP":
                    save_kwargs["format"] = "WEBP"
                    save_kwargs["quality"] = quality
                    save_kwargs["method"] = 6
                    if quality == 100:
                        save_kwargs["lossless"] = True
                    if embed_pm or embed_wf:
                        cls._inject_exif_user_comment(img, save_kwargs, param_str)

                else:  # PNG
                    save_kwargs["format"] = "PNG"
                    compress_level = max(0, min(9, int((100 - quality) / 100.0 * 9)))
                    save_kwargs["compress_level"] = compress_level

                    pnginfo = PngImagePlugin.PngInfo()
                    if embed_pm and "raw_prompt" in meta:
                        pnginfo.add_text(
                            "prompt", json.dumps(meta["raw_prompt"], ensure_ascii=False)
                        )
                    if embed_wf and "raw_workflow" in meta:
                        pnginfo.add_text(
                            "workflow",
                            json.dumps(meta["raw_workflow"], ensure_ascii=False),
                        )
                    if embed_pm and param_str:
                        pnginfo.add_text("parameters", param_str)
                    save_kwargs["pnginfo"] = pnginfo

                img.save(target_path, **save_kwargs)

            temp_file.unlink(missing_ok=True)

        except Exception as e:
            logger.error(
                f"转存写入文件失败 [{asset_id} -> {target_path}]: {e}", exc_info=True
            )
            return False, str(e)

        AssetCleaner.delete_single(asset_id)
        logger.info(f"资产转存成功: {asset_id} -> {target_path} (Quality: {quality})")
        return True, ""

    @classmethod
    def _resolve_path_and_stem(
        cls, template: str, meta: Dict[str, Any]
    ) -> Tuple[Path, str]:
        """解析带 Token 与切片的模板字符串"""
        now = datetime.now()

        raw_model = str(meta.get("model", "Unknown"))
        model_name = Path(raw_model).stem

        token_map = {
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H%M%S"),
            "model": model_name,
            "sampler": str(meta.get("sampler_name", "Unknown")),
            "scheduler": str(meta.get("scheduler", "Unknown")),
            "seed": str(meta.get("seed", 0)),
            "cfg": str(meta.get("cfg", 0.0)),
            "steps": str(meta.get("steps", 0)),
        }

        def replace_token(match: re.Match) -> str:
            token_key = match.group(1).lower()
            slice_len = match.group(2)

            if token_key == "count":
                return "%count%"

            val = token_map.get(token_key, match.group(0))
            if slice_len is not None and token_key in token_map:
                try:
                    val = val[: int(slice_len)]
                except Exception:
                    pass
            return cls._sanitize_component(str(val))

        resolved = re.sub(r"%([a-zA-Z0-9_]+)(?::(\d+))?%", replace_token, template)
        resolved = resolved.replace("\\", "/")

        parts = [p.strip() for p in resolved.split("/") if p.strip()]

        current_output_dir = Path(folder_paths.get_output_directory()).resolve()

        if not parts:
            return current_output_dir, f"export_{now.strftime('%Y%m%d_%H%M%S')}"

        if len(parts) == 1:
            target_dir = current_output_dir
            target_stem = cls._sanitize_component(parts[0])
        else:
            sub_dirs = [cls._sanitize_component(p) for p in parts[:-1]]
            target_dir = current_output_dir.joinpath(*sub_dirs).resolve()
            target_stem = cls._sanitize_component(parts[-1])

        return target_dir, target_stem or f"export_{now.strftime('%Y%m%d_%H%M%S')}"

    @staticmethod
    def _sanitize_component(name: str) -> str:
        return re.sub(r'[\\/:*?"<>|]', "_", name).strip(". ")

    @staticmethod
    def _calculate_next_count(target_dir: Path) -> int:
        if not target_dir.exists():
            return 1
        existing_files = [f for f in target_dir.iterdir() if f.is_file()]
        return len(existing_files) + 1

    @staticmethod
    def _ensure_unique_path(target_path: Path) -> Path:
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
    def _build_parameter_string(
        cls, meta: Dict[str, Any], embed_lora: bool = True
    ) -> str:
        pos = meta.get("positive_prompt", "")
        neg = meta.get("negative_prompt", "")
        steps = meta.get("steps", 0)
        sampler = meta.get("sampler_name", "Unknown")
        cfg = meta.get("cfg", 0.0)
        seed = meta.get("seed", 0)
        model = meta.get("model", "Unknown")

        param_str = f"{pos}\nNegative prompt: {neg}\nSteps: {steps}, Sampler: {sampler}, CFG scale: {cfg}, Seed: {seed}, Model: {model}"

        if embed_lora and meta.get("loras"):
            lora_strs = [
                f"<lora:{l.get('name', 'lora')}:{l.get('strength', 1.0)}>"
                for l in meta["loras"]
            ]
            param_str += f", LoRA: {', '.join(lora_strs)}"

        return param_str

    @classmethod
    def _inject_exif_user_comment(
        cls, img: Image.Image, save_kwargs: Dict[str, Any], param_str: str
    ) -> None:
        try:
            exif = img.getexif()
            user_comment_bytes = b"UNICODE\x00" + param_str.encode("utf-8")
            exif[0x9286] = user_comment_bytes
            save_kwargs["exif"] = exif
        except Exception as e:
            logger.warning(f"注入 EXIF 元数据异常: {e}")
