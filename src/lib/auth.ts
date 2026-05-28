import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'fw-auth';
const AUTH_TTL_SECONDS = 60 * 60 * 12;
const TOKEN_VERSION = 1;

type AdminTokenPayload = {
  exp: number;
  iat: number;
  sub: 'admin';
  v: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || process.env.ADMIN_PIN || 'dev-fw-gatekeeper-secret';
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signValue(value: string): Promise<string> {
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = {
    sub: 'admin',
    iat: now,
    exp: now + AUTH_TTL_SECONDS,
    v: TOKEN_VERSION,
  };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminToken(token?: string | null): Promise<boolean> {
  if (!token) return false;

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return false;

  const expectedSignature = await signValue(encodedPayload);
  if (expectedSignature !== providedSignature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as Partial<AdminTokenPayload>;
    const now = Math.floor(Date.now() / 1000);
    return payload.sub === 'admin' && payload.v === TOKEN_VERSION && typeof payload.exp === 'number' && payload.exp > now;
  } catch {
    return false;
  }
}

export async function hasValidAdminSession(req: NextRequest): Promise<boolean> {
  return verifyAdminToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function getAdminCookieName(): string {
  return AUTH_COOKIE_NAME;
}

export function getAdminCookieMaxAge(): number {
  return AUTH_TTL_SECONDS;
}

function getKioskApiKey(): string {
  return process.env.KIOSK_API_KEY?.trim() || '';
}

export function hasValidKioskKey(req: NextRequest): boolean {
  const configuredKey = getKioskApiKey();
  if (!configuredKey) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice('Bearer '.length).trim() === configuredKey) {
    return true;
  }

  return req.headers.get('x-kiosk-key') === configuredKey;
}

export function unauthorizedApiResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function isKioskRequestAllowed(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;

  return (
    (pathname === '/api/sync' && req.method === 'GET') ||
    (pathname === '/api/attendance' && req.method === 'POST') ||
    (pathname === '/api/attendance/bulk' && req.method === 'POST')
  );
}
