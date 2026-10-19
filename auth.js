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
// 1.5 حالة الجلسة المشتركة + نافذة طلب تسجيل الدخول
// ------------------------------------------------------------
// ⭐ وضع الزائر: التصفح والمعاينة متاحان بلا حساب،
//   والحساب يُطلب فقط عند تنفيذ إجراء (مفضّلة · تنزيل).
// ============================================

var AUTH_USER = null;

function setAuthUser(user) {
  AUTH_USER = user || null;
  return AUTH_USER;
}

function getAuthUser() {
  return AUTH_USER;
}

/** هل المستخدم مسجّل الدخول؟ (متزامن — اعتماداً على آخر جلسة) */
function isUserLoggedIn() {
  return !!AUTH_USER;
}

/** ⭐ يعرض نافذة "سجّل الدخول" بدل إعادة التوجيه الفوري */
function showAuthPrompt(message) {
  var modal = document.getElementById('authRequiredModal');
  if (!modal) {
    // لا توجد نافذة في هذه الصفحة → نوجّه إلى صفحة الدخول.
    window.location.href = 'login.html';
    return;
  }
  var text = modal.querySelector('[data-auth-message]');
  if (text && message) text.textContent = message;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (window.lucide) window.lucide.createIcons();
}

function closeAuthPrompt() {
  var modal = document.getElementById('authRequiredModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * ⭐ بوابة كل إجراء يحتاج حساباً (مفضّلة · تنزيل للقراءة بلا إنترنت …).
 * @returns {boolean} true = مسموح بالمتابعة
 */
function requireLoginAction(message) {
  if (isUserLoggedIn()) return true;
  showAuthPrompt(message || 'سجّل الدخول للمتابعة — يمكنك التصفح كمشاهد بلا حساب.');
  return false;
}

// ============================================
// 2. الحصول على الجلسة الحالية
// ============================================
async function getSession() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    // ⭐ نحفظ المستخدم في متغيّر مشترك — كل الصفحات تعرف حالته.
    setAuthUser(session ? session.user : null);

    // Full account sync before callers read their local caches. The sync
    // module deduplicates calls, so multiple getSession() calls on one page
    // do not create extra network traffic.
    if (session && typeof runFullUserSync === 'function' && navigator.onLine) {
      try {
        await runFullUserSync(session.user);
      } catch (syncErr) {
        console.warn('Account sync failed; using cached data:', syncErr);
      }
    }
    return session;
  } catch (err) {
    console.error('getSession error:', err);
    return null;
  }
}

/**
 * ⭐ يعيد المستخدم الحالي (أو null) — لصفحات وضع الزائر.
 */
async function getSessionUser() {
  try {
    const session = await getSession();
    return session ? session.user : null;
  } catch (e) {
    return null;
  }
}

// ============================================
// 3. الحصول على الملف الشخصي (profile)
// ------------------------------------------------------------
// Offline-first: الملف الشخصي مخزَّن محلياً عند كل مزامنة ناجحة.
// بدون اتصال لا ننتظر فشل الشبكة — نقرأ النسخة المخزَّنة فوراً
// حتى لا يتحوّل اسم المستخدم/الرتبة إلى بيانات المصادقة الأساسية.
// ============================================

const MEDAPP_PROFILE_CACHE_KEY = 'medapp_profile_cache_v1';

// يخزّن الملف الشخصي محلياً حتى تُعرض البيانات فوراً دون اتصال.
function cacheProfile(profile, email) {
  if (!profile || !profile.id) return null;
  try {
    const payload = Object.assign({}, profile);
    // بعض الجداول لا تحفظ البريد — نضيفه من جلسة المصادقة.
    if (email && !payload.email) payload.email = email;
    localStorage.setItem(MEDAPP_PROFILE_CACHE_KEY, JSON.stringify({
      profile: payload,
      at: Date.now()
    }));
    return payload;
  } catch (err) {
    console.warn('cacheProfile error:', err);
    return null;
  }
}

// يقرأ النسخة المخزَّنة (فورية، بلا شبكة).
function getCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(MEDAPP_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const profile = parsed && parsed.profile ? parsed.profile : null;
    if (!profile || !profile.id) return null;
    if (userId && String(profile.id) !== String(userId)) return null;
    return profile;
  } catch (err) {
    return null;
  }
}

// يزيل النسخة المخزَّنة (عند تسجيل الخروج أو تبديل الحساب).
function clearCachedProfile() {
  try { localStorage.removeItem(MEDAPP_PROFILE_CACHE_KEY); } catch (err) {}
}

