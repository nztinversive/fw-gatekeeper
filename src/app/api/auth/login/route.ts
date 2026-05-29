import { NextRequest, NextResponse } from 'next/server';
import { createAdminToken, getAdminCookieMaxAge, getAdminCookieName } from '@/lib/auth';

function getAdminPin(): string {
  const pin = process.env.ADMIN_PIN?.trim();
  if (pin) return pin;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PIN is required in production');
  }

  return '1234';
}

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (pin !== getAdminPin()) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const token = await createAdminToken();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: getAdminCookieMaxAge(),
      path: '/',
    });

    return res;
  } catch (error) {
    if (error instanceof Error && error.message.includes('required in production')) {
      return NextResponse.json({ error: 'Auth is not configured' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
