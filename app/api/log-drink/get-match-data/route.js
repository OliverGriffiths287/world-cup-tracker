import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { REGIONS } from '@/lib/constants';

export const runtime = 'edge';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');
    if (!matchId) return NextResponse.json({ error: 'No match ID provided' }, { status: 400 });

    const liveData = {};
    
    const pipeline = redis.pipeline();
    REGIONS.forEach((region) => {
      pipeline.hgetall(`worldcup:match:${matchId}:region:${region.id}`);
    });
    
    const results = await pipeline.exec();

    REGIONS.forEach((region, index) => {
      const data = results[index];
      const pints = parseInt(data?.pint || '0', 10);
      liveData[region.id] = {
        pint: pints,
        total: pints
      };
    });

    return NextResponse.json({ matchId, data: liveData }, { status: 200 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}