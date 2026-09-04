// web/services/api.js
/**
 * 项目代号: Asset Triage
 * 文件功能: 封装与后端的异步 RESTful API 数据交互，处理统一异常与状态码。
 */

export class TriageApi {
  /**
   * 拉取当前待审队列的所有资产
   * @returns {Promise<Array>} 资产列表
   */
  static async getItems() {
    try {
      const res = await fetch("/asset_triage/items");
      if (!res.ok) throw new Error(`HTTP 错误 ${res.status}`);
      const data = await res.json();
      return data.success ? data.items : [];
    } catch (err) {
      console.error("[AssetTriage] 获取待审列表失败:", err);
      return [];
    }
  }

  /**
   * 获取单张图片的完整元数据 (包含 Prompt 与 Workflow JSON)
   * @param {string} assetId 
   * @returns {Promise<Object|null>}
   */
  static async getMetadata(assetId) {
    try {
      const res = await fetch(`/asset_triage/meta/${encodeURIComponent(assetId)}`);
      if (!res.ok) throw new Error(`HTTP 错误 ${res.status}`);
      const data = await res.json();
      return data.success ? data.data : null;
    } catch (err) {
      console.error(`[AssetTriage] 获取元数据失败 [${assetId}]:`, err);
      return null;
    }
  }

  /**
   * 提交批量/单张转存任务
   * @param {Array<{id: string, category?: string}>} items 
   * @param {Object} preset 
   * @returns {Promise<{success: boolean, exported: string[], failed: Array}>}
   */
  static async exportAssets(items, preset) {
    try {
      const res = await fetch("/asset_triage/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, preset })
      });
      return await res.json();
    } catch (err) {
      console.error("[AssetTriage] 转存请求异常:", err);
      return { success: false, exported: [], failed: items.map(i => ({ id: i.id, error: err.message })) };
    }
  }

  /**
   * 物理废弃删除图片及缓存
   * @param {string[]} ids 
   * @returns {Promise<{success: boolean, deleted: string[], failed: string[]}>}
   */
  static async deleteAssets(ids) {
    try {
      const res = await fetch("/asset_triage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      return await res.json();
    } catch (err) {
      console.error("[AssetTriage] 删除请求异常:", err);
      return { success: false, deleted: [], failed: ids };
    }
  }

  /**
   * 获取转存预设列表
   */
  static async getPresets() {
    try {
      const res = await fetch("/asset_triage/presets");
      const data = await res.json();
      return data.success ? data.presets : [];
    } catch (err) {
      console.error("[AssetTriage] 获取预设列表失败:", err);
      return [];
    }
  }

  /**
   * 保存转存预设列表
   */
  static async savePresets(presets) {
    try {
      const res = await fetch("/asset_triage/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets })
      });
      const data = await res.json();
      return data.success;
    } catch (err) {
      console.error("[AssetTriage] 保存预设失败:", err);
      return false;
    }
  }

  /**
   * 获取用户设置
   */
  static async getSettings() {
    try {
      const res = await fetch("/asset_triage/settings");
      const data = await res.json();
      return data.success ? data.settings : {};
    } catch (err) {
      console.error("[AssetTriage] 获取设置失败:", err);
      return {};
    }
  }

  /**
   * 保存用户设置
   */
  static async saveSettings(settings) {
    try {
      const res = await fetch("/asset_triage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      return data.success;
    } catch (err) {
      console.error("[AssetTriage] 保存设置失败:", err);
      return false;
    }
  }
}