import { NextRequest, NextResponse } from 'next/server';
import {
  getStooqCaptchaImage,
  submitStooqCaptcha,
  StooqBlockedError,
} from '@/lib/stooq';

/** GET /api/stooq/captcha?session=<token> — returns the current CAPTCHA image (PNG). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('session');
  if (!token) {
    return NextResponse.json({ error: 'Missing session token' }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await getStooqCaptchaImage(token);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof StooqBlockedError ? error.message : 'Failed to load CAPTCHA';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** POST /api/stooq/captcha  body: { session, code } — submits the human's answer. */
export async function POST(request: NextRequest) {
  let body: { session?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { session, code } = body;
  if (!session || !code) {
    return NextResponse.json({ error: 'Missing session or code' }, { status: 400 });
  }

  try {
    const ok = await submitStooqCaptcha(session, code);
    return NextResponse.json({ ok });
  } catch (error) {
    const message = error instanceof StooqBlockedError ? error.message : 'CAPTCHA check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
