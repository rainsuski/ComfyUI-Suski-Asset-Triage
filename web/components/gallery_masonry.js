// web/components/gallery_masonry.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 A-1：真·纵向多列动态平衡瀑布流组件，集成贪心列高算法与 IntersectionObserver 懒加载。
 */

import { store } from "../services/store.js";

export class GalleryMasonry {
  constructor() {
    this.container = document.createElement("div");
    this.container.className = "at-masonry-container";

    this.observer = null;
    this.resizeObserver = null;
    this.currentColCount = 0;
    this.cachedCards = []; // 缓存当前卡片引用，便于列数变化时秒级重排

    this._initIntersectionObserver();
    this._initResizeObserver();
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
      { rootMargin: "300px 0px" }
    );
  }

  _initResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width <= 0) continue;

        const targetCols = this._calcColumnCount(width);
        if (targetCols !== this.currentColCount && this.cachedCards.length > 0) {
          this._relayout(targetCols);
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * 根据当前容器宽度动态计算理想列数 (单列最小约 220px)
   */
  _calcColumnCount(containerWidth) {
    const minColWidth = 220;
    const gap = 14;
    const padding = 32; // 左右各 16px
    const availableWidth = Math.max(minColWidth, containerWidth - padding);
    const cols = Math.floor((availableWidth + gap) / (minColWidth + gap));
    return Math.max(1, Math.min(cols, 10)); // 限制在 1 ~ 10 列
  }

  render() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.container.innerHTML = "";
    this.cachedCards = [];
    const items = store.items;

    if (items.length === 0) {
      this.container.innerHTML = `
        <div class="at-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z"/>
          </svg>
          <div style="font-size: 15px;">待审收件箱已清空 (Inbox Zero)</div>
        </div>
      `;
      this.currentColCount = 0;
      return this.container;
    }

    // 获取视口预估宽度 (如容器尚未完成初次布局，降级使用 window 宽度)
    const containerWidth = this.container.clientWidth || (window.innerWidth * 0.95);
    const colCount = this._calcColumnCount(containerWidth);

    // 构建各列并实例化卡片
    items.forEach((item) => {
      const card = this._createCardElement(item);
      const ratio = item.width && item.height ? (item.height / item.width) : 1;
      this.cachedCards.push({ card, ratio, item });
    });

    this._distributeCards(colCount);
    return this.container;
  }

  /**
   * 贪心算法：将卡片依次分发到当前累积高度最短的那一列
   */
  _distributeCards(colCount) {
    this.currentColCount = colCount;
    this.container.innerHTML = "";

    const columns = [];
    const columnHeights = new Array(colCount).fill(0);

    for (let i = 0; i < colCount; i++) {
      const colEl = document.createElement("div");
      colEl.className = "at-masonry-col";
      columns.push(colEl);
      this.container.appendChild(colEl);
    }

    this.cachedCards.forEach(({ card, ratio }) => {
      // 寻找当前高度最小的列
      let minIdx = 0;
      let minHeight = columnHeights[0];
      for (let i = 1; i < colCount; i++) {
        if (columnHeights[i] < minHeight) {
          minHeight = columnHeights[i];
          minIdx = i;
        }
      }

      columns[minIdx].appendChild(card);
      // 累加高度估算值 (高宽比 + 间距等效权重)
      columnHeights[minIdx] += ratio + 0.05;
    });
  }

  /**
   * 容器尺寸发生跃迁时，无重绘快速重排
   */
  _relayout(newColCount) {
    if (newColCount <= 0 || newColCount === this.currentColCount) return;
    this._distributeCards(newColCount);
  }

  _createCardElement(item) {
    const isSelected = store.selectedIds.has(item.id);
    const card = document.createElement("div");
    card.className = `at-card ${isSelected ? "selected" : ""}`;
    card.setAttribute("data-id", item.id);

    const aspectRatio = item.width && item.height ? (item.width / item.height).toFixed(4) : "1";
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}