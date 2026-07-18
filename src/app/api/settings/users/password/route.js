import { getCurrentSession } from '@/lib/auth';
import { getSettingsUserPassword } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    if (!session?.admin) {
      return Response.json({ ok: false, error: 'Administrator access is required.' }, { status: 403 });
    }

    const payload = await request.json();
    const password = await getSettingsUserPassword(payload?.id);
    return Response.json({ ok: true, password });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
