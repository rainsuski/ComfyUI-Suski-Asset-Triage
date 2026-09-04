// web/services/store.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 单向数据流响应式 Store，驱动红点角标、选图集合、视图模式、
 *          预设记忆持久化 (LocalStorage + Settings) 与乐观 UI 更新。
 */

import { TriageApi } from "./api.js";

const STORAGE_KEY_ACTIVE_PRESET = "at_active_preset_id";

class TriageStore extends EventTarget {
  constructor() {
    super();
    // 核心响应式状态
    this.items = [];                  // 待审资产列表 [Item, ...]
    this.selectedIds = new Set();     // 勾选中的资产 ID 集合
    this.activeItem = null;           // 精审模式当前查看的资产对象
    this.viewMode = "masonry";        // "masonry" | "filmstrip" | "inspector"
    this.isModalOpen = false;         // 审片弹窗是否处于显示状态
    this.presets = [];                // 转存预设列表

    // 优先从 LocalStorage 读取上次记忆的预设 ID，杜绝刷新重置
    this.activePresetId = localStorage.getItem(STORAGE_KEY_ACTIVE_PRESET) || "default";
    this.settings = {};               // 用户首选项配置
  }

  _emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
    this.dispatchEvent(new CustomEvent("state_changed", { detail: { type: eventName, ...detail } }));
  }

  // --- 资产列表操作 ---

  setItems(items) {
    this.items = [...items];
    const validIds = new Set(this.items.map(i => i.id));
    for (const id of this.selectedIds) {
      if (!validIds.has(id)) this.selectedIds.delete(id);
    }
    this._emit("items_updated", { count: this.items.length });
  }

  addItem(item, prepend = true) {
    if (this.items.some(i => i.id === item.id)) return;
    if (prepend) {
      this.items.unshift(item);
    } else {
      this.items.push(item);
    }
    this._emit("item_added", { item, count: this.items.length });
  }

  optimisticRemove(ids) {
    const removeSet = new Set(ids);
    this.items = this.items.filter(i => !removeSet.has(i.id));
    ids.forEach(id => this.selectedIds.delete(id));

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

  // --- 预设持久化响应控制 ---

  setPresets(presets) {
    this.presets = presets || [];

    // 尝试恢复记忆的预设：依次检查当前 activePresetId、服务端 settings、最后兜底首项
    const rememberedId = this.activePresetId || (this.settings && this.settings.active_preset_id);
    if (rememberedId && this.presets.some(p => p.id === rememberedId)) {
      this.activePresetId = rememberedId;
    } else if (this.presets.length > 0) {
      this.activePresetId = this.presets[0].id;
    }

    localStorage.setItem(STORAGE_KEY_ACTIVE_PRESET, this.activePresetId);
    this._emit("presets_updated", { presets: this.presets, activePresetId: this.activePresetId });
  }

  /**
   * 切换激活预设并持久化存储
   */
  setActivePresetId(presetId) {
    if (!presetId || this.activePresetId === presetId) return;
    this.activePresetId = presetId;
    localStorage.setItem(STORAGE_KEY_ACTIVE_PRESET, presetId);

    // 静默同步给服务端设置，多端/重启依然生效
    if (this.settings) {
      this.settings.active_preset_id = presetId;
      TriageApi.saveSettings(this.settings).catch(() => { });
    }

    this._emit("active_preset_changed", { activePresetId: presetId });
  }

  getActivePreset() {
    return this.presets.find(p => p.id === this.activePresetId) || this.presets[0] || null;
  }

  saveOrUpdatePreset(preset) {
    const idx = this.presets.findIndex(p => p.id === preset.id);
    if (idx >= 0) {
      this.presets[idx] = { ...preset };
    } else {
      this.presets.push(preset);
    }
    this.setActivePresetId(preset.id);
    this._emit("presets_updated", { presets: this.presets, activePresetId: this.activePresetId });
  }

  deletePreset(presetId) {
    if (this.presets.length <= 1) return false;
    this.presets = this.presets.filter(p => p.id !== presetId);
    if (this.activePresetId === presetId) {
      this.setActivePresetId(this.presets[0].id);
    }
    this._emit("presets_updated", { presets: this.presets, activePresetId: this.activePresetId });
    return true;
  }
}

export const store = new TriageStore();