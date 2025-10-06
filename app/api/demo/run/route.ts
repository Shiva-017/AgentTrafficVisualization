import { NextRequest, NextResponse } from 'next/server';
import { runDemoAgent } from '@/lib/server/agents/demo';

export async function POST(req: NextRequest) {
	let body: any = {};
	try { body = await req.json(); } catch {}
	const task = String(body?.task || 'Research and summarize ATC Pro design');
	// Fire and forget to keep request fast
	void runDemoAgent(task);
	return NextResponse.json({ ok: true, task });
}
