// ============================================================
// _shared/fcm.ts — مرسل Firebase Cloud Messaging (HTTP v1)
// ------------------------------------------------------------
// ⭐ يُستخدم في دالّتَي:
//    • send-admin-notification  (إشعار يدوي من لوحة التحكم)
//    • smart-notifications-engine (المحرّك الآلي)
//
// ⭐ مصادقة FCM:
//    1) المسار الرسمي: HTTP v1 عبر حساب خدمة (Service Account)
//       → المفتاح يُقرأ من المتغيّر FCM_SERVICE_ACCOUNT أو من Supabase Vault
//    2) مسار بديل: واجهة HTTP القديمة بمفتاح الـ API
//       (يُستخدم فقط عند غياب حساب الخدمة)
//
// ⭐ لا نُسجّل أبداً المفتاح الخاص في السجلّات.
// ============================================================

export interface FcmMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** ⭐ v4.5.0 — Android notification channel (streak/tasks/content/updates). */
  channelId?: string;
  /** ⭐ v4.5.0 — override the notification sound; defaults to "default". */
  sound?: string;
}

export interface FcmSender {
  mode: 'v1';
  send(token: string, message: FcmMessage): Promise<boolean>;
}

/* ─────────────────────────────────────────────
   أدوات التشفير
   ───────────────────────────────────────────── */

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PEM (PKCS#8) → DER */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlDecode(body);
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/* ─────────────────────────────────────────────
   حساب الخدمة
   ───────────────────────────────────────────── */

async function readVaultSecret(name: string): Promise<string | null> {
  try {
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return null;

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.rpc('vault_read_secret_text', { secret_name: name });
    if (error) return null;
    return (data as string) || null;
  } catch (e) {
    return null;
  }
}

/** ⭐ يبحث عن حساب الخدمة: المتغيّر ثم Vault */
export async function getServiceAccount(): Promise<ServiceAccount | null> {
  // ⭐ ثلاثة مصادر: متغيّرات البيئة (باسمين) ثم Supabase Vault
  const raw =
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ||
    Deno.env.get('FCM_SERVICE_ACCOUNT') ||
    (await readVaultSecret('fcm_service_account'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.client_email && parsed.private_key && parsed.project_id) {
      return parsed as ServiceAccount;
    }
  } catch (e) {
    console.warn('[fcm] the service account is not valid JSON');
  }
  return null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** ⭐ obtains an OAuth2 access token (with caching) */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`) as BufferSource,
  );

  const assertion = `${header}.${payload}.${base64UrlEncode(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`the FCM token request failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

/* ─────────────────────────────────────────────
   الإرسال
   ───────────────────────────────────────────── */

async function sendV1(token: string, message: FcmMessage, sa: ServiceAccount): Promise<boolean> {
  const accessToken = await getAccessToken(sa);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data: message.data || {},
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: message.channelId || 'medapp_reminders',
              sound: message.sound || 'default',
              icon: 'ic_stat_icon',
              color: '#10b981',
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FCM v1: ${response.status} ${text.slice(0, 300)}`);
  }
  return true;
}

/**
 * ⭐⚠️ مسار FCM القديم (fcm.googleapis.com/fcm/send) **مات** — lately
 *   تُرجع 404. therefore the official HTTP v1 API with a service
 *   account is the only way to send. The old path was removed so the
 *   app does not fail silently.
 */

/** ⭐ يبني مُرسِلاً مناسباً حسب ما هو متاح */
export async function createSender(): Promise<FcmSender | null> {
  const sa = await getServiceAccount();
  if (sa) {
    return {
      mode: 'v1',
      async send(token: string, message: FcmMessage) {
        try {
          return await sendV1(token, message, sa);
        } catch (e) {
          console.warn('[fcm] v1 failed:', (e as Error).message);
          return false;
        }
      },
    };
  }

  // ⭐ لا بديل بدون حساب خدمة: نقطة FCM القديمة أُلغيت (404).
  console.error(
    '[fcm] no service account found — add FIREBASE_SERVICE_ACCOUNT_JSON ' +
    '(Edge Function secret) or the "fcm_service_account" Vault secret.',
  );
  return null;
}

/** ⭐ هل FCM مهيّأ؟ (للفحص قبل الإرسال) */
export async function isFcmConfigured(): Promise<boolean> {
  return !!(await getServiceAccount());
}

/** ⭐ يرسل لِعدد من التوكنات بالتوازي */
export async function sendBatch(
  sender: FcmSender,
  tokens: string[],
  message: FcmMessage,
  concurrency = 10,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const queue = tokens.slice();

  async function worker() {
    while (queue.length) {
      const token = queue.shift();
      if (!token) return;
      try {
        const ok = await sender.send(token, message);
        if (ok) sent++;
        else failed++;
      } catch (e) {
        failed++;
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, Math.max(1, tokens.length)); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { sent, failed };
}
