// web/components/export_dialog.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 资产转存确认浮层组件：
 *          全系现代暗黑质感、预设切换、临时分类输入、Token 路径高亮预览与标准行动按钮。
 */

import { store } from "../services/store.js";

export class ExportDialog {
  constructor(options = {}) {
    this.options = options;
    this.backdrop = null;
    this.categoryInput = null;
    this.presetSelect = null;
    this.previewEl = null;
    this.targetItems = [];

    this._initDom();
  }

  _initDom() {
    const backdrop = document.createElement("div");
    backdrop.className = "at-dialog-backdrop at-hidden";

    backdrop.innerHTML = `
      <div class="at-dialog-container at-export-dialog-container">
        <div class="at-dialog-header">
          <div class="at-brand-title">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #3b82f6;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="at-dialog-title">转存资产配置</span>
          </div>
          <button class="at-icon-btn at-btn-close-dialog" title="关闭 (Esc)">✕</button>
        </div>

        <div class="at-dialog-body">
          <div class="at-form-item">
            <label class="at-form-label">生效规则预设 (Preset)</label>
            <div class="at-preset-dropdown-wrap" style="width: 100%;">
              <select class="at-preset-select at-dialog-preset-select" style="width: 100%;"></select>
            </div>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">指定子分类名称 (%category%)</label>
            <input type="text" class="at-input at-dialog-category-input" placeholder="输入分类名，如: Character, Mech, 角色二创" />
          </div>

          <div class="at-form-item">
            <label class="at-form-label">导出目标路径与文件名预览</label>
            <div class="at-token-preview">output/2026-09-04/Default/...</div>
          </div>

          <div class="at-dialog-info">
            本次转存将移出收件箱并归档 <span class="at-export-count-badge">0</span> 张资产。
          </div>
        </div>

        <div class="at-dialog-footer">
          <button class="at-action-btn at-btn-cancel-dialog">取消</button>
          <button class="at-action-btn at-btn-accent at-btn-confirm-export">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>开始转存</span>
          </button>
        </div>
      </div>
    `;

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.close();
    });

    this.backdrop = backdrop;
    this.categoryInput = backdrop.querySelector(".at-dialog-category-input");
    this.presetSelect = backdrop.querySelector(".at-dialog-preset-select");
    this.previewEl = backdrop.querySelector(".at-token-preview");

    // 绑定事件
    backdrop.querySelector(".at-btn-close-dialog").onclick = () => this.close();
    backdrop.querySelector(".at-btn-cancel-dialog").onclick = () => this.close();

    this.categoryInput.oninput = () => this._updatePreview();
    this.presetSelect.onchange = (e) => {
      store.activePresetId = e.target.value;
      this._updatePreview();
    };

    backdrop.querySelector(".at-btn-confirm-export").onclick = () => {
      const category = this.categoryInput.value.trim();
      const preset = store.getActivePreset();
      if (this.options.onConfirm) {
        this.options.onConfirm(this.targetItems, preset, category);
      }
      this.close();
    };

    document.body.appendChild(backdrop);
  }

  open(items) {
    if (!items || items.length === 0) return;
    this.targetItems = items;

    this.presetSelect.innerHTML = "";
    store.presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} [${p.format || "PNG"}]`;
      if (p.id === store.activePresetId) opt.selected = true;
      this.presetSelect.appendChild(opt);
    });

    this.backdrop.querySelector(".at-export-count-badge").textContent = `${items.length} 张`;
    this._updatePreview();
    this.backdrop.classList.remove("at-hidden");
    this.categoryInput.focus();
  }

  close() {
    this.backdrop.classList.add("at-hidden");
  }

  _updatePreview() {
    const preset = store.getActivePreset();
    if (!preset) return;

    const sample = this.targetItems[0] || {};
    const cat = this.categoryInput.value.trim() || "Default";
    const dateStr = new Date().toISOString().split("T")[0];
    const modelStr = sample.model || "Checkpoint";
    const seedStr = sample.seed !== undefined ? String(sample.seed) : "948201";

    let path = preset.path_template || "%date%/%category%";
    path = path.replace(/%date%/g, dateStr).replace(/%category%/g, cat).replace(/%model%/g, modelStr);

    let name = preset.name_template || "%date%_%seed%_%count%";
    name = name
      .replace(/%date%/g, dateStr)
      .replace(/%model%/g, modelStr)
      .replace(/%seed%/g, seedStr)
      .replace(/%count%/g, "001");

    const ext = preset.format ? `.${preset.format.toLowerCase()}` : ".png";
    this.previewEl.textContent = `output/${path}/${name}${ext}`;
  }
}