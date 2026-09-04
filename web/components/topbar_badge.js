// web/components/topbar_badge.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 顶栏常驻收件箱入口组件：
 *          深度适配现代 ComfyUI Topbar (Tailwind/PrimeVue 体系) 并实现像素级对齐。
 */

import { app } from "/scripts/app.js";
import { store } from "../services/store.js";

export class TopbarBadgeWidget {
  constructor() {
    this.btnElement = null;
    this.badgeElement = null;
    this._initDom();
    this._bindStoreEvents();
  }

  /**
   * 构建 34x28 像素标准收件箱按钮
   */
  _initDom() {
    const btn = document.createElement("button");
    // 注入 self-center 确保在 flex 容器中垂直居中对齐
    btn.className =
      "relative inline-flex items-center justify-center self-center cursor-pointer select-none asset-triage-topbar-btn";
    btn.setAttribute("title", "待审资产 (0)");
    btn.setAttribute("type", "button");

    btn.innerHTML = `
      <svg class="asset-triage-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
      </svg>
      <span class="asset-triage-badge">0</span>
    `;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      store.setModalOpen(!store.isModalOpen);
    });

    this.btnElement = btn;
    this.badgeElement = btn.querySelector(".asset-triage-badge");
  }

  /**
   * 绑定 Store 状态监听
   */
  _bindStoreEvents() {
    store.addEventListener("items_updated", () => this.updateBadge(false));
    store.addEventListener("items_removed", () => this.updateBadge(false));
    store.addEventListener("item_added", () => this.updateBadge(true));
  }

  /**
   * 刷新红点数字与动效
   */
  updateBadge(triggerBounce = false) {
    const count = store.items.length;
    this.btnElement.setAttribute("title", `待审资产: ${count} 张 (点击打开审片工作台)`);

    if (count > 0) {
      this.badgeElement.textContent = count > 99 ? "99+" : String(count);
      this.badgeElement.classList.add("active");

      if (triggerBounce) {
        this.badgeElement.classList.remove("pop-bounce");
        void this.badgeElement.offsetWidth; // 强制重绘触发 CSS 关键帧
        this.badgeElement.classList.add("pop-bounce");
      }
    } else {
      this.badgeElement.classList.remove("active");
    }
  }

  /**
   * 挂载逻辑
   */
  mount(retryCount = 20) {
    const modernMenu = app.menu?.element;
    if (modernMenu) {
      modernMenu.prepend(this.btnElement);
      return;
    }

    const settingsGroup = app.menu?.settingsGroup?.element;
    if (settingsGroup && settingsGroup.parentElement) {
      settingsGroup.parentElement.insertBefore(this.btnElement, settingsGroup);
      return;
    }

    const domCandidate =
      document.querySelector(".comfyui-menu") ||
      document.querySelector(".comfy-menu") ||
      document.querySelector(".comfy-multiline-menu") ||
      document.querySelector("button[title*='Manager']")?.parentElement ||
      document.querySelector(".comfy-menu-btn")?.parentElement;

    if (domCandidate) {
      domCandidate.prepend(this.btnElement);
      return;
    }

    if (retryCount > 0) {
      setTimeout(() => this.mount(retryCount - 1), 250);
    } else {
      this.btnElement.style.position = "fixed";
      this.btnElement.style.top = "12px";
      this.btnElement.style.left = "12px";
      this.btnElement.style.zIndex = "9999";
      document.body.appendChild(this.btnElement);
    }
  }
}