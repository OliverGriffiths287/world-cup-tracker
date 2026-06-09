import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const matchId = searchParams.get('matchId');

    if (!matchId) {
      return NextResponse.json({ error: 'Missing matchId' }, { status: 400 });
    }

    // Grab all regional scores for this match from Upstash
    const rawData = await kv.hgetall(matchId);

    // Format it so your frontend UI can read it properly
    const formattedData = {};
    if (rawData) {
      Object.keys(rawData).forEach(region => {
        formattedData[region] = {
          pint: Number(rawData[region]),
          total: Number(rawData[region])
        };
      });
    }

    return NextResponse.json({ data: formattedData });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}