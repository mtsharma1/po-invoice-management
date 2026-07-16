import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const database = await pingDatabase();
    return NextResponse.json({ ok: true, database });
  } catch (error) {
    return NextResponse.json({ ok: false, database: false, error: error.message }, { status: 500 });
  }
}
