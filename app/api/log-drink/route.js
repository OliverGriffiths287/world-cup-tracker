import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const runtime = 'edge';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function POST(request) {
  try {
    const { matchId, regionId, drinkType } = await request.json();
    if (!matchId || !regionId || !drinkType) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    // Database key now uses 'region' instead of 'county'
    const redisKey = `worldcup:match:${matchId}:region:${regionId}`;
    await redis.hincrby(redisKey, drinkType, 1);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}