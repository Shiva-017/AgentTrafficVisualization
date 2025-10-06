import { NextRequest, NextResponse } from 'next/server';
import { serverBus } from '@/lib/server/pubsub';
import { serverState } from '@/lib/server/state';

function unauthorized() {
	return new NextResponse('Unauthorized', { status: 401 });
}

export async function POST(req: NextRequest) {
	const auth = req.headers.get('authorization') || '';
	const key = process.env.ATCPRO_INGEST_API_KEY || '';
	if (!key) {
		return new NextResponse('Server misconfigured', { status: 500 });
	}
	if (!auth.startsWith('Bearer ') || auth.slice(7) !== key) {
		return unauthorized();
	}
	let body: any;
	try {
		body = await req.json();
	} catch {
		return new NextResponse('Bad JSON', { status: 400 });
	}
	if (!body || typeof body !== 'object' || !('type' in body)) {
		return new NextResponse('Invalid payload', { status: 400 });
	}
	// apply to server state, get normalized msg
	const normalized = serverState.apply(body);
	// publish to subscribers (SSE streamers)
	serverBus.publish(normalized);
	return NextResponse.json({ ok: true });
}
