// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  // 導航欄滾動效果
  const header = document.querySelector('.header');
  const navLinks = document.querySelectorAll('.main-nav a');
  
  // 滾動監聽
  window.addEventListener('scroll', () => {
    // 導航欄背景變化
    if (window.scrollY > 50) {
      header.style.backgroundColor = '#fff';
      header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    } else {
      header.style.backgroundColor = '#fff';
      header.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
    }
    
    // 高亮當前滾動位置對應的導航項
    highlightNavOnScroll();
  });
  
  // 平滑滾動到錨點
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      const targetId = this.getAttribute('href');
      if (targetId.startsWith('#')) {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          // 移除所有活動類
          navLinks.forEach(link => link.classList.remove('active'));
          // 添加活動類到當前點擊的連結
          this.classList.add('active');
          
          // 平滑滾動
          window.scrollTo({
            top: targetElement.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      }
    });
  });
  
  // 根據滾動位置高亮導航項
  function highlightNavOnScroll() {
    const scrollPosition = window.scrollY;
    
    // 獲取所有部分
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100;
      const sectionHeight = section.offsetHeight;
      const sectionId = section.getAttribute('id');
      
      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        // 移除所有活动类
        navLinks.forEach(link => link.classList.remove('active'));
        
        // 添加活動類到當前部分對應的導航連結
        const currentNavLink = document.querySelector(`.main-nav a[href="#${sectionId}"]`);
        if (currentNavLink) {
          currentNavLink.classList.add('active');
        }
      }
    });
  }
  
  // 聯絡表單提交
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // 獲取表單數據
      const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value
      };
      
      // 這裡可以添加表單驗證邏輯
      
      // 模擬表單提交
      console.log('表單數據:', formData);
      
      // 顯示提交成功消息
      alert('感謝您的留言！我們會盡快回覆您。');
      
      // 重置表單
      this.reset();
    });
  }
  
  // 初始化頁面時高亮當前導航項
  highlightNavOnScroll();
}); 