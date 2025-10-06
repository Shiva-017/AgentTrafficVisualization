import { NextRequest, NextResponse } from 'next/server';
import { runMultiAgentDemo } from '@/lib/server/agents/multiDemo';

export async function POST(req: NextRequest) {
	let body: any = {};
	try { body = await req.json(); } catch {}
	const task = String(body?.task || 'Compare two approaches and synthesize a short answer');
	void runMultiAgentDemo(task);
	return NextResponse.json({ ok: true, task });
}
