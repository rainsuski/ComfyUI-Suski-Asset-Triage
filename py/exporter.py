# py/exporter.py
"""
项目代号: Asset Triage
文件功能: 转存调度器：解析自由多层模板、%token:N% 切片截断、
          全格式画质控制 (PNG/WebP/JPEG)、元数据注入 (Workflow/A1111/LoRA/EXIF) 与防重名。
"""

import hashlib
import io
import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, PngImagePlugin

import folder_paths

from .cleaner import AssetCleaner
from .presets import PresetManager

logger = logging.getLogger("AssetTriage.Exporter")

_export_lock = threading.Lock()


class AssetExporter:
    """资产转存核心引擎"""

    _hash_cache: Dict[str, str] = {}

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
            embed_recipe = preset.get("embed_lora_recipe", False)
            quality = max(1, min(100, int(preset.get("quality", 95))))

            with open(temp_file, "rb") as f:
                img_bytes = io.BytesIO(f.read())

            with Image.open(img_bytes) as img:
                save_kwargs: Dict[str, Any] = {}
                param_str = cls._build_parameter_string(
                    meta,
                    embed_lora=embed_lr,
                    embed_recipe=embed_recipe,
                    img_size=img.size,
                )

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
                    # 优先写入标准 parameters 块，保证各类解析工具第一顺位命中
                    if embed_pm and param_str:
                        pnginfo.add_text("parameters", param_str)

                    # 对齐 ComfyUI 官方标准序列化 (使用标准 ASCII 转义，杜绝非 Latin-1 字符导致解析器崩溃)
                    if embed_wf and "raw_workflow" in meta:
                        pnginfo.add_text(
                            "workflow",
                            json.dumps(meta["raw_workflow"]),
                        )

                    if embed_pm and "raw_prompt" in meta:
                        pnginfo.add_text(
                            "prompt",
                            json.dumps(meta["raw_prompt"]),
                        )

                    # 若存在 DataflowProbe 血统元数据，转存时继承写入 PNG 文本块
                    if meta.get("raw_lineage"):
                        settings = PresetManager.get_settings()
                        lineage_key = settings.get("lineage_key", "dataflow_lineage")
                        pnginfo.add_text(
                            lineage_key,
                            json.dumps(meta["raw_lineage"]),
                        )

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
        """解析带 Token 与切片的模板字符串，优先取用配置指定的 Stage 阶段参数"""
        now = datetime.now()

        # 根据配置项提取指定阶段，默认 stage 0
        settings = PresetManager.get_settings()
        stage_idx = int(settings.get("lineage_export_stage", 0))
        stages = meta.get("stages", [])
        target_stage = (
            stages[stage_idx]
            if stages and 0 <= stage_idx < len(stages)
            else (stages[0] if stages else {})
        )

        raw_model = str(target_stage.get("model", meta.get("model", "Unknown")))
        model_name = Path(raw_model).stem

        token_map = {
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H%M%S"),
            "model": model_name,
            "sampler": str(
                target_stage.get("sampler_name", meta.get("sampler_name", "Unknown"))
            ),
            "scheduler": str(
                target_stage.get("scheduler", meta.get("scheduler", "Unknown"))
            ),
            "seed": str(target_stage.get("seed", meta.get("seed", 0))),
            "cfg": str(target_stage.get("cfg", meta.get("cfg", 0.0))),
            "steps": str(target_stage.get("steps", meta.get("steps", 0))),
            "stage": str(target_stage.get("stage_name", f"Stage_{stage_idx + 1}")),
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
    def _calculate_autov2_hash(cls, file_path: Path) -> str:
        """计算 A1111/Civitai 规范的 10 位 AutoV2 大写 SHA256 哈希 (带内存缓存)"""
        p_str = str(file_path.resolve())
        if p_str in cls._hash_cache:
            return cls._hash_cache[p_str]

        try:
            hasher = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    hasher.update(chunk)
            h = hasher.hexdigest()[:10].upper()
            cls._hash_cache[p_str] = h
            return h
        except Exception as e:
            logger.warning(f"计算模型 Hash 异常 [{file_path}]: {e}")
            return ""

    @classmethod
    def _find_model_file(cls, category: str, name: str) -> Optional[Path]:
        """定位本地模型文件绝对路径"""
        if not name or name == "Unknown":
            return None

        # 先通过原生接口精准解析
        exact = folder_paths.get_full_path(category, name)
        if exact and Path(exact).is_file():
            return Path(exact)

        # 遍历该分类已知路径做前缀或去扩展名匹配
        clean_name = Path(name).stem.lower()
        candidates = folder_paths.get_filename_list(category)
        for c in candidates:
            if Path(c).stem.lower() == clean_name:
                resolved = folder_paths.get_full_path(category, c)
                if resolved and Path(resolved).is_file():
                    return Path(resolved)
        return None

    @classmethod
    def _read_companion_metadata(cls, file_path: Optional[Path]) -> Dict[str, Any]:
        """读取 LoRA Manager 本地伴随文件 (.metadata.json / .civitai.info / .json)"""
        if not file_path or not file_path.is_file():
            return {}

        candidates = [
            file_path.with_name(f"{file_path.stem}.metadata.json"),
            file_path.with_name(f"{file_path.name}.metadata.json"),
            file_path.with_name(f"{file_path.stem}.civitai.info"),
            file_path.with_suffix(".json"),
        ]

        for p in candidates:
            if p.is_file():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            return data
                except Exception:
                    pass
        return {}

    @classmethod
    def _resolve_recipe_metadata(
        cls, loras: List[Dict[str, Any]], model_name: str
    ) -> Tuple[Dict[str, str], List[Dict[str, Any]]]:
        """从本地磁盘定位模型及 LoRA Manager 伴随元数据，组装 Hashes 与 Civitai resources"""
        hashes_dict: Dict[str, str] = {}
        civitai_resources: List[Dict[str, Any]] = []

        # 1. 尝试解析底模 Hash
        model_file = cls._find_model_file(
            "checkpoints", model_name
        ) or cls._find_model_file("diffusion_models", model_name)
        if model_file:
            m_comp = cls._read_companion_metadata(model_file)
            m_hash = ""
            if m_comp and isinstance(m_comp.get("hashes"), dict):
                m_hash = (
                    m_comp["hashes"].get("AutoV2")
                    or m_comp["hashes"].get("SHA256", "")[:10].upper()
                )
            if not m_hash:
                m_hash = cls._calculate_autov2_hash(model_file)
            if m_hash:
                hashes_dict["model"] = m_hash

        # 2. 依次解析各 LoRA
        for lora in loras:
            l_name = lora.get("name") or lora.get("lora_name") or ""
            if not l_name or l_name == "Unknown":
                continue

            strength = lora.get("strength", 1.0)
            lora_file = cls._find_model_file("loras", l_name)
            companion_meta = (
                cls._read_companion_metadata(lora_file) if lora_file else {}
            )

            # 计算或提取 Hash
            l_hash = ""
            if companion_meta:
                h_obj = companion_meta.get("hashes", {})
                if isinstance(h_obj, dict):
                    l_hash = h_obj.get("AutoV2") or h_obj.get("SHA256", "")[:10].upper()
            if not l_hash and lora_file:
                l_hash = cls._calculate_autov2_hash(lora_file)

            if l_hash:
                hashes_dict[f"LORA:{Path(l_name).stem}"] = l_hash

            # 组装 Civitai resources 项
            res_item: Dict[str, Any] = {"weight": strength}
            air = companion_meta.get("air", "")
            if not air and companion_meta.get("modelId") and companion_meta.get("id"):
                base_m = companion_meta.get("baseModel", "anima").lower()
                air = f"urn:air:{base_m}:lora:civitai:{companion_meta['modelId']}@{companion_meta['id']}"

            if air:
                res_item["air"] = air
            ver_name = companion_meta.get("versionName") or companion_meta.get("name")
            if ver_name:
                res_item["versionName"] = str(ver_name)
            elif not air:
                res_item["modelName"] = Path(l_name).stem

            civitai_resources.append(res_item)

        return hashes_dict, civitai_resources

    @classmethod
    def _build_parameter_string(
        cls,
        meta: Dict[str, Any],
        embed_lora: bool = True,
        embed_recipe: bool = False,
        img_size: Optional[Tuple[int, int]] = None,
    ) -> str:
        settings = PresetManager.get_settings()
        stage_idx = int(settings.get("lineage_export_stage", 0))
        stages = meta.get("stages", [])
        target_stage = (
            stages[stage_idx]
            if stages and 0 <= stage_idx < len(stages)
            else (stages[0] if stages else {})
        )

        pos = str(
            target_stage.get("positive_prompt", meta.get("positive_prompt", ""))
        ).strip()
        neg = str(
            target_stage.get("negative_prompt", meta.get("negative_prompt", ""))
        ).strip()
        steps = target_stage.get("steps", meta.get("steps", 0))
        sampler = str(
            target_stage.get("sampler_name", meta.get("sampler_name", "Unknown"))
        ).strip()
        scheduler = str(
            target_stage.get("scheduler", meta.get("scheduler", ""))
        ).strip()
        cfg = target_stage.get("cfg", meta.get("cfg", 0.0))
        seed = target_stage.get("seed", meta.get("seed", 0))
        model = str(target_stage.get("model", meta.get("model", "Unknown"))).strip()
        loras = target_stage.get("loras", meta.get("loras", []))

        # 1. 规范化 LoRA 标签：追加在正向提示词末尾（A1111 规范）
        if embed_lora and loras:
            lora_tags = []
            for l in loras:
                l_name = l.get("name", "lora")
                l_str = l.get("strength", 1.0)
                tag = f"<lora:{l_name}:{l_str}>"
                if f"<lora:{l_name}:" not in pos:
                    lora_tags.append(tag)
            if lora_tags:
                lora_block = "\n".join(lora_tags)
                pos = f"{pos}\n{lora_block}" if pos else lora_block

        # 2. 规范化 Sampler + Scheduler 组合表示
        if scheduler and scheduler.lower() not in ("unknown", "none"):
            sampler_display = f"{sampler} {scheduler}".strip()
        else:
            sampler_display = sampler

        # 3. 规范化分辨率 Size 字段
        width, height = 0, 0
        if img_size and len(img_size) == 2:
            width, height = img_size
        else:
            width = meta.get("width", 0)
            height = meta.get("height", 0)
        size_str = f"{width}x{height}" if width and height else ""

        # 4. 构建标准 A1111 风格的逗号分隔键值对参数行
        param_parts = [
            f"Steps: {steps}",
            f"Sampler: {sampler_display}",
            f"CFG scale: {cfg}",
            f"Seed: {seed}",
        ]
        if size_str:
            param_parts.append(f"Size: {size_str}")
        if model and model != "Unknown":
            param_parts.append(f"Model: {model}")

        # 5. 若开启了保存为 LoRA Manager 配方，解析并追加 Hashes 与 Civitai resources
        if embed_recipe:
            hashes_dict, civitai_resources = cls._resolve_recipe_metadata(loras, model)
            if hashes_dict:
                param_parts.append(
                    f"Hashes: {json.dumps(hashes_dict, separators=(',', ':'))}"
                )

            param_parts.append("Version: ComfyUI")

            if civitai_resources:
                param_parts.append(
                    f"Civitai resources: {json.dumps(civitai_resources, separators=(',', ':'))}"
                )
        else:
            param_parts.append("Version: ComfyUI")

        param_line = ", ".join(param_parts)
        param_str = f"{pos}\nNegative prompt: {neg}\n{param_line}"

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
