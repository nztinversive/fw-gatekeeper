export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { unauthorizedApiResponse } from '@/lib/auth';
import { searchEmployeeDirectory } from '@/lib/employee-directory';

// Serves enrollment typeahead suggestions server-side so the full employee
// roster (names, IDs, departments) never ships in the client JS bundle.
export async function GET(req: NextRequest) {
  if (!(await hasValidPortalSession(req, ['admin', 'enrollment']))) {
    return unauthorizedApiResponse();
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() || '';
  if (!query) return NextResponse.json({ suggestions: [] });

  return NextResponse.json({ suggestions: searchEmployeeDirectory(query) });
}
