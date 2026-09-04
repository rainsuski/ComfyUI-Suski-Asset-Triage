// web/components/topbar_badge.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 顶栏常驻收件箱入口组件：
 *          深度适配现代 ComfyUI Topbar (app.menu) 与经典菜单，实现高容错自动探测挂载。
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
   * 构建 Minimal 收件箱图标与绝对定位红点
   */
  _initDom() {
    const btn = document.createElement("button");
    // 注入 ComfyUI 官方通用按钮 class，自动继承主题风格
    btn.className = "comfy-menu-btn comfyui-button asset-triage-topbar-btn";
    btn.setAttribute("title", "待审资产 (0)");
    btn.setAttribute("type", "button");

    btn.innerHTML = `
      <svg class="asset-triage-icon" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5v-2h-5v2zm-5-4h10v-2H7v2zm0-4h10V7H7v2z"/>
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
        void this.badgeElement.offsetWidth; // 强制重绘
        this.badgeElement.classList.add("pop-bounce");
      }
    } else {
      this.badgeElement.classList.remove("active");
    }
  }

  /**
   * 多重策略精准挂载到 ComfyUI 顶部栏
   * @param {number} retryCount 剩余重试次数
   */
  mount(retryCount = 20) {
    // 策略 1: 现代版 ComfyUI 官方核心 API (优先级最高)
    const modernMenu = app.menu?.element;
    if (modernMenu) {
      // 优先插入到顶栏最左侧区域 (与工作流管理图标并列)
      modernMenu.prepend(this.btnElement);
      console.log("[AssetTriage] 成功通过 app.menu.element 挂载到顶栏最左侧");
      return;
    }

    // 策略 2: 挂载到设置组 (Settings/Manager 所在分组) 前方
    const settingsGroup = app.menu?.settingsGroup?.element;
    if (settingsGroup && settingsGroup.parentElement) {
      settingsGroup.parentElement.insertBefore(this.btnElement, settingsGroup);
      console.log("[AssetTriage] 成功通过 settingsGroup 锚点挂载到顶栏");
      return;
    }

    // 策略 3: DOM 智能选择器嗅探 (通过截图中现有的特征节点定位)
    const domCandidate =
      document.querySelector(".comfyui-menu") ||
      document.querySelector(".comfy-menu") ||
      document.querySelector(".comfy-multiline-menu") ||
      document.querySelector("button[title*='Manager']")?.parentElement ||
      document.querySelector(".comfy-menu-btn")?.parentElement;

    if (domCandidate) {
      domCandidate.prepend(this.btnElement);
      console.log("[AssetTriage] 成功通过 DOM 选择器挂载到顶栏");
      return;
    }

    // 策略 4: 异步轮询等待 ComfyUI 前端框架初始化 DOM
    if (retryCount > 0) {
      setTimeout(() => this.mount(retryCount - 1), 250);
    } else {
      // 策略 5: 极限降级保底（防止被无顶栏的特殊主题拦截，挂载为屏幕左上角悬浮球）
      console.warn("[AssetTriage] 未能检测到标准顶栏，执行视口保底挂载");
      this.btnElement.style.position = "fixed";
      this.btnElement.style.top = "12px";
      this.btnElement.style.left = "12px";
      this.btnElement.style.zIndex = "9999";
      this.btnElement.style.backgroundColor = "rgba(24, 24, 30, 0.9)";
      this.btnElement.style.border = "1px solid #3f3f4e";
      document.body.appendChild(this.btnElement);
    }
  }
}