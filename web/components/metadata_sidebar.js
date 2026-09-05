// web/components/metadata_sidebar.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 模式 B：参数属性侧边栏组件：
 *          支持多阶段血统指示器切换，渲染核心采样配置、挂载 LoRA 列表、Prompt/Negative 与文件属性。
 */

import { TriageApi } from "../services/api.js";

export class MetadataSidebar {
  constructor() {
    this.container = document.createElement("aside");
    this.container.className = "at-sidebar-wrapper";
    this.currentData = null;
    this.currentStageIndex = 0;
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
      <div style="color: var(--at-text-muted); font-size: 12px; text-align: center; padding-top: 24px;">
        正在读取缓存元数据...
      </div>
    `;

    // 优先拉取后端 meta 缓存中的详细生成参数
    const meta = await TriageApi.getMetadata(item.id);
    this.currentData = meta || item;
    this.currentStageIndex = 0;

    this._render();
  }

  _render() {
    const data = this.currentData;
    if (!data) return;

    const stages = Array.isArray(data.stages) && data.stages.length > 0 ? data.stages : null;
    const hasMultipleStages = stages && stages.length > 1;
    const activeStage = stages ? (stages[this.currentStageIndex] || stages[0]) : data;

    const pos = activeStage.positive_prompt || "(无提示词内容)";
    const neg = activeStage.negative_prompt || "(无反向提示词)";
    const model = activeStage.model || "Unknown";
    const sampler = activeStage.sampler_name || "Unknown";
    const scheduler = activeStage.scheduler || "Unknown";
    const cfg = activeStage.cfg !== undefined ? activeStage.cfg : "-";
    const steps = activeStage.steps !== undefined ? activeStage.steps : "-";
    const seed = activeStage.seed !== undefined ? activeStage.seed : "-";
    const loras = Array.isArray(activeStage.loras) ? activeStage.loras : [];

    // 文件全局属性
    const width = data.width || "-";
    const height = data.height || "-";
    const fileSize = data.file_size ? `${(data.file_size / (1024 * 1024)).toFixed(2)} MB` : "-";

    // 1. 顶部现代几何阶段指示器
    let indicatorHtml = "";
    if (hasMultipleStages) {
      const isFirst = this.currentStageIndex === 0;
      const isLast = this.currentStageIndex === stages.length - 1;
      const dotsHtml = stages
        .map((st, idx) => {
          const isActive = idx === this.currentStageIndex;
          return `<button class="at-stage-pill ${isActive ? "active" : ""}" data-stage-idx="${idx}" title="${this._escapeHtml(st.stage_name || `Stage ${idx + 1}`)}"></button>`;
        })
        .join("");

      indicatorHtml = `
        <div class="at-stage-indicator-section">
          <div class="at-stage-nav-row">
            <button class="at-stage-arrow-btn at-stage-prev-btn" ${isFirst ? "disabled" : ""} title="上一阶段">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div class="at-stage-pills-track">${dotsHtml}</div>
            <button class="at-stage-arrow-btn at-stage-next-btn" ${isLast ? "disabled" : ""} title="下一阶段">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
          <div class="at-stage-caption" key="${this.currentStageIndex}">
            <span class="at-stage-name-text" title="${this._escapeHtml(activeStage.stage_name || `Stage ${this.currentStageIndex + 1}`)}">
              ${this._escapeHtml(activeStage.stage_name || `Stage ${this.currentStageIndex + 1}`)}
            </span>
            <span class="at-stage-counter">#${this.currentStageIndex + 1}/${stages.length}</span>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      ${indicatorHtml}

      <!-- 1. 核心采样配置 (最高优先级) -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>核心采样配置</span>
        </div>
        <div class="at-meta-grid">
          <div class="at-meta-item" style="grid-column: 1 / -1;">
            <span class="at-meta-item-label">模型 (Checkpoint / Net)</span>
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

      <!-- 2. 挂载 LoRA 列表 -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>挂载 LoRA (${loras.length})</span>
          ${loras.length > 0 ? `<button class="at-copy-btn" data-copy="loras">📋 复制标签</button>` : ""}
        </div>
        ${loras.length > 0
        ? `
          <div class="at-lora-pills">
            ${loras
          .map(
            (l) => `
              <div class="at-lora-pill" title="${this._escapeHtml(l.name)}">
                <span class="at-lora-pill-name">${this._escapeHtml(l.name)}</span>
                <span class="at-lora-pill-val">${l.strength}</span>
              </div>
            `
          )
          .join("")}
          </div>
        `
        : `
          <div class="at-meta-text-empty">
            (无挂载 LoRA)
          </div>
        `
      }
      </section>

      <!-- 3. 提示词 (Prompt) -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>提示词 (Prompt)</span>
          <button class="at-copy-btn" data-copy="pos">📋 复制</button>
        </div>
        <div class="at-meta-text at-thin-scrollbar">${this._escapeHtml(pos)}</div>
      </section>

      <!-- 4. 反向 (Negative) -->
      <section class="at-meta-section">
        <div class="at-meta-section-header">
          <span>反向 (Negative)</span>
          <button class="at-copy-btn" data-copy="neg">📋 复制</button>
        </div>
        <div class="at-meta-text at-thin-scrollbar">${this._escapeHtml(neg)}</div>
      </section>

      <!-- 5. 文件属性 -->
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

    this._bindEvents(pos, neg, seed, loras, stages);
  }

  _bindEvents(pos, neg, seed, loras, stages) {
    // 药丸指示器点击
    this.container.querySelectorAll(".at-stage-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const idx = parseInt(pill.getAttribute("data-stage-idx"), 10);
        if (!isNaN(idx) && idx !== this.currentStageIndex) {
          this.currentStageIndex = idx;
          this._render();
        }
      });
    });

    // 阶段上一页 / 下一页箭头
    this.container.querySelector(".at-stage-prev-btn")?.addEventListener("click", () => {
      if (this.currentStageIndex > 0) {
        this.currentStageIndex--;
        this._render();
      }
    });

    this.container.querySelector(".at-stage-next-btn")?.addEventListener("click", () => {
      if (stages && this.currentStageIndex < stages.length - 1) {
        this.currentStageIndex++;
        this._render();
      }
    });

    const copyToClipboard = async (text, btn) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
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

    this.container.querySelector('[data-copy="loras"]')?.addEventListener("click", (e) => {
      const loraTagString = loras
        .map((l) => `<lora:${l.name}:${l.strength}>`)
        .join(", ");
      copyToClipboard(loraTagString, e.target);
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