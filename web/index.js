// web/index.js
/**
 * 项目代号: Asset Triage (ComfyUI-Suski-Asset-Triage)
 * 文件功能: ComfyUI 前端 Extension 扩展主入口：
 *          全量实例化通信总线、顶栏图标、工作台模态框、转存浮层、设置浮层、确认销毁浮层与快捷键系统。
 */

import { app } from "/scripts/app.js";
import { TriageApi } from "./services/api.js";
import { store } from "./services/store.js";
import { TriageWebSocket } from "./services/ws.js";
import { TopbarBadgeWidget } from "./components/topbar_badge.js";
import { TriageModal } from "./components/triage_modal.js";
import { ExportDialog } from "./components/export_dialog.js";
import { SettingsDialog } from "./components/settings_dialog.js";
import { ConfirmDialog } from "./components/confirm_dialog.js";
import { KeybindingManager } from "./services/keybindings.js";

/**
 * 动态加载样式表
 */
function loadStyleSheet(href) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = href;
  document.head.appendChild(link);
}

loadStyleSheet(new URL("./styles/main.css", import.meta.url).href);

/**
 * 轻量全局 Toast 提示器
 */
function showToast(message, type = "success") {
  let toast = document.querySelector(".at-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "at-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `at-toast active ${type}`;
  setTimeout(() => {
    toast.classList.remove("active");
  }, 2500);
}

// 注册 ComfyUI 前端插件
app.registerExtension({
  name: "ComfyUI.Suski.AssetTriage",

  async setup() {
    console.log("[AssetTriage] 开始全量装配插件系统...");

    // 1. 初始化 WebSocket 消息通道
    TriageWebSocket.init();

    // 2. 实例化顶栏红点图标入口
    const topbarWidget = new TopbarBadgeWidget();
    topbarWidget.mount();

    // 3. 实例化转存参数确认弹窗
    const exportDialog = new ExportDialog({
      onConfirm: async (items, preset, category) => {
        const exportPayload = items.map((i) => ({ id: i.id, category }));
        const idsToRemove = items.map((i) => i.id);

        const backupItems = [...store.items];
        store.optimisticRemove(idsToRemove);
        showToast(`已提交转存 ${idsToRemove.length} 张图片...`);

        const res = await TriageApi.exportAssets(exportPayload, preset);
        if (res.success) {
          showToast(`转存完成，已清空 ${res.exported.length} 张图片。`, "success");
        } else {
          const failedIds = new Set(res.failed.map((f) => f.id));
          const restoredItems = backupItems.filter((i) => failedIds.has(i.id));
          restoredItems.forEach((item) => store.addItem(item, false));
          showToast(`部分图片转存失败，已恢复 ${res.failed.length} 项到待审队列。`, "error");
        }
      }
    });

    // 4. 实例化全局偏好设置弹窗
    const settingsDialog = new SettingsDialog({
      onSaved: () => showToast("全局配置已保存生效", "success")
    });

    // 5. 实例化优雅暗黑废弃确认弹窗 (终结原生 confirm)
    const confirmDialog = new ConfirmDialog();

    // 6. 实例化审片工作台 Modal 核心容器
    const modal = new TriageModal({
      onOpenSettings: () => settingsDialog.open(),
      onExportBatch: () => {
        const selectedList = store.items.filter((i) => store.selectedIds.has(i.id));
        if (selectedList.length === 0) return;
        exportDialog.open(selectedList);
      },
      onExportSingle: () => {
        if (!store.activeItem) return;
        exportDialog.open([store.activeItem]);
      },
      onDeleteBatch: async () => {
        const selectedIds = Array.from(store.selectedIds);
        if (selectedIds.length === 0) return;

        if (store.settings.confirm_delete !== false) {
          const ok = await confirmDialog.prompt({
            title: "彻底废弃所选资产",
            count: selectedIds.length
          });
          if (!ok) return;
        }

        store.optimisticRemove(selectedIds);
        showToast(`已彻底销毁 ${selectedIds.length} 张资产`, "success");
        await TriageApi.deleteAssets(selectedIds);
      },
      onDeleteSingle: async () => {
        if (!store.activeItem) return;
        const id = store.activeItem.id;

        if (store.settings.confirm_delete !== false) {
          const ok = await confirmDialog.prompt({
            title: "彻底废弃当前资产",
            count: 1
          });
          if (!ok) return;
        }

        store.optimisticRemove([id]);
        showToast(`已废弃销毁`, "success");
        await TriageApi.deleteAssets([id]);
      }
    });

    // 7. 初始化并挂载全局快捷键系统
    KeybindingManager.init({
      onExportBatch: () => modal.options.onExportBatch(),
      onExportSingle: () => modal.options.onExportSingle(),
      onDeleteBatch: () => modal.options.onDeleteBatch(),
      onDeleteSingle: () => modal.options.onDeleteSingle(),
      onPrevItem: () => modal.navigatePrev(),
      onNextItem: () => modal.navigateNext()
    });

    // 8. 冷启动初始数据同步
    try {
      const [items, presets, settings] = await Promise.all([
        TriageApi.getItems(),
        TriageApi.getPresets(),
        TriageApi.getSettings()
      ]);

      store.setPresets(presets);
      store.settings = settings || {};
      store.setItems(items);

      console.log(`[AssetTriage] 全系统装配完成，待审有效资产: ${items.length}`);
    } catch (err) {
      console.error("[AssetTriage] 启动数据同步异常:", err);
    }
  }
});