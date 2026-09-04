// web/components/export_dialog.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 资产转存确认浮层组件：
 *          全能预设增删改查、自由模板直接输入、预设选择持久化、
 *          文件质量常驻调节 (1~100)、三大元数据控制。
 */

import { store } from "../services/store.js";
import { TriageApi } from "../services/api.js";

export class ExportDialog {
  constructor(options = {}) {
    this.options = options;
    this.backdrop = null;
    this.targetItems = [];

    // DOM 引用缓存
    this.presetSelect = null;
    this.templateInput = null;
    this.formatSelect = null;
    this.qualityRange = null;
    this.qualityNumber = null;
    this.qualityHint = null;
    this.checkWorkflow = null;
    this.checkPrompt = null;
    this.checkLora = null;
    this.countBadge = null;

    this._initDom();
  }

  _initDom() {
    const backdrop = document.createElement("div");
    backdrop.className = "at-dialog-backdrop at-hidden";

    backdrop.innerHTML = `
      <div class="at-dialog-container at-export-dialog-container" style="max-width: 520px;">
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

        <div class="at-dialog-body" style="display: flex; flex-direction: column; gap: 14px;">
          <!-- 预设管理与切换 -->
          <div class="at-form-item">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="at-form-label" style="margin: 0; font-weight: 600;">生效转存预设 (Preset)</label>
              <div style="display: flex; gap: 6px;">
                <button class="at-text-link-btn at-btn-save-current" style="font-size: 11px;" title="将当前弹窗配置覆盖保存至此预设">保存覆盖</button>
                <button class="at-text-link-btn at-btn-save-as" style="font-size: 11px;" title="以此配置创建新预设">+另存为</button>
                <button class="at-text-link-btn at-btn-delete-preset" style="font-size: 11px; color: #ef4444;" title="删除当前预设">删除</button>
              </div>
            </div>
            <select class="at-preset-select at-dialog-preset-select" style="width: 100%;"></select>
          </div>

          <!-- 路径与文件名自由模板输入 -->
          <div class="at-form-item">
            <label class="at-form-label" style="font-weight: 600; margin-bottom: 4px;">转存相对路径与文件名模板</label>
            <input type="text" class="at-input at-dialog-template-input" 
                   placeholder="如: 木梨/sfw/%model:30%/%seed% 或 %date%/%model%_%count%" 
                   style="font-family: monospace; font-size: 12px; margin-bottom: 6px;" />
            <!-- 快捷 Token 点击标签 -->
            <div class="at-token-chips" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <span class="at-chip" data-token="%date%">%date%</span>
              <span class="at-chip" data-token="%model%">%model%</span>
              <span class="at-chip" data-token="%model:30%">%model:30%</span>
              <span class="at-chip" data-token="%seed%">%seed%</span>
              <span class="at-chip" data-token="%sampler%">%sampler%</span>
              <span class="at-chip" data-token="%scheduler%">%scheduler%</span>
              <span class="at-chip" data-token="%cfg%">%cfg%</span>
              <span class="at-chip" data-token="%steps%">%steps%</span>
              <span class="at-chip" data-token="%count%">%count%</span>
            </div>
          </div>

          <!-- 格式与常驻画质控制 -->
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div class="at-form-item" style="flex: 1.1;">
              <label class="at-form-label" style="font-weight: 600; margin-bottom: 4px;">输出文件格式</label>
              <select class="at-input at-dialog-format-select" style="width: 100%;">
                <option value="PNG">PNG (无损原图)</option>
                <option value="WEBP">WEBP (高压缩比)</option>
                <option value="JPEG">JPEG (标准通用)</option>
              </select>
            </div>

            <div class="at-form-item" style="flex: 1.4;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="at-form-label" style="font-weight: 600; margin: 0;">转存文件质量</label>
                <div style="display: flex; align-items: center; gap: 2px;">
                  <input type="number" class="at-input at-dialog-quality-number" min="1" max="100" value="95" 
                         style="width: 48px; padding: 1px 4px; text-align: center; font-size: 12px; height: 22px;" />
                  <span style="font-size: 11px; opacity: 0.7;">%</span>
                </div>
              </div>
              <input type="range" class="at-dialog-quality-range" min="1" max="100" value="95" style="width: 100%; cursor: pointer;" />
              <div class="at-quality-hint" style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                (WebP/JPEG 压缩质量，PNG 优化等级)
              </div>
            </div>
          </div>

          <!-- 元数据嵌入控制 -->
          <div class="at-form-item" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <div class="at-form-label" style="font-weight: 600; margin-bottom: 8px;">元数据嵌入控制</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" class="at-check-workflow" checked />
                <span>嵌入工作流 (Workflow JSON)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" class="at-check-prompt" checked />
                <span>嵌入生成文本信息 (A1111/Civitai 规范)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" class="at-check-lora" checked />
                <span>追加生效应挂载 LoRA 列表到文本</span>
              </label>
            </div>
          </div>

          <!-- 简要资产统计 -->
          <div class="at-dialog-info" style="margin-top: 2px;">
            本次转存将移出收件箱并归档 <span class="at-export-count-badge" style="font-weight: 600; color: #3b82f6;">0</span> 张资产。
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
    this.presetSelect = backdrop.querySelector(".at-dialog-preset-select");
    this.templateInput = backdrop.querySelector(".at-dialog-template-input");
    this.formatSelect = backdrop.querySelector(".at-dialog-format-select");
    this.qualityRange = backdrop.querySelector(".at-dialog-quality-range");
    this.qualityNumber = backdrop.querySelector(".at-dialog-quality-number");
    this.qualityHint = backdrop.querySelector(".at-quality-hint");
    this.checkWorkflow = backdrop.querySelector(".at-check-workflow");
    this.checkPrompt = backdrop.querySelector(".at-check-prompt");
    this.checkLora = backdrop.querySelector(".at-check-lora");
    this.countBadge = backdrop.querySelector(".at-export-count-badge");

    this._bindEvents();
    document.body.appendChild(backdrop);
  }

  _bindEvents() {
    const q = (sel) => this.backdrop.querySelector(sel);

    q(".at-btn-close-dialog").onclick = () => this.close();
    q(".at-btn-cancel-dialog").onclick = () => this.close();

    this.qualityRange.oninput = (e) => {
      this.qualityNumber.value = e.target.value;
    };
    this.qualityNumber.oninput = (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 95;
      val = Math.max(1, Math.min(100, val));
      this.qualityRange.value = val;
    };

    this.formatSelect.onchange = () => {
      const fmt = this.formatSelect.value;
      if (fmt === "PNG") {
        this.qualityHint.textContent = "(无损压缩等级，100 最快，低数值体积更小)";
      } else if (fmt === "WEBP") {
        this.qualityHint.textContent = "(WebP 质量，100 为无损模式)";
      } else {
        this.qualityHint.textContent = "(JPEG 视觉质量)";
      }
    };

    this.backdrop.querySelectorAll(".at-chip").forEach((chip) => {
      chip.style.cssText = "font-size: 11px; padding: 2px 6px; background: rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; user-select: none; font-family: monospace;";
      chip.onclick = () => {
        const token = chip.getAttribute("data-token");
        const input = this.templateInput;
        const start = input.selectionStart || input.value.length;
        const end = input.selectionEnd || input.value.length;
        input.value = input.value.substring(0, start) + token + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
      };
    });

    // 核心改进：弹窗切换预设调用 setActivePresetId 实时持久化
    this.presetSelect.onchange = (e) => {
      store.setActivePresetId(e.target.value);
      this._applyPresetToForm(store.getActivePreset());
    };

    // 保存覆盖当前预设
    q(".at-btn-save-current").onclick = async () => {
      const active = store.getActivePreset();
      if (!active) return;
      const updated = this._getPresetFromForm(active.id, active.name);
      store.saveOrUpdatePreset(updated);
      await TriageApi.savePresets(store.presets);
      alert(`预设 "${active.name}" 配置已保存更新`);
    };

    // 另存为新预设
    q(".at-btn-save-as").onclick = async () => {
      const name = prompt("请输入新转存预设名称:", "自定义规则");
      if (!name || !name.trim()) return;
      const newId = `preset_${Date.now()}`;
      const newPreset = this._getPresetFromForm(newId, name.trim());
      store.saveOrUpdatePreset(newPreset);
      await TriageApi.savePresets(store.presets);
      this._renderPresetOptions();
      this.presetSelect.value = newId;
    };

    // 删除当前预设
    q(".at-btn-delete-preset").onclick = async () => {
      if (store.presets.length <= 1) {
        alert("至少需要保留一个预设");
        return;
      }
      const active = store.getActivePreset();
      if (!active) return;
      if (!confirm(`确定删除预设 "${active.name}" 吗？`)) return;

      store.deletePreset(active.id);
      await TriageApi.savePresets(store.presets);
      this._renderPresetOptions();
      this._applyPresetToForm(store.getActivePreset());
    };

    // 确认转存
    q(".at-btn-confirm-export").onclick = () => {
      const currentPreset = store.getActivePreset() || {};
      const finalPreset = this._getPresetFromForm(
        currentPreset.id || "temp",
        currentPreset.name || "临时转存"
      );

      if (this.options.onConfirm) {
        this.options.onConfirm(this.targetItems, finalPreset);
      }
      this.close();
    };
  }

  _renderPresetOptions() {
    this.presetSelect.innerHTML = "";
    store.presets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} [${p.format || "PNG"} ${p.quality || 95}%]`;
      if (p.id === store.activePresetId) opt.selected = true;
      this.presetSelect.appendChild(opt);
    });
    this.presetSelect.value = store.activePresetId;
  }

  _applyPresetToForm(preset) {
    if (!preset) return;
    this.templateInput.value = preset.template || "%date%/%model:30%_%seed%_%count%";
    this.formatSelect.value = (preset.format || "PNG").toUpperCase();
    const q = preset.quality !== undefined ? preset.quality : 95;
    this.qualityRange.value = q;
    this.qualityNumber.value = q;

    this.checkWorkflow.checked = preset.embed_workflow !== false;
    this.checkPrompt.checked = preset.embed_prompt !== false;
    this.checkLora.checked = preset.embed_lora !== false;

    this.formatSelect.onchange();
  }

  _getPresetFromForm(id, name) {
    return {
      id,
      name,
      template: this.templateInput.value.trim() || "%date%/%model:30%_%seed%_%count%",
      format: this.formatSelect.value,
      quality: parseInt(this.qualityNumber.value, 10) || 95,
      embed_workflow: this.checkWorkflow.checked,
      embed_prompt: this.checkPrompt.checked,
      embed_lora: this.checkLora.checked,
    };
  }

  open(items) {
    if (!items || items.length === 0) return;
    this.targetItems = items;

    this._renderPresetOptions();
    this._applyPresetToForm(store.getActivePreset());

    this.countBadge.textContent = `${items.length}`;
    this.backdrop.classList.remove("at-hidden");
    this.templateInput.focus();
  }

  close() {
    this.backdrop.classList.add("at-hidden");
  }
}