async function getProfile(userId) {
  // ⭐ Offline-first: لا نطلب الشبكة إطلاقاً إن كنا غير متصلين.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = getCachedProfile(userId);
    if (cached) return cached;
  }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (data) cacheProfile(data);
    return data;
  } catch (err) {
    // ⭐ الشبكة فشلت: النسخة المخزَّنة أفضل من لا شيء.
    const cached = getCachedProfile(userId);
    if (cached) {
      console.warn('getProfile: using cached profile (offline)');
      return cached;
    }
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

    // Pull the whole account into this device before the redirect. This is
    // the moment a user logging in on a new device receives tasks, notes,
    // favorites and (via the page-layer queries) albums from the cloud.
    if (navigator.onLine && typeof runFullUserSync === 'function') {
      try {
        await runFullUserSync(data.user, { force: true });
      } catch (syncErr) {
        console.warn('Post-login sync failed:', syncErr);
      }
    }

    // ⭐ خزّن الملف الشخصي محلياً حتى يعمل العرض دون اتصال من أول مرة.
    if (navigator.onLine && data.user) {
      try {
        const profile = await getProfile(data.user.id);
        if (profile) cacheProfile(profile, data.user.email);
      } catch (profileErr) {
        console.warn('Post-login profile fetch failed:', profileErr);
      }
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: translateAuthError(err.message) };
  }
}


// ============================================
// 6.5. تسجيل الدخول عبر Google
// ------------------------------------------------------------
// مساران:
//   • Native (داخل التطبيق): SocialLogin (Credential Manager) ← لا متصفح
//   • Web   (المتصفح)     : signInWithOAuth (إعادة توجيه)
// ============================================

/** هل نعمل داخل التطبيق الأصلي؟ */
function isNativeApp() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform());
  } catch (e) {
    return false;
  }
}

/** Web Client ID الخاص بتطبيق Google. */
function getGoogleWebClientId() {
  try {
    if (typeof GOOGLE_WEB_CLIENT_ID !== 'undefined' && GOOGLE_WEB_CLIENT_ID) {
      return String(GOOGLE_WEB_CLIENT_ID).trim();
    }
  } catch (e) {}
  return '';
}

/** رابط العودة: Deep Link داخل التطبيق، أو الموقع على الويب. */
function getAuthRedirectUrl() {
  if (isNativeApp()) {
    try {
      if (typeof APP_AUTH_REDIRECT_URL !== 'undefined' && APP_AUTH_REDIRECT_URL) {
        return APP_AUTH_REDIRECT_URL;
      }
    } catch (e) {}
    return 'com.pre12.medical://login-callback';
  }
  return window.location.origin + '/index.html';
}

/** ترميز base64url (بدون + / =) */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 🔒 nonce عشوائي (raw) — يُرسَل للمضيف بصيغة SHA-256 */
function generateRawNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

/** 🔒 بصمة SHA-256 للـ nonce */
async function hashNonceWithSha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/** ⭐ تدفّق Google الأصلي (بلا متصفح) */
async function signInWithGoogleNative() {
  const SocialLogin = window.Capacitor && window.Capacitor.Plugins
    ? window.Capacitor.Plugins.SocialLogin
    : null;
  if (!SocialLogin || typeof SocialLogin.login !== 'function') {
    return { success: false, error: 'SocialLogin غير متوفر في هذا التطبيق' };
  }

  const clientId = getGoogleWebClientId();
  if (!clientId) {
    return {
      success: false,
      error: 'لم يُضبط Web Client ID لتطبيق Google (GOOGLE_WEB_CLIENT_ID)'
    };
  }

  // 1) التهيئة
  await SocialLogin.initialize({
    google: { webClientId: clientId, mode: 'online' }
  });

  // 2) nonce خام + بصمته
  const rawNonce = generateRawNonce();
  const hashedNonce = await hashNonceWithSha256(rawNonce);

  // 3) طلب الدخول من Google أصلياً
  // ⭐ بدون `scopes`: المُزوّد يضيف النطاقات الافتراضية
  //    (email · profile · openid) تلقائياً، وتمرير نطاق مخصّص
  //    كان يرفض الطلب برسالة "You CANNOT use scopes…".
  const result = await SocialLogin.login({
    provider: 'google',
    options: { nonce: hashedNonce }
  });

  const idToken = result && result.response ? result.response.idToken : null;
  if (!idToken) {
    throw new Error('لم يُرجع Google مُعرّف هوية');
  }

  // 4) مبادلة الرمز مع Supabase
  const { data, error } = await supabaseClient.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce: rawNonce
  });
  if (error) throw error;

  return { success: true, user: data.user, session: data.session };
}

/** تدفّق الويب: إعادة توجيه إلى Google (للمتصفح فقط) */
async function signInWithGoogleWeb() {
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectUrl() }
    });
    if (error) throw error;
    return { success: true, pending: true };
  } catch (err) {
    return {
      success: false,
      error: translateAuthError(err && err.message ? err.message : 'فشل تسجيل الدخول عبر Google')
    };
  }
}

/**
 * ⭐ نقطة الدخول الموحّدة لزر Google.
 *
 * ⭐ داخل التطبيق: المسار الأصلي **فقط** — لا نعود أبداً إلى تدفّق
 *   الويب (كان يفتح المتصفح ويعلق على التحميل).
 *   إن لم يكن هناك Web Client ID نُبلغ المستخدم برسالة واضحة.
 * ⭐ على الويب: تدفّق إعادة التوجيه كما كان.
 */
