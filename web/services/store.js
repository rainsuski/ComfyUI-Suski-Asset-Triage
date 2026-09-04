// web/services/store.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 单向数据流响应式 Store，驱动红点角标、选图集合、视图模式与乐观 UI 更新。
 */

class TriageStore extends EventTarget {
  constructor() {
    super();
    // 核心响应式状态
    this.items = [];                  // 待审资产列表 [Item, ...]
    this.selectedIds = new Set();     // 勾选中的资产 ID 集合
    this.activeItem = null;           // 精审模式当前查看的资产对象
    this.viewMode = "masonry";        // "masonry" (纵向瀑布流) | "filmstrip" (横向胶卷流) | "inspector" (精审模式)
    this.isModalOpen = false;         // 审片弹窗是否处于显示状态
    this.presets = [];                // 转存预设列表
    this.activePresetId = "default";  // 当前选中的预设 ID
    this.settings = {};               // 用户首选项配置
  }

  /**
   * 发布状态变更事件，通知订阅组件重新渲染
   * @param {string} eventName 
   * @param {Object} detail 
   */
  _emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
    this.dispatchEvent(new CustomEvent("state_changed", { detail: { type: eventName, ...detail } }));
  }

  // --- 资产列表操作 ---

  setItems(items) {
    this.items = [...items];
    // 清理已被移除的选中 ID
    const validIds = new Set(this.items.map(i => i.id));
    for (const id of this.selectedIds) {
      if (!validIds.has(id)) this.selectedIds.delete(id);
    }
    this._emit("items_updated", { count: this.items.length });
  }

  addItem(item, prepend = true) {
    // 查重防止 WebSocket 重复广播
    if (this.items.some(i => i.id === item.id)) return;

    if (prepend) {
      this.items.unshift(item);
    } else {
      this.items.push(item);
    }
    this._emit("item_added", { item, count: this.items.length });
  }

  /**
   * 乐观 UI 快速剥离资产 (转存或删除瞬间触发)
   * @param {string[]} ids 
   */
  optimisticRemove(ids) {
    const removeSet = new Set(ids);
    this.items = this.items.filter(i => !removeSet.has(i.id));
    ids.forEach(id => this.selectedIds.delete(id));

    // 若当前精审的图片被移出，自动切换至下一张或退出精审
    if (this.activeItem && removeSet.has(this.activeItem.id)) {
      this.activeItem = this.items.length > 0 ? this.items[0] : null;
      if (!this.activeItem && this.viewMode === "inspector") {
        this.viewMode = "masonry";
      }
    }
    this._emit("items_removed", { removedIds: ids, count: this.items.length });
  }

  // --- 选中状态控制 ---

  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this._emit("selection_changed", { selectedIds: Array.from(this.selectedIds) });
  }

  selectAll() {
    this.selectedIds = new Set(this.items.map(i => i.id));
    this._emit("selection_changed", { selectedIds: Array.from(this.selectedIds) });
  }

  invertSelection() {
    const newSelection = new Set();
    for (const item of this.items) {
      if (!this.selectedIds.has(item.id)) {
        newSelection.add(item.id);
      }
    }
    this.selectedIds = newSelection;
    this._emit("selection_changed", { selectedIds: Array.from(this.selectedIds) });
  }

  clearSelection() {
    this.selectedIds.clear();
    this._emit("selection_changed", { selectedIds: [] });
  }

  // --- 视图与模态框控制 ---

  setModalOpen(isOpen) {
    this.isModalOpen = isOpen;
    this._emit("modal_visibility_changed", { isOpen });
  }

  setViewMode(mode) {
    if (["masonry", "filmstrip", "inspector"].includes(mode)) {
      this.viewMode = mode;
      this._emit("view_mode_changed", { mode });
    }
  }

  setActiveItem(item) {
    this.activeItem = item;
    this._emit("active_item_changed", { item });
  }

  // --- 预设与配置 ---

  setPresets(presets) {
    this.presets = presets;
    if (presets.length > 0 && !presets.some(p => p.id === this.activePresetId)) {
      this.activePresetId = presets[0].id;
    }
    this._emit("presets_updated", { presets });
  }

  getActivePreset() {
    return this.presets.find(p => p.id === this.activePresetId) || this.presets[0] || null;
  }
}

// 导出单例 Store
export const store = new TriageStore();