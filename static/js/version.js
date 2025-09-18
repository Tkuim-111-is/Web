// 版本信息管理
class VersionManager {
  constructor() {
    this.versionData = null;
    this.init();
  }

  async init() {
    await this.fetchVersion();
    this.displayVersion();
  }

  async fetchVersion() {
    try {
      const response = await fetch('/api/version');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          this.versionData = result.data;
        } else {
          console.error('獲取版本信息失敗:', result.message);
          this.versionData = this.getDefaultVersion();
        }
      } else {
        console.error('版本 API 請求失敗:', response.status);
        this.versionData = this.getDefaultVersion();
      }
    } catch (error) {
      console.error('獲取版本信息時發生錯誤:', error);
      this.versionData = this.getDefaultVersion();
    }
  }

  getDefaultVersion() {
    return {
      commitHash: 'unknown',
      version: 'v1.0.0',
      buildTime: new Date().toISOString()
    };
  }

  displayVersion() {
    const footerBottoms = document.querySelectorAll('.footer-bottom p');
    
    footerBottoms.forEach(footerBottom => {
      if (footerBottom && this.versionData) {
        // 創建版本信息元素
        const versionInfo = document.createElement('span');
        versionInfo.className = 'version-info';
        versionInfo.innerHTML = ` | <span class="version-hash" title="Git Commit Hash: ${this.versionData.commitHash}">版本: ${this.versionData.commitHash}</span>`;
        
        // 將版本信息添加到現有的版權信息後面
        footerBottom.appendChild(versionInfo);
      }
    });
  }

  // 提供公共方法獲取版本信息
  getVersion() {
    return this.versionData;
  }
}

// 當 DOM 加載完成後初始化版本管理器
document.addEventListener('DOMContentLoaded', () => {
  window.versionManager = new VersionManager();
});

// 如果需要在其他地方使用版本信息
window.getVersionInfo = () => {
  return window.versionManager ? window.versionManager.getVersion() : null;
};
