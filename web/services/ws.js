// web/services/ws.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 挂载 ComfyUI 原生 WebSocket 事件监听，实时接收后端预处理就绪通知。
 */

import { api } from "/scripts/api.js";
import { store } from "./store.js";

export class TriageWebSocket {
  /**
   * 初始化 WebSocket 事件监听总线
   */
  static init() {
    // 监听 Asset Triage 专属广播事件: asset_triage_item_added
    api.addEventListener("asset_triage_item_added", (event) => {
      const itemData = event.detail;
      if (!itemData || !itemData.id) return;

      // 压入响应式 Store，自动触发顶栏数字更新与 Pop 动效
      store.addItem(itemData, true);
    });

    console.log("[AssetTriage] WebSocket 实时事件监听器挂载就绪");
  }
}