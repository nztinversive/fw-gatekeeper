export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { unauthorizedApiResponse } from '@/lib/auth';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import {
  reconcileEmployeeDirectory,
  filterEmployeeDirectory,
  type EmployeeDirectoryFilter,
} from '@/lib/employee-directory';

// Serves enrollment typeahead suggestions server-side so the full employee
// roster (names, IDs, departments) never ships in the client JS bundle.
export async function GET(req: NextRequest) {
  if (!(await hasValidPortalSession(req, ['admin', 'enrollment']))) {
    return unauthorizedApiResponse();
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() || '';
  const requestedStatus = req.nextUrl.searchParams.get('status');
  const status: EmployeeDirectoryFilter = requestedStatus === 'enrolled'
    || requestedStatus === 'invalid'
    || requestedStatus === 'not_enrolled'
    || requestedStatus === 'remaining'
    ? requestedStatus
    : 'all';

  const workers = await convex.query(api.workers.list, { includeEncodings: false });
  const { employees, summary } = reconcileEmployeeDirectory(workers.map((worker) => ({
    id: worker.id,
    name: worker.name,
    employeeId: worker.employee_id,
    encodingStatus: worker.encoding_status,
  })));
  const suggestions = filterEmployeeDirectory(employees, query, status);

  return NextResponse.json({ suggestions, summary });
}
