// web/components/triage_modal.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 审片管理器全屏模态框核心中枢：
 *          深度三段式工作台结构、预设快捷下拉持久化联动、双模切换与状态记忆。
 */

import { store } from "../services/store.js";
import { GalleryMasonry } from "./gallery_masonry.js";
import { GalleryFilmstrip } from "./gallery_filmstrip.js";
import { InspectorCanvas } from "./inspector_canvas.js";
import { MetadataSidebar } from "./metadata_sidebar.js";

export class TriageModal {
  constructor(options = {}) {
    this.options = options;

    this.backdrop = null;
    this.container = null;

    // 模式 A: 总览视口元素
    this.headerGeneral = null;
    this.footerGeneral = null;
    this.counterGeneralBadge = null;
    this.counterSelectedText = null;
    this.presetSelect = null;

    // 模式 B: 精审视口元素
    this.headerInspector = null;
    this.footerInspector = null;
    this.inspectorProgressEl = null;
    this.inspectorCheckBtn = null;

    // 主视口
    this.viewportContent = null;

    // 子组件实例
    this.masonry = new GalleryMasonry();
    this.filmstrip = new GalleryFilmstrip();
    this.canvas = new InspectorCanvas();
    this.sidebar = new MetadataSidebar();

    this._initDom();
    this._bindStoreEvents();
  }

