# py/watcher.py
"""
项目代号: Asset Triage
文件功能: Hook PromptServer.send_sync 消息总线，
          捕获执行完成事件，无阻塞派发预处理任务并通过 WebSocket 广播。
"""

from concurrent.futures import ThreadPoolExecutor
import logging
from pathlib import Path
from typing import Any, Dict

from server import PromptServer
from ..config import COMFY_TEMP_DIR, WS_EVENT_ITEM_ADDED
from .processor import ImageProcessor

logger = logging.getLogger("AssetTriage.Watcher")

# 后台工作线程池
_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="AssetTriageWorker")


class ComfyEventWatcher:
    """ComfyUI 执行事件监听与任务分发器"""

    _hooked = False

    @classmethod
    def init_hook(cls) -> None:
        """挂载 Hook 到 ComfyUI 原生 PromptServer 实例"""
        if cls._hooked:
            return

        server_instance = PromptServer.instance
        original_send_sync = server_instance.send_sync

        def patched_send_sync(
            event: str, data: Dict[str, Any], sid: Any = None
        ) -> None:
            original_send_sync(event, data, sid)
            try:
                if event == "executed" and isinstance(data, dict):
                    cls._handle_executed_event(data)
            except Exception as e:
                logger.error(f"处理 executed 事件钩子异常: {e}")

        server_instance.send_sync = patched_send_sync
        cls._hooked = True
        logger.info("Asset Triage 事件驱动拦截总线初始化完毕 [Hook Active]")

    @classmethod
    def _handle_executed_event(cls, data: Dict[str, Any]) -> None:
        """解析 executed 数据包"""
        output_data = data.get("output", {})
        if not isinstance(output_data, dict):
            return

        images = output_data.get("images", [])
        if not isinstance(images, list):
            return

        for img_info in images:
            if not isinstance(img_info, dict):
                continue

            img_type = img_info.get("type", "")
            if img_type != "temp":
                continue

            filename = img_info.get("filename", "")
            subfolder = img_info.get("subfolder", "")
            if not filename:
                continue

            file_path = (COMFY_TEMP_DIR / subfolder / filename).resolve()
            _executor.submit(
                cls._async_process_and_broadcast, file_path, subfolder, filename
            )

    @staticmethod
    def _async_process_and_broadcast(
        file_path: Path, subfolder: str, filename: str
    ) -> None:
        """后台预处理并推送广播通知"""
        try:
            item_data = ImageProcessor.process_file(file_path, subfolder, filename)
            if item_data:
                # PromptServer.send_sync 本身即为内置的跨线程安全队列发送方法
                PromptServer.instance.send_sync(WS_EVENT_ITEM_ADDED, item_data)
                logger.info(f"新资产已就绪并广播: {item_data['id']}")
        except Exception as e:
            logger.error(f"异步预处理执行失败 [{filename}]: {e}")
