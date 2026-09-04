// web/components/inspector_canvas.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 B：交互式看图画布组件：
 *          支持以鼠标为原点的平滑滚轮缩放、抓手拖拽平移、100%点对点切换与相邻原图静默预加载 (Preload)。
 */

import { store } from "../services/store.js";

export class InspectorCanvas {
  constructor() {
    this.container = document.createElement("div");
    this.container.className = "at-canvas-wrapper";

    this.imgElement = document.createElement("img");
    this.imgElement.className = "at-canvas-image";

    // 悬浮 HUD 状态
    this.hudElement = document.createElement("div");
    this.hudElement.className = "at-canvas-hud";

    this.container.appendChild(this.imgElement);
    this.container.appendChild(this.hudElement);

    // 变换状态量 (平移与缩放)
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    // 当前大图自然分辨率
    this.naturalWidth = 0;
    this.naturalHeight = 0;

    this._bindEvents();
  }

  /**
   * 绑定鼠标滚轮、平移拖拽与双击事件
   */
  _bindEvents() {
    // 1. 鼠标按下开始拖拽
    this.container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // 仅左键可拖动画布
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      this.container.classList.add("dragging");
    });

    // 2. 鼠标移动执行平移
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this._applyTransform();
    });

    // 3. 鼠标抬起结束拖拽
    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove("dragging");
      }
    });

    // 4. 以鼠标当前光标为轴心的等比平滑缩放 (Zoom to Pointer)
    this.container.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 计算当前缩放比例因子 (适配触控板平滑捏合与级进滚轮)
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.min(Math.max(this.scale * zoomFactor, 0.1), 16);

        // 调整平移位移，确保鼠标所在像素点缩放前后保持不动
        this.translateX = mouseX - (mouseX - this.translateX) * (newScale / this.scale);
        this.translateY = mouseY - (mouseY - this.translateY) * (newScale / this.scale);
        this.scale = newScale;

        this._applyTransform();
        this._updateHud();
      },
      { passive: false }
    );

    // 5. 双击自适应尺寸与 100% 像素点对点之间切换
    this.container.addEventListener("dblclick", () => {
      if (Math.abs(this.scale - 1) < 0.05) {
        this.fitToScreen();
      } else {
        this.zoomToActualSize();
      }
    });
  }

  /**
   * 加载指定资产的原生大图，并触发相邻资产静默预加载
   * @param {Object} item 
   */
  loadImage(item) {
    if (!item) return;

    // 构建 ComfyUI 原生临时目录原图访问 URL
    const fullImageUrl = `/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=temp`;

    this.imgElement.style.display = "none";
    this.imgElement.src = fullImageUrl;

    this.imgElement.onload = () => {
      this.naturalWidth = this.imgElement.naturalWidth;
      this.naturalHeight = this.imgElement.naturalHeight;
      this.imgElement.style.display = "block";
      this.fitToScreen();
      // 触发前后相邻原图静默预加载
      this._preloadAdjacentImages();
    };
  }

  /**
   * 自适应铺满视口居中呈现 (Fit to Screen)
   */
  fitToScreen() {
    const containerW = this.container.clientWidth;
    const containerH = this.container.clientHeight;
    if (!this.naturalWidth || !this.naturalHeight || !containerW || !containerH) return;

    const scaleX = (containerW * 0.9) / this.naturalWidth;
    const scaleY = (containerH * 0.9) / this.naturalHeight;
    this.scale = Math.min(scaleX, scaleY, 1); // 默认放大不超过 100%

    // 居中计算
    this.translateX = (containerW - this.naturalWidth * this.scale) / 2;
    this.translateY = (containerH - this.naturalHeight * this.scale) / 2;

    this._applyTransform();
    this._updateHud();
  }

  /**
   * 切换至 100% 真实像素尺寸居中 (1:1 Pixel Match)
   */
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

    this.hudElement.querySelector('[data-action="fit"]').onclick = () => this.fitToScreen();
    this.hudElement.querySelector('[data-action="actual"]').onclick = () => this.zoomToActualSize();
  }

  /**
   * 前后相邻原图静默预加载 (杜绝左右快速翻页白屏)
   */
  _preloadAdjacentImages() {
    const items = store.items;
    const activeItem = store.activeItem;
    if (!activeItem || items.length <= 1) return;

    const currentIndex = items.findIndex((i) => i.id === activeItem.id);
    if (currentIndex === -1) return;

    // 预拉取前一张与后一张
    const prevIndex = currentIndex - 1;
    const nextIndex = currentIndex + 1;

    [prevIndex, nextIndex].forEach((idx) => {
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
}