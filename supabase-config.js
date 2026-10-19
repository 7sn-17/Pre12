// ============================================
// إعدادات Supabase
// ============================================
const SUPABASE_URL = 'https://pfjpeqhevegivjmyjvux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmanBlcWhldmVnaXZqbXlqdnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDA5NTUsImV4cCI6MjEwNTgxNjk1NX0.JfmMcjUnoAU8baaaeKbwaXxSGtliAww-b-hNBKwuVFA';

// ============================================
// ⭐ Google Sign-In الأصلي (SocialLogin)
// ------------------------------------------
// Web Client ID من Google Cloud Console:
//   APIs & Services → Credentials → OAuth 2.0 Client IDs → Web
// يجب أن يطابق نفس الـ client id المسجّل في Supabase
// (Authentication → Providers → Google).
// اتركه فارغاً لتدفّق الويب (المتصفح).
const GOOGLE_WEB_CLIENT_ID = '537816557648-1lu9etodpb39afdaieisl2mevm6pdluk.apps.googleusercontent.com';

// رابط العودة داخل التطبيق (Deep Link) لتأكيد البريد واستعادة كلمة المرور.
const APP_AUTH_REDIRECT_URL = 'com.pre12.medical://login-callback';

// ============================================
// إنشاء Client
// ============================================
const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);