  _initDom() {
    const backdrop = document.createElement("div");
    backdrop.className = "at-modal-backdrop";

    backdrop.innerHTML = `
      <div class="at-modal-container">
        <!-- 1. 模式 A 顶栏 (Header) -->
        <header class="at-header-bar at-header-general">
          <div class="at-header-left">
            <div class="at-brand-title">
              <svg class="at-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
              </svg>
              <span>Asset Triage</span>
            </div>
            <div class="at-status-pill">
              <span class="at-status-dot"></span>
              <span class="at-queue-count">待审收件箱: 0</span>
            </div>
          </div>

          <div class="at-header-center">
            <div class="at-segmented-group">
              <button class="at-segment-btn at-btn-layout-masonry active" title="纵向多列瀑布流 (V)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h8v10H3V3zm10 0h8v6h-8V3zm0 8h8v10h-8V11zM3 15h8v6H3v-6z"/>
                </svg>
                <span>瀑布流</span>
              </button>
              <button class="at-segment-btn at-btn-layout-filmstrip" title="水平高沉浸胶卷流 (H)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 4v1H6V4H4v16h2v-1h12v1h2V4h-2zm0 13H6V7h12v10z"/>
                </svg>
                <span>胶卷流</span>
              </button>
            </div>

            <!-- 转存预设快捷选择器 (持久化) -->
            <div class="at-preset-dropdown-wrap">
              <select class="at-preset-select" title="选择转存预设规则"></select>
            </div>
          </div>

          <div class="at-header-right">
            <button class="at-icon-btn at-btn-settings" title="全局偏好与转存规则配置">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button class="at-icon-btn at-btn-close" title="退出审片管理器 (Esc)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <!-- 2. 模式 B 顶栏 (Header) -->
        <header class="at-header-bar at-header-inspector at-hidden">
          <div class="at-header-left">
            <button class="at-ghost-btn at-btn-back" title="返回总览列表 (Esc)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>返回总览 (Esc)</span>
            </button>
            <span class="at-status-pill at-inspector-progress">进度: 0 / 0</span>
          </div>
          <div class="at-header-right">
            <button class="at-ghost-btn at-btn-inspect-check" title="切换标记/勾选 (X)">
              <span>[ ] 标记此项 (X)</span>
            </button>
            <button class="at-ghost-btn at-btn-danger at-btn-delete-single" title="销毁此项原图与缓存 (Del)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>废弃 (Del)</span>
            </button>
          </div>
        </header>

        <!-- 3. 内容视口主区域 -->
        <main class="at-viewport-content"></main>

        <!-- 4. 模式 A 专属底栏 -->
        <footer class="at-footer-bar at-footer-general">
          <div class="at-footer-left">
            <div class="at-selection-info">
              已选择 <span class="at-selected-highlight">0</span> / <span class="at-total-count">0</span> 张
            </div>
            <div class="at-shortcuts-guide">
              <span>滚轮缩放/浏览</span> · 
              <span>单击选择</span> · 
              <span>⤢ 精审</span> · 
              <span>Space/Enter 批量转存</span> · 
              <span>Del 废弃</span> · 
              <span>Esc 退出</span>
            </div>
          </div>

          <div class="at-footer-right">
            <div class="at-selection-actions">
              <button class="at-text-link-btn at-btn-select-all" title="全选当前列表 (Ctrl+A)">全选</button>
              <button class="at-text-link-btn at-btn-invert" title="反向勾选 (Ctrl+I)">反选</button>
              <button class="at-text-link-btn at-btn-clear-selection" title="清空全部选择">清空</button>
            </div>

            <div class="at-footer-divider"></div>

            <button class="at-action-btn at-btn-delete-batch at-btn-danger-ghost" title="彻底删除选中原图与缓存 (Delete)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>批量废弃</span>
            </button>

            <button class="at-action-btn at-btn-export-batch at-btn-accent" title="执行转存并移出收件箱 (Enter/Space)" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span class="at-export-label">批量转存 (0)</span>
            </button>
          </div>
        </footer>

        <!-- 5. 模式 B 专属底栏 -->
        <footer class="at-footer-bar at-footer-inspector at-hidden">
          <div class="at-footer-left">
            <div class="at-shortcuts-guide">
              <span>← / → 翻页</span> · 
              <span>滚轮平滑缩放</span> · 
              <span>拖拽平移</span> · 
              <span>X 勾选</span> · 
              <span>Enter 转存</span> · 
              <span>Del 删除</span>
            </div>
          </div>
          <div class="at-footer-right">
            <button class="at-action-btn at-btn-prev" title="上一张 (←)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>上一张</span>
            </button>
            <button class="at-action-btn at-btn-export-single at-btn-accent" title="转存当前图片 (Enter/Space)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>转存此张 (Enter)</span>
            </button>
            <button class="at-action-btn at-btn-next" title="下一张 (→)">
              <span>下一张</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </footer>
      </div>
    `;

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        store.setModalOpen(false);
      }
    });

    this.backdrop = backdrop;
    this.container = backdrop.querySelector(".at-modal-container");

    this.headerGeneral = backdrop.querySelector(".at-header-general");
    this.footerGeneral = backdrop.querySelector(".at-footer-general");
    this.headerInspector = backdrop.querySelector(".at-header-inspector");
    this.footerInspector = backdrop.querySelector(".at-footer-inspector");
    this.viewportContent = backdrop.querySelector(".at-viewport-content");

    this.counterGeneralBadge = backdrop.querySelector(".at-queue-count");
    this.counterSelectedText = backdrop.querySelector(".at-selected-highlight");
    this.inspectorProgressEl = backdrop.querySelector(".at-inspector-progress");
    this.inspectorCheckBtn = backdrop.querySelector(".at-btn-inspect-check");
    this.presetSelect = backdrop.querySelector(".at-preset-select");

    this._bindDomEvents();
    document.body.appendChild(backdrop);
  }

  _bindDomEvents() {
    const q = (sel) => this.backdrop.querySelector(sel);

    q(".at-btn-select-all").onclick = () => store.selectAll();
    q(".at-btn-invert").onclick = () => store.invertSelection();
    q(".at-btn-clear-selection").onclick = () => {
      store.selectedIds.clear();
      store.dispatchEvent(new CustomEvent("selection_changed"));
    };

    q(".at-btn-layout-masonry").onclick = () => store.setViewMode("masonry");
    q(".at-btn-layout-filmstrip").onclick = () => store.setViewMode("filmstrip");

    q(".at-btn-settings").onclick = () => {
      if (this.options.onOpenSettings) {
        this.options.onOpenSettings();
      } else {
        store.dispatchEvent(new CustomEvent("open_settings"));
      }
    };
    q(".at-btn-close").onclick = () => store.setModalOpen(false);

    // 核心改进：顶栏切换预设调用 setActivePresetId 实时持久化
    this.presetSelect.onchange = (e) => {
      store.setActivePresetId(e.target.value);
    };

    q(".at-btn-export-batch").onclick = () => {
      if (this.options.onExportBatch) this.options.onExportBatch();
    };
    q(".at-btn-delete-batch").onclick = () => {
      if (this.options.onDeleteBatch) this.options.onDeleteBatch();
    };

    q(".at-btn-back").onclick = () => {
      store.setViewMode(store.settings.default_view || "masonry");
    };
    this.inspectorCheckBtn.onclick = () => {
      if (store.activeItem) store.toggleSelect(store.activeItem.id);
    };
    q(".at-btn-delete-single").onclick = () => {
      if (this.options.onDeleteSingle) this.options.onDeleteSingle();
    };
    q(".at-btn-export-single").onclick = () => {
      if (this.options.onExportSingle) this.options.onExportSingle();
    };
    q(".at-btn-prev").onclick = () => this.navigatePrev();
    q(".at-btn-next").onclick = () => this.navigateNext();
  }

  _bindStoreEvents() {
    store.addEventListener("modal_visibility_changed", (e) => {
      const isOpen = e.detail.isOpen;
      if (isOpen) {
        this.backdrop.classList.add("active");
        this.refreshView();
      } else {
        this.backdrop.classList.remove("active");
      }
    });

    store.addEventListener("items_updated", () => this.refreshView());
    store.addEventListener("item_added", () => this.refreshView());
    store.addEventListener("items_removed", () => this.refreshView());
    store.addEventListener("selection_changed", () => this.updateCounters());
    store.addEventListener("view_mode_changed", () => this.refreshView());

    store.addEventListener("active_item_changed", (e) => {
      if (store.viewMode === "inspector" && e.detail.item) {
        this._renderInspectorContent(e.detail.item);
      }
    });

    store.addEventListener("presets_updated", (e) => {
      this._updatePresetDropdown(e.detail.presets);
    });

    store.addEventListener("active_preset_changed", (e) => {
      if (this.presetSelect.value !== e.detail.activePresetId) {
        this.presetSelect.value = e.detail.activePresetId;
      }
    });
  }

  _updatePresetDropdown(presets) {
    this.presetSelect.innerHTML = "";
    if (!presets || presets.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "默认转存规则";
      this.presetSelect.appendChild(opt);
      return;
    }

    presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `预设: ${p.name}`;
      if (p.id === store.activePresetId) opt.selected = true;
      this.presetSelect.appendChild(opt);
    });

    this.presetSelect.value = store.activePresetId;
  }

  refreshView() {
    const mode = store.viewMode;
    const q = (sel) => this.backdrop.querySelector(sel);

    if (mode === "inspector") {
      this.headerGeneral.classList.add("at-hidden");
      this.footerGeneral.classList.add("at-hidden");
      this.headerInspector.classList.remove("at-hidden");
      this.footerInspector.classList.remove("at-hidden");

      this.viewportContent.innerHTML = "";
      const inspectorBody = document.createElement("div");
      inspectorBody.className = "at-inspector-body";
      inspectorBody.appendChild(this.canvas.getElement());
      inspectorBody.appendChild(this.sidebar.getElement());
      this.viewportContent.appendChild(inspectorBody);

      if (store.activeItem) {
        this._renderInspectorContent(store.activeItem);
      }
    } else {
      this.headerGeneral.classList.remove("at-hidden");
      this.footerGeneral.classList.remove("at-hidden");
      this.headerInspector.classList.add("at-hidden");
      this.footerInspector.classList.add("at-hidden");

      q(".at-btn-layout-masonry").classList.toggle("active", mode === "masonry");
      q(".at-btn-layout-filmstrip").classList.toggle("active", mode === "filmstrip");

      this.viewportContent.innerHTML = "";

      if (mode === "masonry") {
        this.viewportContent.appendChild(this.masonry.render());
      } else if (mode === "filmstrip") {
        this.viewportContent.appendChild(this.filmstrip.render());
      }
    }

    this.updateCounters();
  }

  _renderInspectorContent(item) {
    this.canvas.loadImage(item);
    this.sidebar.loadItem(item);
    this.updateCounters();
  }

  navigatePrev() {
    const items = store.items;
    if (items.length <= 1 || !store.activeItem) return;
    const index = items.findIndex((i) => i.id === store.activeItem.id);
    const targetIndex = index > 0 ? index - 1 : items.length - 1;
    store.setActiveItem(items[targetIndex]);
  }

  navigateNext() {
    const items = store.items;
    if (items.length <= 1 || !store.activeItem) return;
    const index = items.findIndex((i) => i.id === store.activeItem.id);
    const targetIndex = index < items.length - 1 ? index + 1 : 0;
    store.setActiveItem(items[targetIndex]);
  }

  updateCounters() {
    const selectedCount = store.selectedIds.size;
    const totalCount = store.items.length;

    this.counterGeneralBadge.textContent = `待审收件箱: ${totalCount}`;
    this.counterSelectedText.textContent = String(selectedCount);
    const totalCountEl = this.backdrop.querySelector(".at-total-count");
    if (totalCountEl) totalCountEl.textContent = String(totalCount);

    const exportBatchBtn = this.backdrop.querySelector(".at-btn-export-batch");
    const exportLabel = this.backdrop.querySelector(".at-export-label");
    if (exportLabel) exportLabel.textContent = `批量转存 (${selectedCount})`;
    exportBatchBtn.disabled = selectedCount === 0;

    if (store.viewMode === "inspector" && store.activeItem) {
      const activeId = store.activeItem.id;
      const index = store.items.findIndex((i) => i.id === activeId);
      const isChecked = store.selectedIds.has(activeId);

      this.inspectorProgressEl.textContent = `进度: [ ${index + 1} / ${totalCount} ]`;
      this.inspectorCheckBtn.innerHTML = isChecked
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>已标记 (X)</span>`
        : `<span>[ ] 标记此项 (X)</span>`;
      this.inspectorCheckBtn.classList.toggle("active", isChecked);
    }

    if (store.viewMode === "masonry") {
      this.masonry.syncSelection();
    } else if (store.viewMode === "filmstrip") {
      this.filmstrip.syncSelection();
    }
  }
}