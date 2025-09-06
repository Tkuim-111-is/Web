// 等待DOM加載完成
document.addEventListener('DOMContentLoaded', () => {
  // 檢查 URL 中是否有 Google OAuth 回調的 token
  const urlParams = new URLSearchParams(globalThis.location.search);
  const token = urlParams.get('token');
  const loginSuccess = urlParams.get('login_success');
  
  if (token && loginSuccess === 'true') {
    // 儲存 token 到 localStorage
    localStorage.setItem('token', token);
    showMessage('Google 登入成功！', 'success');
    
    // 清除 URL 參數並刷新頁面
    globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
  }
  // 註冊表單處理
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // 獲取表單數據
      //const username = document.getElementById('username').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const terms = document.getElementById('terms').checked;
      
      // 表單驗證
      if (!email || !password || !confirmPassword) {
        showMessage('請填寫所有必填字段', 'error');
        return;
      }
      
      if (password !== confirmPassword) {
        showMessage('兩次輸入的密碼不一致', 'error');
        return;
      }
      
      if (!terms) {
        showMessage('請閱讀並同意服務條款和隱私政策', 'error');
        return;
      }
      
      // 發送註冊請求到Deno服務器
      fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({email, password }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage('註冊成功！正在跳轉到登入頁面...', 'success');
          
          // 延遲跳轉到登入頁面
          setTimeout(() => {
            globalThis.location.href = '/login.html';
          }, 2000);
        } else {
          showMessage(data.message || '註冊失敗，請稍後再試', 'error');
        }
      })
      .catch(error => {
        console.error('註冊錯誤:', error);
        showMessage('註冊過程中發生錯誤，請稍後再試', 'error');
      });
    });
  }
  
  // 登入表單處理
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // 獲取表單數據
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const _remember = document.getElementById('remember')?.checked || false;
      
      // 表單驗證
      if (!email || !password) {
        showMessage('請填寫所有必填字段', 'error');
        return;
      }

      fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({email, password }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // 儲存 JWT token
          localStorage.setItem('token', data.token);

          showMessage('登入成功！正在跳轉到首頁...', 'success');
          setTimeout(() => {
            globalThis.location.href = '/profile/index_login.html';
          }, 1000);
        } else {
          showMessage(data.message || '登入失敗，請稍後再試', 'error');
          setTimeout(() => {
            globalThis.location.href = '/login.html';
          }, 1000);
        }
      })
      .catch(error => {
        console.error('登入錯誤:', error);
        showMessage('登入過程中發生錯誤，請稍後再試', 'error');
        setTimeout(() => {
          globalThis.location.href = '/login.html';
        }, 2000);
      });
    });
  }
  
  // 密碼顯示/隱藏切換功能
  const passwordToggles = document.querySelectorAll('.password-toggle');
  if (passwordToggles.length > 0) {
    passwordToggles.forEach(toggle => {
      toggle.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const eyeIcon = this.querySelector('.eye-icon');
        const eyeOffIcon = this.querySelector('.eye-off-icon');
        
        if (passwordInput && eyeIcon && eyeOffIcon) {
          if (passwordInput.type === 'password') {
            // 顯示密碼
            passwordInput.type = 'text';
            eyeIcon.style.display = 'none';
            eyeOffIcon.style.display = 'block';
            this.setAttribute('aria-label', '隱藏密碼');
          } else {
            // 隱藏密碼
            passwordInput.type = 'password';
            eyeIcon.style.display = 'block';
            eyeOffIcon.style.display = 'none';
            this.setAttribute('aria-label', '顯示密碼');
          }
        }
      });
    });
  }
  
  // 社交登入按鈕
  const socialButtons = document.querySelectorAll('.btn-social');
  if (socialButtons.length > 0) {
    socialButtons.forEach(button => {
      button.addEventListener('click', function() {
        const provider = this.classList.contains('btn-google') ? 'Google' : 'Facebook';
        showMessage(`正在使用${provider}帳號登入...`, 'info');
      });
    });
  }
  
  // 顯示消息函數
  function showMessage(message, type = 'info') {
    // 檢查是否已存在消息元素
    let messageElement = document.querySelector('.auth-message');
    
    // 如果不存在，創建一個新的
    if (!messageElement) {
      messageElement = document.createElement('div');
      messageElement.className = 'auth-message';
      
      // 將消息元素插入到表單前面
      const form = document.querySelector('.auth-form');
      if (form) {
        form.parentNode.insertBefore(messageElement, form);
      }
    }
    
    // 設置消息類型和內容
    messageElement.className = `auth-message ${type}`;
    messageElement.textContent = message;
    
    // 顯示消息
    messageElement.style.display = 'block';
    
    // 3秒後自動隱藏
    setTimeout(() => {
      messageElement.style.display = 'none';
    }, 3000);
  }
  
  // 添加消息樣式
  const style = document.createElement('style');
  style.textContent = `
    .auth-message {
      padding: 12px 15px;
      margin-bottom: 20px;
      border-radius: 5px;
      text-align: center;
      display: none;
    }
    
    .auth-message.success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .auth-message.error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .auth-message.info {
      background-color: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }
  `;
  document.head.appendChild(style);
});