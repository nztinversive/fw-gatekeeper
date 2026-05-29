export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { getEncodingValidationMessage, isSupportedEncoding } from '@/lib/encoding';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { unauthorizedApiResponse } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  return (await hasValidPortalSession(req, ['admin'])) ? null : unauthorizedApiResponse();
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const includeEncodings = req.nextUrl.searchParams.get('include_encodings') === 'true';
  const workers = await convex.query(api.workers.list, { includeEncodings });
  return NextResponse.json(workers);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const { name, department, face_encoding } = body;

  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (!isSupportedEncoding(face_encoding)) {
    return NextResponse.json(
      { error: `Face enrollment required. Use /api/enroll so photos are encoded first. ${getEncodingValidationMessage('face_encoding')}` },
      { status: 400 }
    );
  }

  const result = await convex.mutation(api.workers.create, {
    name,
    department: department || undefined,
    faceEncoding: face_encoding,
  });

  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const { id, name, department, face_encoding } = body;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  if (face_encoding !== undefined && !isSupportedEncoding(face_encoding)) {
    return NextResponse.json({ error: getEncodingValidationMessage('face_encoding') }, { status: 400 });
  }

  const updates: Record<string, unknown> = { id };
  if (name !== undefined) updates.name = name;
  if (department !== undefined) updates.department = department;
  if (face_encoding !== undefined) updates.faceEncoding = face_encoding;

  await convex.mutation(api.workers.update, updates as any);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await convex.mutation(api.workers.remove, { id: id as any });
  return NextResponse.json({ ok: true });
}