async function signInWithGoogle(options) {
  options = options || {};

  if (isNativeApp()) {
    try {
      const result = await signInWithGoogleNative();
      if (result.success) {
        // ⭐ أغلق أي تبويب متصفح بقي مفتوحاً من تدفّق سابق.
        try {
          if (typeof closeNativeBrowser === 'function') closeNativeBrowser();
        } catch (e) {}
        if (typeof runFullUserSync === 'function' && result.user) {
          try { await runFullUserSync(result.user, { force: true }); } catch (e) {}
        }
      }
      return result;
    } catch (err) {
      console.warn('[auth] native Google sign-in failed:', err);
      // ⭐ لا نعود إلى الويب داخل التطبيق.
      return {
        success: false,
        error: translateAuthError(err && err.message ? err.message : 'فشل تسجيل الدخول عبر Google')
      };
    }
  }

  return signInWithGoogleWeb();
}

// ============================================
// 6.6. الروابط العميقة (Deep Links) للتطبيق الأصلي
// ------------------------------------------------------------
// com.pre12.medical://login-callback?code=...
// ============================================

/** ⭐ يستبدل كود PKCE بجلسة في Supabase */
async function handleAuthDeepLink(url) {
  if (!url) return false;
  try {
    // ⭐ التوكن قد يكون في الاستعلام (?...) أو في الجزء (#...)
    const parts = String(url).split('#');
    const queryPart = parts[0].split('?').slice(1).join('?');
    const fragmentPart = parts.slice(1).join('#');
    const params = new URLSearchParams(queryPart + '&' + fragmentPart);

    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorCode = params.get('error_code') || params.get('error');
    const errorDescription = params.get('error_description');
    const type = params.get('type') || '';

    if (errorCode) {
      console.warn('[auth] deep link error:', errorCode, errorDescription || '');
      try {
        window.dispatchEvent(new CustomEvent('medapp:auth-error', {
          detail: { error: errorCode, description: errorDescription || '' }
        }));
      } catch (e) {}
      return false;
    }

    const client = window.supabaseClient;
    if (!client || !client.auth) return false;

    let session = null;

    if (code && typeof client.auth.exchangeCodeForSession === 'function') {
      const result = await client.auth.exchangeCodeForSession(code);
      if (result && result.error) throw result.error;
      session = result && result.data ? result.data.session : null;
    } else if (accessToken && typeof client.auth.setSession === 'function') {
      // ⭐ التدفّق الضمني: التوكن في الرابط مباشرة.
      const result = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || ''
      });
      if (result && result.error) throw result.error;
      session = result && result.data ? result.data.session : null;
    }

    if (!session) return false;

    // ⭐ أغلق المتصفح ثم انتقل.
    try { if (typeof closeNativeBrowser === 'function') closeNativeBrowser(); } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('medapp:auth-success', {
        detail: { source: 'deep-link', type: type || 'signin' }
      }));
    } catch (e) {}

    // ⭐ استعادة كلمة المرور → صفحة تعيين كلمة المرور، غيرها → الرئيسية
    const isRecovery = type === 'recovery';
    setTimeout(function () {
      window.location.href = isRecovery ? 'reset-password.html' : 'index.html';
    }, 150);

    return true;
  } catch (err) {
    console.warn('[auth] deep link handling failed:', err);
    try {
      window.dispatchEvent(new CustomEvent('medapp:auth-error', {
        detail: { error: 'deep-link-failed' }
      }));
    } catch (e) {}
    return false;
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
        // ⭐ داخل التطبيق: رابط عميق يعيدنا إلى التطبيق بدل المتصفح
        emailRedirectTo: getAuthRedirectUrl()
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
    // Last chance to upload offline notes/tasks/favorites before the token is
    // removed. If this fails, local notes are deliberately retained.
    if (navigator.onLine && typeof runFullUserSync === 'function') {
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session && data.session.user) {
          await runFullUserSync(data.session.user, { force: true });
        }
      } catch (syncErr) {
        console.warn('Pre-signout sync failed:', syncErr);
      }
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    // Remove account-specific offline caches so the next person on this
    // device cannot see the previous account's tasks or favorites. Notes are
    // retained for the same account and guarded by the owner marker.
    if (typeof clearCloudLocalCaches === 'function') {
      try { await clearCloudLocalCaches({ keepNotes: true }); } catch (cacheErr) {}
    }
    // ⭐ امسح الملف الشخصي المخزَّن — لا يجوز أن يظهر اسم الحساب السابق.
    if (typeof clearCachedProfile === 'function') clearCachedProfile();
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
        // ⭐ داخل التطبيق: رابط عميق — وليس المتصفح
        redirectTo: getAuthRedirectUrl()
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