// web/components/inspector_canvas.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 B：交互式看图画布组件：
 *          支持鼠标原点平滑缩放、抓手平移、1:1像素点对点、ResizeObserver自适应与抗全局样式冲突。
 */

import { store } from "../services/store.js";

export class InspectorCanvas {
  constructor() {
    this.container = document.createElement("div");
    this.container.className = "at-canvas-wrapper";

    this.imgElement = document.createElement("img");
    this.imgElement.className = "at-canvas-image";
    // 强制消除 Tailwind / 全局 CSS 的 max-width 干扰
    this.imgElement.style.maxWidth = "none";
    this.imgElement.style.maxHeight = "none";

    // 悬浮 HUD 状态
    this.hudElement = document.createElement("div");
    this.hudElement.className = "at-canvas-hud";

    this.container.appendChild(this.imgElement);
    this.container.appendChild(this.hudElement);

    // 变换状态量
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.resizeObserver = null;

    this._bindEvents();
    this._initResizeObserver();
  }

  _initResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 50 && entry.contentRect.height > 50) {
          if (this.naturalWidth > 0 && this.naturalHeight > 0) {
            this.fitToScreen();
          }
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  _bindEvents() {
    // 鼠标拖拽平移
    this.container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      this.container.classList.add("dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this._applyTransform();
    });

    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove("dragging");
      }
    });

    // 鼠标为中心等比滚轮缩放
    this.container.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.min(Math.max(this.scale * zoomFactor, 0.05), 32);

        this.translateX = mouseX - (mouseX - this.translateX) * (newScale / this.scale);
        this.translateY = mouseY - (mouseY - this.translateY) * (newScale / this.scale);
        this.scale = newScale;

        this._applyTransform();
        this._updateHud();
      },
      { passive: false }
    );

    // 双击切换
    this.container.addEventListener("dblclick", () => {
      if (Math.abs(this.scale - 1) < 0.05) {
        this.fitToScreen();
      } else {
        this.zoomToActualSize();
      }
    });
  }

  /**
   * 加载大图并启动自适应居中呈现
   */
  loadImage(item) {
    if (!item) return;

    const fullImageUrl = `/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=temp`;

    this.imgElement.style.opacity = "0";
    this.imgElement.src = fullImageUrl;

    const onReady = () => {
      this.naturalWidth = this.imgElement.naturalWidth || item.width || 1024;
      this.naturalHeight = this.imgElement.naturalHeight || item.height || 1024;
      this.imgElement.style.opacity = "1";

      // 延时至 DOM 容器回流完成后执行居中适应
      requestAnimationFrame(() => {
        this.fitToScreen();
      });

      this._preloadAdjacentImages();
    };

    if (this.imgElement.complete && this.imgElement.naturalWidth > 0) {
      onReady();
    } else {
      this.imgElement.onload = onReady;
      this.imgElement.onerror = () => {
        // 大图读取异常时降级尝试缩略图
        if (item.thumb_url && this.imgElement.src !== item.thumb_url) {
          this.imgElement.src = item.thumb_url;
        }
      };
    }
  }

  fitToScreen() {
    const containerW = this.container.clientWidth;
    const containerH = this.container.clientHeight;
    if (!this.naturalWidth || !this.naturalHeight || containerW < 50 || containerH < 50) return;

    const paddingFactor = 0.92;
    const scaleX = (containerW * paddingFactor) / this.naturalWidth;
    const scaleY = (containerH * paddingFactor) / this.naturalHeight;
    this.scale = Math.min(scaleX, scaleY, 1);

    this.translateX = (containerW - this.naturalWidth * this.scale) / 2;
    this.translateY = (containerH - this.naturalHeight * this.scale) / 2;

    this._applyTransform();
    this._updateHud();
  }

  zoomToActualSize() {
    const containerW = this.container.clientWidth;
    const containerH = this.container.clientHeight;
    this.scale = 1;
    this.translateX = (containerW - this.naturalWidth) / 2;
    this.translateY = (containerH - this.naturalHeight) / 2;
    this._applyTransform();
    this._updateHud();
  }

  _applyTransform() {
    this.imgElement.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  _updateHud() {
    const percent = Math.round(this.scale * 100);
    this.hudElement.innerHTML = `
      <span>缩放: ${percent}%</span>
      <span class="at-canvas-hud-btn" data-action="fit">自适应</span>
      <span class="at-canvas-hud-btn" data-action="actual">100% 像素</span>
    `;

    const fitBtn = this.hudElement.querySelector('[data-action="fit"]');
    const actualBtn = this.hudElement.querySelector('[data-action="actual"]');
    if (fitBtn) fitBtn.onclick = () => this.fitToScreen();
    if (actualBtn) actualBtn.onclick = () => this.zoomToActualSize();
  }

  _preloadAdjacentImages() {
    const items = store.items;
    const activeItem = store.activeItem;
    if (!activeItem || items.length <= 1) return;

    const currentIndex = items.findIndex((i) => i.id === activeItem.id);
    if (currentIndex === -1) return;

    [currentIndex - 1, currentIndex + 1].forEach((idx) => {
      if (idx >= 0 && idx < items.length) {
        const item = items[idx];
        const preloadUrl = `/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=temp`;
        const preloader = new Image();
        preloader.src = preloadUrl;
      }
    });
  }

  getElement() {
    return this.container;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}