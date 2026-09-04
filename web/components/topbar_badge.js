// web/components/topbar_badge.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 顶栏常驻收件箱入口组件：实现 ComfyUI 新旧版 UI 双模挂载，响应式更新红点角标与弹跳动画。
 */

import { store } from "../services/store.js";

export class TopbarBadgeWidget {
  constructor() {
    this.btnElement = null;
    this.badgeElement = null;
    this._initDom();
    this._bindStoreEvents();
  }

  /**
   * 构建 Minimal SVG 图标与 Badge DOM
   */
  _initDom() {
    const btn = document.createElement("button");
    btn.className = "comfy-menu-btn asset-triage-topbar-btn";
    btn.setAttribute("title", "待审资产 (0)");

    // 收件箱 / 选片盒 SVG 图标
    btn.innerHTML = `
      <svg class="asset-triage-icon" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5v-2h-5v2zm-5-4h10v-2H7v2zm0-4h10V7H7v2z"/>
      </svg>
      <span class="asset-triage-badge">0</span>
    `;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 点击切换工作台模态框开启/关闭
      store.setModalOpen(!store.isModalOpen);
    });

    this.btnElement = btn;
    this.badgeElement = btn.querySelector(".asset-triage-badge");
  }

  /**
   * 绑定 Store 状态监听
   */
  _bindStoreEvents() {
    // 监听列表更新
    store.addEventListener("items_updated", () => this.updateBadge(false));
    store.addEventListener("items_removed", () => this.updateBadge(false));

    // 监听新图片到达（触发 Pop 弹跳动效）
    store.addEventListener("item_added", () => this.updateBadge(true));
  }

  /**
   * 刷新红点数字与动效
   * @param {boolean} triggerBounce 是否触发弹性弹跳动画
   */
  updateBadge(triggerBounce = false) {
    const count = store.items.length;
    this.btnElement.setAttribute("title", `待审资产: ${count} 张 (点击打开审片工作台)`);

    if (count > 0) {
      this.badgeElement.textContent = count > 99 ? "99+" : String(count);
      this.badgeElement.classList.add("active");

      if (triggerBounce) {
        this.badgeElement.classList.remove("pop-bounce");
        // 强制重绘以重新触发 CSS 动画
        void this.badgeElement.offsetWidth;
        this.badgeElement.classList.add("pop-bounce");
      }
    } else {
      this.badgeElement.classList.remove("active");
    }
  }

  /**
   * 双模自适应挂载到 ComfyUI 顶栏 (兼容 Vue 新版 Topbar 与旧版 Menu)
   */
  mount() {
    // 策略 1: 尝试挂载至新版 ComfyUI 顶部工具栏 (Top Menu / Action Bar)
    const modernTopBar = document.querySelector(".comfy-top-bar") || 
                         document.querySelector(".comfy-menu-hamburger")?.parentElement ||
                         document.querySelector(".top-bar-container");

    if (modernTopBar) {
      modernTopBar.prepend(this.btnElement);
      console.log("[AssetTriage] 成功挂载至新版 ComfyUI Topbar 区域");
      return;
    }

    // 策略 2: 降级挂载至传统浮动菜单
    const legacyMenu = document.querySelector(".comfy-menu");
    if (legacyMenu) {
      legacyMenu.prepend(this.btnElement);
      console.log("[AssetTriage] 成功挂载至传统 ComfyUI 悬浮菜单");
      return;
    }

    // 策略 3: 若 DOM 尚未完全渲染，轮询等待重试
    setTimeout(() => this.mount(), 500);
  }
}