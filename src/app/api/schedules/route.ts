export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import {
  createDemoSchedule,
  deleteDemoSchedule,
  demoWriteMetadata,
  isDemoWriteMode,
  listDemoSchedules,
  updateDemoSchedule,
} from '@/lib/demo-write-mode';

export async function GET() {
  try {
    const schedules = await convex.query(api.schedules.list, {});
    return NextResponse.json(isDemoWriteMode() ? [...schedules, ...listDemoSchedules()] : schedules);
  } catch (error) {
    if (isDemoWriteMode()) {
      return NextResponse.json([...listDemoSchedules()]);
    }
    console.error('Schedules GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, days, start_time, end_time, department } = await req.json().catch(() => ({}));
    if (!name || !days || !start_time || !end_time) {
      return NextResponse.json({ error: 'name, days, start_time, and end_time required' }, { status: 400 });
    }
    if (isDemoWriteMode()) {
      const result = createDemoSchedule({
        name,
        days: typeof days === 'string' ? days : JSON.stringify(days),
        start_time,
        end_time,
        department: department || null,
      });
      return NextResponse.json({ ...result, ...demoWriteMetadata() }, { status: 201 });
    }
    const result = await convex.mutation(api.schedules.create, {
      name,
      days: typeof days === 'string' ? days : JSON.stringify(days),
      startTime: start_time,
      endTime: end_time,
      department: department || undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Schedules POST error:', error);
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, name, days, start_time, end_time, department } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = { id };
    if (name !== undefined) updates.name = name;
    if (days !== undefined) updates.days = typeof days === 'string' ? days : JSON.stringify(days);
    if (start_time !== undefined) updates.startTime = start_time;
    if (end_time !== undefined) updates.endTime = end_time;
    if (department !== undefined) updates.department = department || undefined;

    if (isDemoWriteMode()) {
      const result = updateDemoSchedule(id, {
        ...(name !== undefined ? { name } : {}),
        ...(days !== undefined ? { days: typeof days === 'string' ? days : JSON.stringify(days) } : {}),
        ...(start_time !== undefined ? { start_time } : {}),
        ...(end_time !== undefined ? { end_time } : {}),
        ...(department !== undefined ? { department: department || null } : {}),
      });
      return NextResponse.json({ ok: true, schedule: result, ...demoWriteMetadata() });
    }

    await convex.mutation(api.schedules.update, updates as any);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Schedules PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (isDemoWriteMode()) {
      deleteDemoSchedule(id);
      return NextResponse.json({ ok: true, ...demoWriteMetadata() });
    }
    await convex.mutation(api.schedules.remove, { id: id as any });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Schedules DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}
