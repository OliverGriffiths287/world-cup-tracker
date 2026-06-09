import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const { matchId, regionId } = body;

    if (!matchId || !regionId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // This adds +1 to the specific region for the active match
    await kv.hincrby(matchId, regionId, 1);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}