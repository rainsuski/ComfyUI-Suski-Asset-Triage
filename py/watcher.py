# py/watcher.py
"""
项目代号: Asset Triage
文件功能: Hook PromptServer.send_sync 消息总线，
          智能匹配原生 Preview (temp) 与原生 Save Image (自定义暂存目录)，
          无阻塞派发预处理任务并通过 WebSocket 广播。
"""

from concurrent.futures import ThreadPoolExecutor
import logging
from pathlib import Path
from typing import Any, Dict
import folder_paths

from server import PromptServer
from ..config import WS_EVENT_ITEM_ADDED, get_staging_dir, is_custom_staging_enabled
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
        """解析 executed 数据包并根据暂存仓库策略分流处理"""
        output_data = data.get("output", {})
        if not isinstance(output_data, dict):
            return

        images = output_data.get("images", [])
        if not isinstance(images, list):
            return

        staging_dir = get_staging_dir()
        custom_enabled = is_custom_staging_enabled()

        current_output_dir = Path(folder_paths.get_output_directory()).resolve()
        current_temp_dir = Path(folder_paths.get_temp_directory()).resolve()

        for img_info in images:
            if not isinstance(img_info, dict):
                continue

            img_type = img_info.get("type", "")
            filename = img_info.get("filename", "")
            subfolder = img_info.get("subfolder", "")
            if not filename:
                continue

            # 分支 1: 用户启用了自定义暂存目录 -> 捕获保存到该目录下的 output 图片
            if custom_enabled:
                if img_type == "output":
                    file_path = (current_output_dir / subfolder / filename).resolve()
                    try:
                        # 检查落盘文件是否处于用户配置的暂存目录树中
                        if file_path.is_file() and file_path.is_relative_to(
                            staging_dir
                        ):
                            rel_parent = file_path.relative_to(staging_dir).parent
                            norm_subfolder = (
                                str(rel_parent) if rel_parent != Path(".") else ""
                            )
                            _executor.submit(
                                cls._async_process_and_broadcast,
                                file_path,
                                norm_subfolder,
                                filename,
                            )
                    except Exception as e:
                        logger.warning(f"核验自定义暂存文件路径异常 [{file_path}]: {e}")

            # 分支 2: 默认模式 (留空) -> 仅捕获原生 temp 预览图片
            else:
                if img_type == "temp":
                    file_path = (current_temp_dir / subfolder / filename).resolve()
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
                PromptServer.instance.send_sync(WS_EVENT_ITEM_ADDED, item_data)
                logger.info(f"新资产已就绪并广播: {item_data['id']}")
        except Exception as e:
            logger.error(f"异步预处理执行失败 [{filename}]: {e}")
