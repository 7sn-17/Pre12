// ============================================
// auth.js — مكتبة المصادقة المساعدة
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
    // حفظ الصفحة الحالية للعودة إليها بعد الدخول
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
// 7. إنشاء حساب جديد
// ============================================
async function signUp(email, password, fullName) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim().toLowerCase(),
      password: password,
      options: {
        data: {
          full_name: fullName.trim()
        }
      }
    });
    
    if (error) throw error;
    
    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}

// ============================================
// 8. تسجيل الخروج
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
// 9. إعادة تعيين كلمة المرور
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
// 10. ترجمة أخطاء Supabase إلى العربية
// ============================================
function translateAuthError(message) {
  const errors = {
    'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'Email not confirmed': 'يرجى تأكيد بريدك الإلكتروني أولاً',
    'User already registered': 'هذا البريد مسجل بالفعل',
    'Password should be at least 6 characters': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    'Unable to validate email address: invalid format': 'صيغة البريد الإلكتروني غير صحيحة',
    'Email rate limit exceeded': 'محاولات كثيرة. حاول لاحقاً',
    'Signup requires a valid password': 'كلمة المرور غير صحيحة',
    'User not found': 'المستخدم غير موجود',
    'For security purposes, you can only request this once every 60 seconds': 
      'لأسباب أمنية، يمكنك المحاولة مرة كل 60 ثانية',
    'New password should be different from the old password': 
      'كلمة المرور الجديدة يجب أن تختلف عن القديمة'
  };
  
  return errors[message] || message;
}

// ============================================
// 11. مراقبة تغيرات حالة الدخول
// ============================================
function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('🔔 Auth Event:', event);
    callback(event, session);
  });
}

// ============================================
// 12. حفظ صفحة العودة
// ============================================
function getRedirectAfterLogin() {
  const redirect = sessionStorage.getItem('redirect_after_login');
  sessionStorage.removeItem('redirect_after_login');
  return redirect || 'index.html';
}

console.log('✅ auth.js loaded');