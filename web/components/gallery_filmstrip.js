// web/components/gallery_filmstrip.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 A-2：水平高沉浸胶卷流，实现鼠标滚轮纵横劫持 (Wheel Hijack) 与自适应高度流式排布。
 */

import { store } from "../services/store.js";

export class GalleryFilmstrip {
  constructor() {
    this.container = document.createElement("div");
    this.container.className = "at-filmstrip-container";
    this.observer = null;
    this._initIntersectionObserver();
    this._bindWheelHijack();
  }

  /**
   * 纵横滚轮事件劫持 (Wheel Hijack): 将鼠标垂直滚动 deltaY 转换为横向平滑位移 scrollLeft
   */
  _bindWheelHijack() {
    this.container.addEventListener(
      "wheel",
      (e) => {
        // 若处于水平触控板原生滑动，则放行
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        e.preventDefault();
        // 放大平滑因子以获得舒适横向漫游体验
        const scrollAmount = e.deltaY * 1.5;
        this.container.scrollLeft += scrollAmount;
      },
      { passive: false }
    );
  }

  _initIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute("data-src");
            if (src) {
              img.src = src;
              img.removeAttribute("data-src");
            }
            this.observer.unobserve(img);
          }
        });
      },
      { root: this.container, rootMargin: "0px 300px" } // 水平横向预加载 300px
    );
  }

  render() {
    this.container.innerHTML = "";
    const items = store.items;

    if (items.length === 0) {
      this.container.innerHTML = `
        <div class="at-empty-state" style="width: 100%;">
          <div style="font-size: 15px;">待审收件箱已清空 (Inbox Zero)</div>
        </div>
      `;
      return this.container;
    }

    items.forEach((item) => {
      const card = this._createCardElement(item);
      this.container.appendChild(card);
    });

    return this.container;
  }

  _createCardElement(item) {
    const isSelected = store.selectedIds.has(item.id);
    const card = document.createElement("div");
    card.className = `at-card ${isSelected ? "selected" : ""}`;
    card.setAttribute("data-id", item.id);

    // 胶卷流以容器高度撑满，比例约束宽度
    const aspectRatio = item.width && item.height ? (item.width / item.height).toFixed(3) : "1";
    card.style.aspectRatio = aspectRatio;

    card.innerHTML = `
      <div class="at-card-actions">
        <button class="at-card-btn check ${isSelected ? "checked" : ""}" title="选择/取消 (X)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </button>
        <button class="at-card-btn inspect" title="深度精审">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/>
          </svg>
        </button>
      </div>
      <img class="at-card-img" data-src="${item.thumb_url}" alt="${item.filename}" />
    `;

    const img = card.querySelector(".at-card-img");
    this.observer.observe(img);

    card.addEventListener("click", (e) => {
      if (e.target.closest(".at-card-btn.inspect")) return;
      store.toggleSelect(item.id);
    });

    const inspectBtn = card.querySelector(".at-card-btn.inspect");
    inspectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      store.setActiveItem(item);
      store.setViewMode("inspector");
    });

    return card;
  }

  syncSelection() {
    const cards = this.container.querySelectorAll(".at-card");
    cards.forEach((card) => {
      const id = card.getAttribute("data-id");
      const isSelected = store.selectedIds.has(id);
      const checkBtn = card.querySelector(".at-card-btn.check");

      if (isSelected) {
        card.classList.add("selected");
        checkBtn?.classList.add("checked");
      } else {
        card.classList.remove("selected");
        checkBtn?.classList.remove("checked");
      }
    });
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}