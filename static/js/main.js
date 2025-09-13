// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  // 導航欄滾動效果
  const header = document.querySelector('.header');
  const navLinks = document.querySelectorAll('.main-nav a');
  
  // 初始化滾動動畫
  initScrollAnimations();
  
  // 滾動監聽
  window.addEventListener('scroll', () => {
    // 導航欄背景變化
    if (window.scrollY > 50) {
      header.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
      header.style.backdropFilter = 'blur(20px)';
      header.style.borderBottom = '1px solid rgba(0, 0, 0, 0.1)';
    } else {
      header.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
      header.style.backdropFilter = 'blur(20px)';
      header.style.borderBottom = '1px solid rgba(0, 0, 0, 0.05)';
    }
    
    // 高亮當前滾動位置對應的導航項
    highlightNavOnScroll();
    
    // 滾動動畫
    handleScrollAnimations();
  });
  
  // 平滑滾動到錨點
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // 處理錨點連結（包含#的連結）
      if (href.includes('#')) {
        // 提取錨點ID（處理 index.html#about 或 #about 格式）
        const targetId = href.split('#')[1];
        if (targetId) {
          const targetElement = document.querySelector('#' + targetId);
          
          // 如果目標元素存在於當前頁面，進行平滑滾動
          if (targetElement) {
            e.preventDefault();
            
            // 移除所有活動類
            navLinks.forEach(link => link.classList.remove('active'));
            // 添加活動類到當前點擊的連結
            this.classList.add('active');
            
            // 平滑滾動
            window.scrollTo({
              top: targetElement.offsetTop - 100,
              behavior: 'smooth'
            });
          }
          // 如果目標元素不存在（在其他頁面），讓瀏覽器正常跳轉
          // 不阻止默認行為，讓連結正常工作
        }
      }
      // 其他連結（註冊、登入）正常跳轉，不阻止默認行為
    });
  });
  
  // 根據滾動位置高亮導航項
  function highlightNavOnScroll() {
    const scrollPosition = window.scrollY;
    
    // 獲取所有部分
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 120;
      const sectionHeight = section.offsetHeight;
      const sectionId = section.getAttribute('id');
      
      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        // 移除所有活動類
        navLinks.forEach(link => link.classList.remove('active'));
        
        // 添加活動類到當前部分對應的導航連結（處理多種href格式）
        const currentNavLink = document.querySelector(`.main-nav a[href="#${sectionId}"], .main-nav a[href="index.html#${sectionId}"]`);
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
  
  // 滾動動畫初始化
  function initScrollAnimations() {
    const scrollElements = document.querySelectorAll('.scroll-reveal');
    
    const elementInView = (el, dividend = 1) => {
      const elementTop = el.getBoundingClientRect().top;
      return (
        elementTop <= 
        (window.innerHeight || document.documentElement.clientHeight) / dividend
      );
    };
    
    const elementOutofView = (el) => {
      const elementTop = el.getBoundingClientRect().top;
      return (
        elementTop > 
        (window.innerHeight || document.documentElement.clientHeight)
      );
    };
    
    const displayScrollElement = (element) => {
      element.classList.add('revealed');
    };
    
    const hideScrollElement = (element) => {
      element.classList.remove('revealed');
    };
    
    const handleScrollAnimation = () => {
      scrollElements.forEach((el) => {
        if (elementInView(el, 1.25)) {
          displayScrollElement(el);
        } else if (elementOutofView(el)) {
          hideScrollElement(el);
        }
      });
    };
    
    window.addEventListener('scroll', handleScrollAnimation);
    
    // 初始檢查
    handleScrollAnimation();
  }
  
  // 處理滾動動畫
  function handleScrollAnimations() {
    // 暫時停用視差效果以避免重疊問題
    // 可以在未來重新啟用並優化
    
    // 浮動動畫元素
    const scrolled = window.pageYOffset;
    const floatingElements = document.querySelectorAll('.animate-float');
    floatingElements.forEach((el, index) => {
      const speed = 0.002 + (index * 0.001);
      const yPos = Math.sin(scrolled * speed) * 5; // 減少浮動幅度
      el.style.transform = `translateY(${yPos}px)`;
    });
  }
  
  // 添加微互動效果
  const microInteractionElements = document.querySelectorAll('.micro-interaction');
  microInteractionElements.forEach(element => {
    element.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.02)';
    });
    
    element.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1)';
    });
  });
  
  // 平滑滾動到頂部按鈕
  const scrollToTopBtn = document.createElement('button');
  scrollToTopBtn.innerHTML = '↑';
  scrollToTopBtn.className = 'scroll-to-top';
  scrollToTopBtn.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    border: none;
    font-size: 20px;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
    z-index: 1000;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  `;
  
  document.body.appendChild(scrollToTopBtn);
  
  // 顯示/隱藏滾動到頂部按鈕
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      scrollToTopBtn.style.opacity = '1';
      scrollToTopBtn.style.visibility = 'visible';
    } else {
      scrollToTopBtn.style.opacity = '0';
      scrollToTopBtn.style.visibility = 'hidden';
    }
  });
  
  // 滾動到頂部功能
  scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}); 