// web/components/triage_modal.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 审片管理器全屏模态框核心中枢：
 *          全量整合模式 A（纵向瀑布流 / 水平胶卷流）与模式 B（深度精审画布 / 参数侧边栏），
 *          纳管模式无缝切换、状态记忆返回、翻页调度及快捷键业务派发。
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
    this.toolbarGeneral = null;
    this.headerInspector = null;
    this.footerInspector = null;
    this.viewportContent = null;

    this.counterGeneralEl = null;
    this.inspectorProgressEl = null;
    this.inspectorCheckBtn = null;

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
        <!-- 1. 模式 A: 总览顶部操作栏 -->
        <header class="at-toolbar at-toolbar-general">
          <div class="at-toolbar-group">
            <button class="at-btn at-btn-select-all" title="全选 (Ctrl+A)">全选</button>
            <button class="at-btn at-btn-invert" title="反选 (Ctrl+I)">反选</button>
            <span class="at-counter-badge at-counter-general">已选: 0 / 0</span>
          </div>

          <div class="at-toolbar-group">
            <button class="at-btn at-btn-layout-masonry" title="纵向瀑布流">⊞ 瀑布流</button>
            <button class="at-btn at-btn-layout-filmstrip" title="水平胶卷流">▤ 胶卷流</button>
            <select class="at-select at-preset-select" title="选择转存预设"></select>
          </div>

          <div class="at-toolbar-group">
            <button class="at-btn at-btn-danger at-btn-delete-batch" title="批量彻底废弃原图与缓存 (Delete)">🗑 废弃</button>
            <button class="at-btn at-btn-primary at-btn-export-batch" title="执行批量转存 (Enter/Space)">📥 批量转存 (0)</button>
            <button class="at-btn at-btn-close" title="关闭工作台 (Esc)">✕</button>
          </div>
        </header>

        <!-- 2. 模式 B: 精审模式专用顶部微状态条 -->
        <header class="at-inspector-header at-hidden">
          <div class="at-toolbar-group">
            <button class="at-btn at-btn-back" title="返回总览 (Esc)">❮ 返回总览 (Esc)</button>
            <button class="at-btn at-btn-inspect-check" title="标记此项 (X)">[ ] 标记此项 (X)</button>
            <span class="at-counter-badge at-inspector-progress">进度: 0 / 0</span>
          </div>
          <div class="at-toolbar-group">
            <button class="at-btn at-btn-danger at-btn-delete-single" title="废弃此张图片 (Delete)">🗑 删除 (Del)</button>
          </div>
        </header>

        <!-- 3. 主视口内容挂载容器 -->
        <main class="at-viewport-content"></main>

        <!-- 4. 模式 B: 精审模式专用底部快捷底栏 -->
        <footer class="at-inspector-footer at-hidden">
          <button class="at-btn at-btn-prev" title="上一张 (←)">❮ 上一张 (←)</button>
          <button class="at-btn at-btn-primary at-btn-export-single" title="转存当前图片 (Enter/Space)">📥 转存此张 (Enter)</button>
          <button class="at-btn at-btn-next" title="下一张 (→)">下一张 (→) ❯</button>
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
    this.toolbarGeneral = backdrop.querySelector(".at-toolbar-general");
    this.headerInspector = backdrop.querySelector(".at-inspector-header");
    this.footerInspector = backdrop.querySelector(".at-inspector-footer");
    this.viewportContent = backdrop.querySelector(".at-viewport-content");
    this.counterGeneralEl = backdrop.querySelector(".at-counter-general");
    this.inspectorProgressEl = backdrop.querySelector(".at-inspector-progress");
    this.inspectorCheckBtn = backdrop.querySelector(".at-btn-inspect-check");

    this._bindDomEvents();
    document.body.appendChild(backdrop);
  }

  _bindDomEvents() {
    const q = (sel) => this.backdrop.querySelector(sel);

    q(".at-btn-select-all").onclick = () => store.selectAll();
    q(".at-btn-invert").onclick = () => store.invertSelection();
    q(".at-btn-close").onclick = () => store.setModalOpen(false);
    q(".at-btn-layout-masonry").onclick = () => store.setViewMode("masonry");
    q(".at-btn-layout-filmstrip").onclick = () => store.setViewMode("filmstrip");

    q(".at-preset-select").onchange = (e) => {
      store.activePresetId = e.target.value;
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
  }

  _updatePresetDropdown(presets) {
    const select = this.backdrop.querySelector(".at-preset-select");
    select.innerHTML = "";
    presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `预设: ${p.name}`;
      if (p.id === store.activePresetId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  refreshView() {
    const mode = store.viewMode;
    const q = (sel) => this.backdrop.querySelector(sel);

    if (mode === "inspector") {
      this.toolbarGeneral.classList.add("at-hidden");
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
      this.toolbarGeneral.classList.remove("at-hidden");
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

    this.counterGeneralEl.textContent = `已选: ${selectedCount} / ${totalCount}`;
    const exportBatchBtn = this.backdrop.querySelector(".at-btn-export-batch");
    exportBatchBtn.textContent = `📥 批量转存 (${selectedCount})`;
    exportBatchBtn.disabled = selectedCount === 0;

    if (store.viewMode === "inspector" && store.activeItem) {
      const activeId = store.activeItem.id;
      const index = store.items.findIndex((i) => i.id === activeId);
      const isChecked = store.selectedIds.has(activeId);

      this.inspectorProgressEl.textContent = `进度: [ ${index + 1} / ${totalCount} ]`;
      this.inspectorCheckBtn.textContent = isChecked ? "✓ 已标记此项 (X)" : "[ ] 标记此项 (X)";
      this.inspectorCheckBtn.classList.toggle("active", isChecked);
    }

    if (store.viewMode === "masonry") {
      this.masonry.syncSelection();
    } else if (store.viewMode === "filmstrip") {
      this.filmstrip.syncSelection();
    }
  }
}