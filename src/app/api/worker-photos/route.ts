export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { demoWriteMetadata, getDemoWorker, isDemoWriteMode } from '@/lib/demo-write-mode';

export async function GET(req: NextRequest) {
  try {
    const workerId = req.nextUrl.searchParams.get('worker_id');
    if (!workerId) {
      return NextResponse.json({ error: 'worker_id required' }, { status: 400 });
    }

    if (isDemoWriteMode()) {
      const worker = getDemoWorker(workerId);
      if (!worker) {
        return NextResponse.json({ error: 'Worker not found', photos: [] }, { status: 404 });
      }
      return NextResponse.json({
        worker_id: worker.id,
        name: worker.name,
        photos: [],
        count: 0,
        ...demoWriteMetadata(),
      });
    }

    const result = await convex.query(api.workers.getPhotoUrls, { id: workerId as any });
    if (!result) {
      return NextResponse.json({ error: 'Worker not found', photos: [] }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Photos GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}
