// web/components/export_dialog.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 资产转存确认浮层组件：
 *          支持转存预设切换、临时自定义分类 (%category%) 输入、Token 命名模板实时动态预览。
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

  /**
   * 构建转存配置弹窗 DOM
   */
  _initDom() {
    const backdrop = document.createElement("div");
    backdrop.className = "at-dialog-backdrop at-hidden";

    backdrop.innerHTML = `
      <div class="at-dialog-container">
        <div class="at-dialog-header">
          <span class="at-dialog-title">📥 确认转存资产</span>
          <button class="at-btn at-btn-close-dialog">✕</button>
        </div>

        <div class="at-dialog-body">
          <div class="at-form-item">
            <label class="at-form-label">当前生效预设</label>
            <select class="at-select at-dialog-preset-select" style="width: 100%;"></select>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">指定子分类名称 (%category%)</label>
            <input type="text" class="at-input at-dialog-category-input" placeholder="例如: CharacterDesign, Mech, 角色二创" />
          </div>

          <div class="at-form-item">
            <label class="at-form-label">导出目标路径与命名预览</label>
            <div class="at-token-preview">output/2026-09-04/Default/...</div>
          </div>

          <div class="at-dialog-info">
            本次将转存并从待审队列移出 <b class="at-export-count" style="color: #60a5fa;">0</b> 张资产。
          </div>
        </div>

        <div class="at-dialog-footer">
          <button class="at-btn at-btn-cancel-dialog">取消</button>
          <button class="at-btn at-btn-primary at-btn-confirm-export">开始转存</button>
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

  /**
   * 呼出转存弹窗
   * @param {Array} items 目标资产列表
   */
  open(items) {
    if (!items || items.length === 0) return;
    this.targetItems = items;

    // 填充预设下拉选项
    this.presetSelect.innerHTML = "";
    store.presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.format})`;
      if (p.id === store.activePresetId) opt.selected = true;
      this.presetSelect.appendChild(opt);
    });

    this.backdrop.querySelector(".at-export-count").textContent = String(items.length);
    this._updatePreview();
    this.backdrop.classList.remove("at-hidden");
    this.categoryInput.focus();
  }

  close() {
    this.backdrop.classList.add("at-hidden");
  }

  /**
   * 实时渲染 Token 替换效果预览
   */
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