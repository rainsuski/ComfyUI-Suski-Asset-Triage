# py/routes.py
"""
项目代号: Asset Triage
文件功能: 注册 PromptServer 的 aiohttp RESTful API 路由，
          提供原图/缩略图流媒体服务、待审队列实时存活核验 (即时 GC)、转存/删除调度及设置读写。
"""

import json
import logging
import mimetypes

from aiohttp import web

from server import PromptServer

from ..config import CACHE_META_DIR, CACHE_THUMBS_DIR
from .cleaner import AssetCleaner
from .exporter import AssetExporter
from .presets import PresetManager

logger = logging.getLogger("AssetTriage.Routes")


class AssetTriageRoutes:
    """REST API 路由集中注册与分发器"""

    @classmethod
    def register_routes(cls) -> None:
        """挂载 API 端点到 ComfyUI 原生 PromptServer 应用实例"""
        app = PromptServer.instance.app

        app.router.add_get("/asset_triage/items", cls.handle_get_items)
        app.router.add_get("/asset_triage/thumb/{filename}", cls.handle_get_thumb)
        app.router.add_get("/asset_triage/view/{asset_id}", cls.handle_get_image)
        app.router.add_get("/asset_triage/meta/{asset_id}", cls.handle_get_meta)
        app.router.add_post("/asset_triage/export", cls.handle_export)
        app.router.add_post("/asset_triage/delete", cls.handle_delete)
        app.router.add_get("/asset_triage/presets", cls.handle_get_presets)
        app.router.add_post("/asset_triage/presets", cls.handle_save_presets)
        app.router.add_get("/asset_triage/settings", cls.handle_get_settings)
        app.router.add_post("/asset_triage/settings", cls.handle_save_settings)

        logger.info("Asset Triage RESTful API 路由注册就绪")

    @staticmethod
    async def handle_get_items(request: web.Request) -> web.Response:
        """GET /asset_triage/items (含磁盘物理存活核验，剔除外部清理造成的幽灵图片)"""
        items = []
        try:
            for meta_file in list(CACHE_META_DIR.glob("*.json")):
                asset_id = meta_file.stem
                try:
                    staging_file, _, _ = AssetCleaner._resolve_paths_by_id(asset_id)
                    if not staging_file.is_file():
                        AssetCleaner.delete_single(asset_id)
                        continue

                    with open(meta_file, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    created_at = data.get("created_at", 0)
                    base_view_url = data.get(
                        "view_url", f"/asset_triage/view/{asset_id}"
                    )
                    t_param = f"?t={int(created_at * 1000)}" if created_at else ""
                    view_url_with_t = (
                        base_view_url
                        if "?" in base_view_url
                        else f"{base_view_url}{t_param}"
                    )

                    items.append(
                        {
                            "id": data.get("id", asset_id),
                            "filename": data.get("filename"),
                            "subfolder": data.get("subfolder"),
                            "thumb_url": data.get("thumb_url"),
                            "view_url": view_url_with_t,
                            "width": data.get("width"),
                            "height": data.get("height"),
                            "created_at": created_at,
                            "model": data.get("model"),
                            "seed": data.get("seed"),
                            "cfg": data.get("cfg"),
                            "steps": data.get("steps"),
                        }
                    )
                except Exception as e:
                    logger.warning(f"读取元数据条目异常 [{meta_file.name}]: {e}")

            items.sort(key=lambda x: x["created_at"], reverse=True)
            return web.json_response({"success": True, "items": items})
        except Exception as e:
            logger.error(f"获取待审列表异常: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_get_thumb(request: web.Request) -> web.Response:
        """GET /asset_triage/thumb/{filename}"""
        filename = request.match_info.get("filename", "")
        thumb_path = (CACHE_THUMBS_DIR / filename).resolve()

        if not thumb_path.is_file():
            return web.Response(status=404, text="Thumbnail Not Found")

        try:
            with open(thumb_path, "rb") as f:
                content = f.read()

            headers = {
                "Content-Type": "image/webp",
                "Cache-Control": "public, max-age=31536000, immutable",
            }
            return web.Response(body=content, headers=headers)
        except Exception as e:
            logger.error(f"响应缩略图失败 [{filename}]: {e}")
            return web.Response(status=500, text="Internal Server Error")

    @staticmethod
    async def handle_get_image(request: web.Request) -> web.StreamResponse:
        """
        GET /asset_triage/view/{asset_id}
        专有原图预览通道: 严格禁用浏览器及中间层强缓存，杜绝覆写或同名临时文件显示陈旧大图
        """
        asset_id = request.match_info.get("asset_id", "")
        staging_file, _, _ = AssetCleaner._resolve_paths_by_id(asset_id)

        if not staging_file.is_file():
            return web.Response(status=404, text="Image Not Found")

        content_type, _ = mimetypes.guess_type(str(staging_file))
        content_type = content_type or "image/png"

        return web.FileResponse(
            staging_file,
            headers={
                "Content-Type": content_type,
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    @staticmethod
    async def handle_get_meta(request: web.Request) -> web.Response:
        """GET /asset_triage/meta/{asset_id}"""
        asset_id = request.match_info.get("asset_id", "")
        meta_file = CACHE_META_DIR / f"{asset_id}.json"

        if not meta_file.is_file():
            return web.json_response(
                {"success": False, "error": "Metadata Not Found"}, status=404
            )

        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return web.json_response({"success": True, "data": data})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_export(request: web.Request) -> web.Response:
        """POST /asset_triage/export"""
        try:
            body = await request.json()
            items = body.get("items", [])
            preset = body.get("preset", {})

            if not items:
                return web.json_response(
                    {"success": False, "error": "转存列表为空"}, status=400
                )

            result = AssetExporter.export_assets(items, preset)
            return web.json_response(result)
        except Exception as e:
            logger.error(f"处理转存请求异常: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_delete(request: web.Request) -> web.Response:
        """POST /asset_triage/delete"""
        try:
            body = await request.json()
            ids = body.get("ids", [])
            if not ids:
                return web.json_response(
                    {"success": False, "error": "删除列表为空"}, status=400
                )

            deleted = []
            failed = []
            for asset_id in ids:
                if AssetCleaner.delete_single(asset_id):
                    deleted.append(asset_id)
                else:
                    failed.append(asset_id)

            return web.json_response(
                {"success": len(failed) == 0, "deleted": deleted, "failed": failed}
            )
        except Exception as e:
            logger.error(f"处理废弃删除请求异常: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_get_presets(request: web.Request) -> web.Response:
        """GET /asset_triage/presets"""
        presets = PresetManager.get_presets()
        return web.json_response({"success": True, "presets": presets})

    @staticmethod
    async def handle_save_presets(request: web.Request) -> web.Response:
        """POST /asset_triage/presets"""
        try:
            body = await request.json()
            presets = body.get("presets", [])
            if PresetManager.save_presets(presets):
                return web.json_response({"success": True})
            return web.json_response(
                {"success": False, "error": "保存失败"}, status=500
            )
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_get_settings(request: web.Request) -> web.Response:
        """GET /asset_triage/settings"""
        settings = PresetManager.get_settings()
        return web.json_response({"success": True, "settings": settings})

    @staticmethod
    async def handle_save_settings(request: web.Request) -> web.Response:
        """POST /asset_triage/settings"""
        try:
            body = await request.json()
            settings = body.get("settings", {})
            if PresetManager.save_settings(settings):
                return web.json_response({"success": True})
            return web.json_response(
                {"success": False, "error": "保存失败"}, status=500
            )
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)
