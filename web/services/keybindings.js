// web/services/keybindings.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 快捷键拓扑调度器（全量无冲突映射）：
 *          Esc, X, Enter, Space, Delete, Backspace, Ctrl+A, Ctrl+I, ←, →
 */

import { store } from "./store.js";

export class KeybindingManager {
  /**
   * 挂载全局键盘事件路由
   * @param {Object} handlers 
   */
  static init(handlers = {}) {
    window.addEventListener(
      "keydown",
      (e) => {
        // 模态框未开启时完全放行，杜绝污染 ComfyUI 画布
        if (!store.isModalOpen) return;

        // 若用户正处于输入框焦点，放行所有通用键
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (["input", "textarea", "select"].includes(activeTag)) {
          if (e.key === "Escape") {
            document.activeElement.blur();
          }
          return;
        }

        const key = e.key;
        const isCtrl = e.ctrlKey || e.metaKey;

        // 1. Esc: 退出精审回到总览 / 关闭工作台
        if (key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (store.viewMode === "inspector") {
            store.setViewMode(store.settings.default_view || "masonry");
          } else {
            store.setModalOpen(false);
          }
          return;
        }

        // 2. X: 精审模式标记/取消勾选当前图
        if (key.toLowerCase() === "x" && !isCtrl) {
          e.preventDefault();
          if (store.viewMode === "inspector" && store.activeItem) {
            store.toggleSelect(store.activeItem.id);
          }
          return;
        }

        // 3. Enter / Space: 执行转存
        if (key === "Enter" || key === " ") {
          e.preventDefault();
          if (store.viewMode === "inspector") {
            if (handlers.onExportSingle) handlers.onExportSingle();
          } else {
            if (handlers.onExportBatch) handlers.onExportBatch();
          }
          return;
        }

        // 4. Delete / Backspace: 物理废弃
        if (key === "Delete" || key === "Backspace") {
          e.preventDefault();
          if (store.viewMode === "inspector") {
            if (handlers.onDeleteSingle) handlers.onDeleteSingle();
          } else {
            if (handlers.onDeleteBatch) handlers.onDeleteBatch();
          }
          return;
        }

        // 5. Ctrl + A: 全选 (仅在总览模式生效)
        if (isCtrl && key.toLowerCase() === "a") {
          if (store.viewMode !== "inspector") {
            e.preventDefault();
            store.selectAll();
          }
          return;
        }

        // 6. Ctrl + I: 反选 (仅在总览模式生效)
        if (isCtrl && key.toLowerCase() === "i") {
          if (store.viewMode !== "inspector") {
            e.preventDefault();
            store.invertSelection();
          }
          return;
        }

        // 7. ← / →: 精审模式切换上一张 / 下一张
        if (store.viewMode === "inspector") {
          if (key === "ArrowLeft") {
            e.preventDefault();
            if (handlers.onPrevItem) handlers.onPrevItem();
          } else if (key === "ArrowRight") {
            e.preventDefault();
            if (handlers.onNextItem) handlers.onNextItem();
          }
        }
      },
      true // 捕获阶段拦截
    );

    console.log("[AssetTriage] 全局快捷键拓扑体系初始化就绪");
  }
}