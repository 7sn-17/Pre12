// ============================================
// theme-init.js — نظام الثيمات الموحّد
// يقرأ الثيم من localStorage ويطبّقه تلقائياً
// يُستخدم في جميع صفحات المنصة
// ============================================

(function() {
  'use strict';
  
  // قراءة الثيم المحفوظ
  const theme = localStorage.getItem('medfav_theme') || 'dark';
  
  // تطبيق الثيم فوراً (قبل رسم الصفحة)
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  
  // تحديث meta theme-color إذا كان موجوداً
  document.addEventListener('DOMContentLoaded', function() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#f8fafb' : '#06110d');
    }
  });
  
  console.log('✅ theme-init.js loaded - theme:', theme);
})();