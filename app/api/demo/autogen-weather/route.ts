import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(req: NextRequest) {
	let body: any = {};
	try { body = await req.json(); } catch {}
	const prompt = String(body?.prompt || body?.city || 'what is the weather in San Francisco and what should I wear?');
	const python = String(process.env.AUTOGEN_PYTHON || 'python');
	const cwd = process.cwd();

	if (!process.env.ATCPRO_INGEST_API_KEY) {
		return NextResponse.json({ ok: false, error: 'Missing ATCPRO_INGEST_API_KEY in server env' });
	}

	return new Promise<NextResponse>((resolve) => {
		const env = { ...process.env, PROMPT: prompt } as NodeJS.ProcessEnv;
		const proc = spawn(python, ['scripts/autogen_weather.py'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		proc.stdout?.on('data', (d) => { try { out += d.toString(); } catch {} });
		proc.stderr?.on('data', (d) => { try { err += d.toString(); } catch {} });
		proc.on('error', (e) => {
			const hint = `Spawn error: ${e?.message || e}. Hint: set AUTOGEN_PYTHON to your venv Python.`;
			console.error('[autogen-weather] spawn error', hint);
			resolve(NextResponse.json({ ok: false, error: hint }));
		});
		proc.on('exit', (code) => {
			if (code === 0) {
				resolve(NextResponse.json({ ok: true, output: out.trim().slice(-2000) || undefined }));
			} else {
				const msg = `Exited ${code}\nSTDOUT:\n${out.trim().slice(-2000)}\nSTDERR:\n${err.trim().slice(-2000)}`;
				console.error('[autogen-weather] process failed', msg);
				resolve(NextResponse.json({ ok: false, error: msg }));
			}
		});
	});
}
