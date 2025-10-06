import { serverBus } from '@/lib/server/pubsub';
import { serverState } from '@/lib/server/state';
import type { AppState } from '@/lib/types';

async function maybeGemini(text: string): Promise<string> {
	const key = process.env.GEMINI_API_KEY;
	if (!key) return `No response`;
	try {
		const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key), {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
		});
		const data = await resp.json();
		return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
	} catch { return 'No response'; }
}

function tick(partial: Parameters<typeof serverState.apply>[0]) {
	serverBus.publish(serverState.apply(partial as any));
}

export async function runMultiAgentDemo(task: string) {
	// Snapshot with planned items
	const snapshot: AppState = {
		items: {
			P1: { id: 'P1', group: 'P', sector: 'Plan', depends_on: [], desc: `Plan: ${task}`, estimate_ms: 2000, started_at: undefined, eta_ms: 2000, tps_min: 1, tps_max: 3, tps: 1, tokens_done: 0, est_tokens: 8, status: 'assigned', agent_id: undefined },
			R1: { id: 'R1', group: 'R', sector: 'Research', depends_on: ['P1'], desc: 'Research A', estimate_ms: 2500, started_at: undefined, eta_ms: 2500, tps_min: 1, tps_max: 3, tps: 1, tokens_done: 0, est_tokens: 10, status: 'queued', agent_id: undefined },
			R2: { id: 'R2', group: 'R', sector: 'Research', depends_on: ['P1'], desc: 'Research B', estimate_ms: 2500, started_at: undefined, eta_ms: 2500, tps_min: 1, tps_max: 3, tps: 1, tokens_done: 0, est_tokens: 10, status: 'queued', agent_id: undefined },
			W1: { id: 'W1', group: 'W', sector: 'Write', depends_on: ['R1','R2'], desc: 'Synthesize findings', estimate_ms: 2500, started_at: undefined, eta_ms: 2500, tps_min: 1, tps_max: 3, tps: 1, tokens_done: 0, est_tokens: 10, status: 'queued', agent_id: undefined },
		},
		agents: {},
		metrics: { active_agents: 0, total_tokens: 0, total_spend_usd: 0, live_tps: 0, live_spend_per_s: 0, completion_rate: 0 },
		seed: 'multi', running: true,
	};
	tick({ type: 'snapshot', state: snapshot });

	// Planner starts
	tick({ type: 'tick', tick_id: 1, items: [{ id: 'P1', status: 'in_progress', started_at: Date.now(), tps: 2 }], agents: [{ id: 'AGP', work_item_id: 'P1' }], metrics: { live_tps: 2 } });
	await new Promise(r => setTimeout(r, 600));
	tick({ type: 'tick', tick_id: 2, items: [{ id: 'P1', tokens_done: 4, eta_ms: 1400, tps: 2.2 }] });
	await new Promise(r => setTimeout(r, 700));
	const plan = await maybeGemini(`Create a short bullet plan for: ${task}. 2 bullets max.`);
	tick({ type: 'tick', tick_id: 3, items: [{ id: 'P1', status: 'done', eta_ms: 0, desc: `Plan: ${task} -> ${plan}` }], agents_remove: ['AGP'], metrics: { live_tps: 0 } });

	// Researchers become eligible and start in parallel
	tick({ type: 'tick', tick_id: 4, items: [{ id: 'R1', status: 'assigned' }, { id: 'R2', status: 'assigned' }] });
	tick({ type: 'tick', tick_id: 5, items: [
		{ id: 'R1', status: 'in_progress', started_at: Date.now(), tps: 2 },
		{ id: 'R2', status: 'in_progress', started_at: Date.now(), tps: 2 }
	], agents: [{ id: 'AGR1', work_item_id: 'R1' }, { id: 'AGR2', work_item_id: 'R2' }], metrics: { live_tps: 4 } });
	await new Promise(r => setTimeout(r, 800));
	tick({ type: 'tick', tick_id: 6, items: [{ id: 'R1', tokens_done: 6, eta_ms: 1700, tps: 2.3 }, { id: 'R2', tokens_done: 6, eta_ms: 1700, tps: 2.1 }] });
	await new Promise(r => setTimeout(r, 900));
	const r1 = await maybeGemini(`Research note A (one sentence) for: ${task}`);
	const r2 = await maybeGemini(`Research note B (one sentence) for: ${task}`);
	tick({ type: 'tick', tick_id: 7, items: [
		{ id: 'R1', status: 'done', eta_ms: 0, desc: `Research A -> ${r1}` },
		{ id: 'R2', status: 'done', eta_ms: 0, desc: `Research B -> ${r2}` }
	], agents_remove: ['AGR1','AGR2'], metrics: { live_tps: 0 } });

	// Writer becomes eligible
	tick({ type: 'tick', tick_id: 8, items: [{ id: 'W1', status: 'assigned' }] });
	tick({ type: 'tick', tick_id: 9, items: [{ id: 'W1', status: 'in_progress', started_at: Date.now(), tps: 2.2 }], agents: [{ id: 'AGW', work_item_id: 'W1' }], metrics: { live_tps: 2.2 } });
	await new Promise(r => setTimeout(r, 900));
	const synthesis = await maybeGemini(`Synthesize in one sentence using: ${r1} ${r2}`);
	tick({ type: 'tick', tick_id: 10, items: [{ id: 'W1', tokens_done: 9, eta_ms: 900, tps: 2.4 }] });
	await new Promise(r => setTimeout(r, 1000));
	tick({ type: 'tick', tick_id: 11, items: [{ id: 'W1', status: 'done', eta_ms: 0, desc: `Synthesis -> ${synthesis}` }], agents_remove: ['AGW'], metrics: { live_tps: 0 } });
}
