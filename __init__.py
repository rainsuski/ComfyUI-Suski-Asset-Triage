# __init__.py
"""
项目代号: Asset Triage (ComfyUI-Suski-Asset-Triage)
文件功能: 插件主入口：挂载 Web 资源目录、注册 REST API 路由、启动 ComfyUI 事件 Hook 与冷启动 GC 对齐。
"""

import logging

from .py import AssetCleaner, AssetTriageRoutes, ComfyEventWatcher

# 配置插件专属 Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AssetTriage")

# 1. 注册前端静态资源目录 (ComfyUI 标准扩展 API)
WEB_DIRECTORY = "./web"

# 2. 插件遵循零侵入原则，不注入画布节点
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 3. 挂载 aiohttp RESTful API 路由
AssetTriageRoutes.register_routes()

# 4. 启动 ComfyUI 内部 WebSocket 事件拦截钩子
ComfyEventWatcher.init_hook()

# 5. 执行冷启动孤儿缓存清理与数据对齐
try:
    AssetCleaner.reconcile_on_startup()
except Exception as e:
    logger.error(f"执行冷启动对齐异常: {e}")

logger.info("ComfyUI-Suski-Asset-Triage (资产审片与转存流管理器) 全量服务初始化完毕。")
