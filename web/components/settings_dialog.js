// web/components/settings_dialog.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 全局设置与首选项弹窗组件：
 *          落实原型规范（审阅暂存仓库目录、启动视图、缩略图画质、转存格式与防误删）。
 */

import { store } from "../services/store.js";
import { TriageApi } from "../services/api.js";

export class SettingsDialog {
  constructor(options = {}) {
    this.options = options;
    this.backdrop = null;
    this._initDom();
  }

  _initDom() {
    const backdrop = document.createElement("div");
    backdrop.className = "at-dialog-backdrop at-hidden";

    backdrop.innerHTML = `
      <div class="at-dialog-container at-settings-dialog-container">
        <div class="at-dialog-header">
          <span class="at-dialog-title">⚙ 全局偏好与审阅仓库配置</span>
          <button class="at-icon-btn at-btn-close-settings">✕</button>
        </div>

        <div class="at-dialog-body">
          <div class="at-form-item">
            <label class="at-form-label">审阅仓库暂存目录 (Staging Directory)</label>
            <input type="text" class="at-input at-set-staging-dir" placeholder="留空使用默认 temp (如: staging 或绝对路径 D:/AI/Review)" style="width: 100%; box-sizing: border-box;" />
            <span style="font-size: 11px; color: #888; margin-top: 4px; display: block; line-height: 1.4;">
              💡 留空时读取 ComfyUI 临时预览图 (temp)；若指定目录，可配合原生 <b>Save Image</b> 节点保存至该目录即可直接进入待审列表，实现持久化审片。
            </span>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">默认启动视图</label>
            <select class="at-select at-set-default-view" style="width: 100%;">
              <option value="masonry">纵向多列瀑布流 (Masonry)</option>
              <option value="filmstrip">水平高沉浸胶卷流 (Filmstrip)</option>
            </select>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">预处理缩略图长边规格</label>
            <select class="at-select at-set-thumb-size" style="width: 100%;">
              <option value="512">512px (极速省内存，推荐)</option>
              <option value="768">768px (高清预览)</option>
              <option value="original">原图尺寸 (直读)</option>
            </select>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">转存默认输出格式</label>
            <select class="at-select at-set-export-format" style="width: 100%;">
              <option value="PNG">PNG (无损原图，保留完整 Workflow)</option>
              <option value="WEBP">WebP (高压缩率，写入 EXIF UserComment)</option>
              <option value="JPEG">JPEG (标准格式)</option>
            </select>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">DataflowProbe 血统探针注入键名 (Lineage Key)</label>
            <input type="text" class="at-input at-set-lineage-key" placeholder="默认为 dataflow_lineage" style="width: 100%; box-sizing: border-box;" />
            <span style="font-size: 11px; color: #888; margin-top: 4px; display: block; line-height: 1.4;">
              💡 对应 ComfyUI-DataflowProbe 写入 extra_pnginfo 的元数据键名，检测到时优先采用多阶段时序动态元数据。
            </span>
          </div>

          <div class="at-form-item">
            <label class="at-form-label">转存命名默认采样阶段 (Lineage Stage Index)</label>
            <input type="number" min="0" max="99" class="at-input at-set-lineage-stage" placeholder="0" style="width: 100%; box-sizing: border-box;" />
            <span style="font-size: 11px; color: #888; margin-top: 4px; display: block; line-height: 1.4;">
              💡 当图片包含多阶段元数据时，转存命名占位符（如 %model%、%seed%、%steps%）默认提取的阶段索引（0 代表 Stage 1）。
            </span>
          </div>

          <div class="at-form-item">
            <label class="at-form-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="at-set-confirm-delete" style="cursor: pointer;" />
              <span>废弃资产时弹出二次确认对话框</span>
            </label>
          </div>
        </div>

        <div class="at-dialog-footer">
          <button class="at-action-btn at-btn-cancel-settings">取消</button>
          <button class="at-action-btn at-btn-accent at-btn-save-settings">保存配置</button>
        </div>
      </div>
    `;

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.close();
    });

    this.backdrop = backdrop;

    backdrop.querySelector(".at-btn-close-settings").onclick = () => this.close();
    backdrop.querySelector(".at-btn-cancel-settings").onclick = () => this.close();

    backdrop.querySelector(".at-btn-save-settings").onclick = async () => {
      await this._handleSave();
    };

    document.body.appendChild(backdrop);
  }

  open() {
    const s = store.settings || {};
    const q = (sel) => this.backdrop.querySelector(sel);

    q(".at-set-staging-dir").value = s.staging_dir !== undefined ? s.staging_dir : "staging";
    q(".at-set-default-view").value = s.default_view || "masonry";

    const rawThumb = s.thumb_max_edge !== undefined ? s.thumb_max_edge : (s.thumbnail_size !== undefined ? s.thumbnail_size : 512);
    q(".at-set-thumb-size").value = String(rawThumb);

    q(".at-set-export-format").value = s.default_format || "PNG";
    q(".at-set-lineage-key").value = s.lineage_key || "dataflow_lineage";
    q(".at-set-lineage-stage").value = s.lineage_export_stage !== undefined ? s.lineage_export_stage : 0;
    q(".at-set-confirm-delete").checked = s.confirm_delete !== false;

    this.backdrop.classList.remove("at-hidden");
  }

  close() {
    this.backdrop.classList.add("at-hidden");
  }

  async _handleSave() {
    const q = (sel) => this.backdrop.querySelector(sel);

    const thumbVal = q(".at-set-thumb-size").value;
    const thumb_max_edge = thumbVal === "original" ? "original" : (parseInt(thumbVal, 10) || 512);

    const payload = {
      ...store.settings,
      staging_dir: q(".at-set-staging-dir").value.trim(),
      default_view: q(".at-set-default-view").value,
      thumb_max_edge: thumb_max_edge,
      default_format: q(".at-set-export-format").value,
      lineage_key: q(".at-set-lineage-key").value.trim() || "dataflow_lineage",
      lineage_export_stage: parseInt(q(".at-set-lineage-stage").value, 10) || 0,
      confirm_delete: q(".at-set-confirm-delete").checked,
    };

    try {
      if (TriageApi.updateSettings) {
        await TriageApi.updateSettings(payload);
      } else if (TriageApi.saveSettings) {
        await TriageApi.saveSettings(payload);
      }
      store.settings = payload;
      this.close();
      if (this.options.onSaved) this.options.onSaved();
    } catch (err) {
      console.error("[AssetTriage] 保存设置失败:", err);
      alert("保存设置失败，请查看控制台日志。");
    }
  }
}