// web/components/metadata_sidebar.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 B：参数属性侧边栏组件，渲染 Prompt/Negative、核心采样配置、LoRA 列表与一键复制。
 */

import { TriageApi } from "../services/api.js";

export class MetadataSidebar {
  constructor() {
    this.container = document.createElement("aside");
    this.container.className = "at-sidebar-wrapper";
  }

  /**
   * 加载并全量渲染资产详细元数据
   * @param {Object} item 基础条目数据
   */
  async loadItem(item) {
    if (!item) {
      this.container.innerHTML = `<div class="at-empty-state">暂无属性</div>`;
      return;
    }

    // 骨架屏加载态
    this.container.innerHTML = `
      <div style="color: var(--at-text-muted); font-size: 13px; text-align: center; padding-top: 20px;">
        正在读取缓存元数据...
      </div>
    `;

    // 优先拉取后端 meta 缓存中的详细生成参数
    const meta = await TriageApi.getMetadata(item.id);
    const data = meta || item;

    this._renderDetails(data);
  }

  _renderDetails(data) {
    const pos = data.positive_prompt || "(无提示词内容)";
    const neg = data.negative_prompt || "(无反向提示词)";
    const model = data.model || "Unknown";
    const sampler = data.sampler_name || "Unknown";
    const scheduler = data.scheduler || "Unknown";
    const cfg = data.cfg !== undefined ? data.cfg : "-";
    const steps = data.steps !== undefined ? data.steps : "-";
    const seed = data.seed !== undefined ? data.seed : "-";
    const loras = Array.isArray(data.loras) ? data.loras : [];
    const width = data.width || "-";
    const height = data.height || "-";
    const fileSize = data.file_size ? `${(data.file_size / (1024 * 1024)).toFixed(2)} MB` : "-";

    this.container.innerHTML = `
      <!-- 正向提示词 -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>提示词 (Prompt)</span>
          <button class="at-copy-btn" data-copy="pos">📋 复制</button>
        </div>
        <div class="at-meta-text">${this._escapeHtml(pos)}</div>
      </section>

      <!-- 反向提示词 -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>反向 (Negative)</span>
          <button class="at-copy-btn" data-copy="neg">📋 复制</button>
        </div>
        <div class="at-meta-text">${this._escapeHtml(neg)}</div>
      </section>

      <!-- 核心生成参数 -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>核心采样配置</span>
        </div>
        <div class="at-meta-grid">
          <div class="at-meta-item" style="grid-column: 1 / -1;">
            <span class="at-meta-item-label">模型 (Checkpoint)</span>
            <span class="at-meta-item-val" title="${model}">${model}</span>
          </div>
          <div class="at-meta-item">
            <span class="at-meta-item-label">采样器 (Sampler)</span>
            <span class="at-meta-item-val" title="${sampler}">${sampler}</span>
          </div>
          <div class="at-meta-item">
            <span class="at-meta-item-label">调度器 (Scheduler)</span>
            <span class="at-meta-item-val" title="${scheduler}">${scheduler}</span>
          </div>
          <div class="at-meta-item">
            <span class="at-meta-item-label">CFG Scale</span>
            <span class="at-meta-item-val">${cfg}</span>
          </div>
          <div class="at-meta-item">
            <span class="at-meta-item-label">步数 (Steps)</span>
            <span class="at-meta-item-val">${steps}</span>
          </div>
          <div class="at-meta-item" style="grid-column: 1 / -1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="at-meta-item-label">种子 (Seed)</span>
              <button class="at-copy-btn" data-copy="seed">复制</button>
            </div>
            <span class="at-meta-item-val">${seed}</span>
          </div>
        </div>
      </section>

      <!-- 挂载 LoRA 列表 -->
      ${
        loras.length > 0
          ? `
        <section class="at-meta-section">
          <div class="at-meta-section-header">
            <span>生效应 LoRA (${loras.length})</span>
          </div>
          <div class="at-lora-pills">
            ${loras
              .map(
                (l) => `
              <div class="at-lora-pill" title="${l.name}">
                <span>${l.name}</span>
                <b style="color: #60a5fa;">${l.strength}</b>
              </div>
            `
              )
              .join("")}
          </div>
        </section>
      `
          : ""
      }

      <!-- 文件元信息 -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>文件属性</span>
        </div>
        <div class="at-meta-grid">
          <div class="at-meta-item">
            <span class="at-meta-item-label">分辨率</span>
            <span class="at-meta-item-val">${width} × ${height}</span>
          </div>
          <div class="at-meta-item">
            <span class="at-meta-item-label">原文件体积</span>
            <span class="at-meta-item-val">${fileSize}</span>
          </div>
        </div>
      </section>
    `;

    this._bindCopyEvents(pos, neg, seed);
  }

  _bindCopyEvents(pos, neg, seed) {
    const copyToClipboard = async (text, btn) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // 兼容非安全环境/降级处理
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          textArea.remove();
        }
        const originalText = btn.textContent;
        btn.textContent = "✓ 已复制";
        btn.style.backgroundColor = "#10b981";
        btn.style.borderColor = "#10b981";
        btn.style.color = "#fff";
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.backgroundColor = "";
          btn.style.borderColor = "";
          btn.style.color = "";
        }, 1500);
      } catch (err) {
        console.error("复制失败:", err);
      }
    };

    this.container.querySelector('[data-copy="pos"]')?.addEventListener("click", (e) => {
      copyToClipboard(pos, e.target);
    });

    this.container.querySelector('[data-copy="neg"]')?.addEventListener("click", (e) => {
      copyToClipboard(neg, e.target);
    });

    this.container.querySelector('[data-copy="seed"]')?.addEventListener("click", (e) => {
      copyToClipboard(String(seed), e.target);
    });
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  getElement() {
    return this.container;
  }
}