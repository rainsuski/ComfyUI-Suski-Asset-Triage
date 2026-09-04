// web/components/confirm_dialog.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 专业级废弃销毁确认浮层组件：
 *          支持异步 Promise 调用、物理清理警示、数量高亮及“本次会话不再提示”免打扰记忆。
 */

export class ConfirmDialog {
    constructor() {
        this.backdrop = null;
        this.dontAskThisSession = false; // 会话级免打扰标记
        this._resolve = null;

        this._initDom();
    }

    _initDom() {
        const backdrop = document.createElement("div");
        backdrop.className = "at-dialog-backdrop at-hidden";

        backdrop.innerHTML = `
      <div class="at-dialog-container at-confirm-dialog-container">
        <div class="at-dialog-header">
          <div class="at-confirm-title-wrap">
            <div class="at-confirm-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <span class="at-dialog-title at-confirm-title">彻底废弃资产</span>
          </div>
          <button class="at-icon-btn at-btn-close-confirm">✕</button>
        </div>

        <div class="at-dialog-body">
          <div class="at-confirm-message">
            将物理清除选中的 <span class="at-confirm-count-highlight">0</span> 项资产，连带销毁其 Temp 原图、WebP 缩略图与元数据缓存。此操作无法撤销。
          </div>

          <label class="at-confirm-checkbox-label">
            <input type="checkbox" class="at-confirm-session-cb" />
            <span>本次会话不再弹出确认 (直至刷新页面)</span>
          </label>
        </div>

        <div class="at-dialog-footer">
          <button class="at-action-btn at-btn-cancel-confirm">取消</button>
          <button class="at-action-btn at-btn-danger at-btn-execute-delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>确认销毁</span>
          </button>
        </div>
      </div>
    `;

        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) this._close(false);
        });

        this.backdrop = backdrop;

        backdrop.querySelector(".at-btn-close-confirm").onclick = () => this._close(false);
        backdrop.querySelector(".at-btn-cancel-confirm").onclick = () => this._close(false);

        backdrop.querySelector(".at-btn-execute-delete").onclick = () => {
            const cb = backdrop.querySelector(".at-confirm-session-cb");
            if (cb && cb.checked) {
                this.dontAskThisSession = true;
            }
            this._close(true);
        };

        document.body.appendChild(backdrop);
    }

    /**
     * 呼出确认弹窗并返回 Promise
     * @param {Object} param0 
     * @returns {Promise<boolean>} 用户是否确认
     */
    prompt({ title = "彻底废弃资产", count = 1 }) {
        // 若已勾选会话免打扰，直接放行
        if (this.dontAskThisSession) {
            return Promise.resolve(true);
        }

        const q = (sel) => this.backdrop.querySelector(sel);
        q(".at-confirm-title").textContent = title;
        q(".at-confirm-count-highlight").textContent = String(count);
        q(".at-confirm-session-cb").checked = false;

        this.backdrop.classList.remove("at-hidden");

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    _close(result) {
        this.backdrop.classList.add("at-hidden");
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
}