// ============================================
// auth.js — مكتبة المصادقة المساعدة v2.0
// تُستخدم في جميع الصفحات
// ============================================

// ============================================
// 1. الحصول على المستخدم الحالي
// ============================================
async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return user;
  } catch (err) {
    console.error('getCurrentUser error:', err);
    return null;
  }
}

// ============================================
// 2. الحصول على الجلسة الحالية
// ============================================
async function getSession() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return session;
  } catch (err) {
    console.error('getSession error:', err);
    return null;
  }
}

// ============================================
// 3. الحصول على الملف الشخصي (profile)
// ============================================
async function getProfile(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (err) {
    console.error('getProfile error:', err);
    return null;
  }
}

// ============================================
// 4. حماية الصفحات — يجب تسجيل الدخول
// ============================================
async function requireAuth(redirectTo = 'login.html') {
  const session = await getSession();
  if (!session) {
    const currentPage = window.location.pathname.split('/').pop() + window.location.search;
    sessionStorage.setItem('redirect_after_login', currentPage);
    window.location.href = redirectTo;
    return null;
  }
  return session.user;
}

// ============================================
// 5. عكس الحماية — إذا مسجل، لا تدخل login
// ============================================
async function redirectIfLoggedIn(redirectTo = 'index.html') {
  const session = await getSession();
  if (session) {
    window.location.href = redirectTo;
    return true;
  }
  return false;
}

// ============================================
// 6. تسجيل الدخول
// ============================================
async function signIn(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });
    
    if (error) throw error;
    
    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 7. إنشاء حساب جديد — نسخة محسّنة
// ============================================
async function signUp(email, password, fullName) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    
    const { data, error } = await supabaseClient.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          full_name: fullName.trim()
        },
        emailRedirectTo: window.location.origin + '/confirm.html'
      }
    });
    
    if (error) throw error;
    
    // ✅ تحقق إضافي: هل الحساب موجود مسبقاً؟
    // Supabase يرجع user موجود بدون session عندما يكون البريد مسجلاً مسبقاً
    // وأيضاً identities فارغة
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { 
        success: false, 
        error: 'هذا البريد مسجل مسبقاً. جرّب تسجيل الدخول أو استعادة كلمة المرور.' 
      };
    }
    
    return { 
      success: true, 
      user: data.user, 
      session: data.session,
      email: cleanEmail,
      needsVerification: !data.session  // ✅ يحتاج تأكيد البريد
    };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 8. إعادة إرسال رابط التأكيد
// ============================================
async function resendConfirmation(email) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    
    const { error } = await supabaseClient.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin + '/confirm.html'
      }
    });
    
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 9. تسجيل الخروج
// ============================================
async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================
// 10. إعادة تعيين كلمة المرور
// ============================================
async function resetPassword(email) {
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: window.location.origin + '/reset-password.html'
      }
    );
    
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 11. تأكيد رمز OTP (يُستخدم في confirm.html)
// ============================================
async function verifyEmailOtp(tokenHash, type = 'signup') {
  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: type
    });
    
    if (error) throw error;
    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 12. ترجمة أخطاء Supabase إلى العربية
// ============================================
function translateAuthError(message) {
  if (!message) return 'حدث خطأ غير متوقع';
  
  const msg = message.toLowerCase();
  
  const errors = {
    'invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'email not confirmed': 'يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من بريدك واضغط على رابط التأكيد.',
    'user already registered': 'هذا البريد مسجل مسبقاً',
    'password should be at least 6 characters': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    'unable to validate email address: invalid format': 'صيغة البريد الإلكتروني غير صحيحة',
    'email rate limit exceeded': 'محاولات كثيرة. حاول بعد دقيقة',
    'signup requires a valid password': 'كلمة المرور غير صحيحة',
    'user not found': 'المستخدم غير موجود',
    'for security purposes, you can only request this once every 60 seconds': 
      'لأسباب أمنية، يمكنك المحاولة مرة كل 60 ثانية',
    'new password should be different from the old password': 
      'كلمة المرور الجديدة يجب أن تختلف عن القديمة',
    'invalid email': 'البريد الإلكتروني غير صحيح',
    'email address is invalid': 'البريد الإلكتروني غير صحيح',
    'token has expired or is invalid': 'رابط التأكيد منتهي أو غير صحيح',
    'email link is invalid or has expired': 'رابط التأكيد منتهي — اطلب رابطاً جديداً',
    'user already confirmed': 'تم تأكيد بريدك مسبقاً',
    'over_email_send_rate_limit': 'محاولات كثيرة. حاول بعد دقيقة'
  };
  
  // بحث مباشر
  if (errors[msg]) return errors[msg];
  
  // بحث جزئي
  for (const [key, value] of Object.entries(errors)) {
    if (msg.includes(key)) return value;
  }
  
  return message;
}

// ============================================
// 13. مراقبة تغيرات حالة الدخول
// ============================================
function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('🔔 Auth Event:', event);
    callback(event, session);
  });
}

// ============================================
// 14. حفظ صفحة العودة
// ============================================
function getRedirectAfterLogin() {
  const redirect = sessionStorage.getItem('redirect_after_login');
  sessionStorage.removeItem('redirect_after_login');
  return redirect || 'index.html';
}

// ============================================
// 15. تحقق متقدم من البريد (Regex محسّن)
// ============================================
function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  
  const cleaned = email.trim();
  
  // طول منطقي
  if (cleaned.length < 6 || cleaned.length > 254) return false;
  
  // Regex محسّن
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(cleaned)) return false;
  
  // تحقق إضافي
  const [localPart, domain] = cleaned.split('@');
  
  // الجزء المحلي
  if (localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;
  
  // النطاق
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  if (!domain.includes('.')) return false;
  
  // نطاقات شائعة يجب أن تكون TLD صحيح
  const tld = domain.split('.').pop();
  if (tld.length < 2) return false;
  
  return true;
}

// ============================================
// 16. Rate Limiter (يمنع السبام)
// ============================================
const RateLimiter = {
  key: 'medfav_rate_limit',
  
  // فحص إمكانية الإرسال
  canSend(action = 'default', limit = 60000) {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || '{}');
      const lastSent = data[action] || 0;
      const now = Date.now();
      
      if (now - lastSent < limit) {
        const remaining = Math.ceil((limit - (now - lastSent)) / 1000);
        return { allowed: false, remaining };
      }
      return { allowed: true, remaining: 0 };
    } catch (err) {
      return { allowed: true, remaining: 0 };
    }
  },
  
  // تسجيل إرسال جديد
  record(action = 'default') {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || '{}');
      data[action] = Date.now();
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      console.error('RateLimiter.record error:', err);
    }
  },
  
  // مسح سجل إجراء
  clear(action = 'default') {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || '{}');
      delete data[action];
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      console.error('RateLimiter.clear error:', err);
    }
  },
  
  // الوقت المتبقي بالثواني
  getRemaining(action = 'default', limit = 60000) {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || '{}');
      const lastSent = data[action] || 0;
      const elapsed = Date.now() - lastSent;
      if (elapsed >= limit) return 0;
      return Math.ceil((limit - elapsed) / 1000);
    } catch (err) {
      return 0;
    }
  }
};

console.log('✅ auth.js v2.0 loaded');