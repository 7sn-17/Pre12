// ============================================
// Theme Init — يعمل قبل رسم الصفحة
// ============================================
(function() {
  try {
    var theme = localStorage.getItem('medfav_theme');
    
    // إذا لم يختر المستخدم ثيماً من قبل → الوضع النهاري افتراضياً
    if (!theme) {
      theme = 'light';
      localStorage.setItem('medfav_theme', 'light');
    }
    
    // طبّق الثيم على <html>
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // في حالة الخطأ → نهاري
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();