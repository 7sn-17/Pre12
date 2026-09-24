// ============================================
// إعدادات Supabase
// ============================================
const SUPABASE_URL = 'https://pfjpeqhevegivjmyjvux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmanBlcWhldmVnaXZqbXlqdnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDA5NTUsImV4cCI6MjEwNTgxNjk1NX0.JfmMcjUnoAU8baaaeKbwaXxSGtliAww-b-hNBKwuVFA';

// ============================================
// إنشاء Client
// ============================================
const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);