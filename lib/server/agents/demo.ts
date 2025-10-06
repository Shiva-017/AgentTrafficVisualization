import { serverState } from '@/lib/server/state';
import { serverBus } from '@/lib/server/pubsub';
import type { AppState } from '@/lib/types';

async function maybeGeminiSummarize(input: string): Promise<string> {
	const key = process.env.GEMINI_API_KEY;
	if (!key) return `Gemini disabled. Input: ${input.slice(0, 200)}`;
	try {
		const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: `Summarize in one sentence: ${input}` }] }],
			}),
		});
		const data = await resp.json();
		const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
		return String(text);
	} catch (e: any) {
		return `Gemini error: ${e?.message || e}`;
	}
}

export async function runDemoAgent(task: string) {
	// Create a basic snapshot with one planned item
	const snapshot: AppState = {
		items: {
			A1: {
				id: 'A1', group: 'A', sector: 'Demo', depends_on: [], desc: task,
				estimate_ms: 4000, started_at: undefined, eta_ms: 4000,
				tps_min: 1, tps_max: 4, tps: 1, tokens_done: 0, est_tokens: 20,
				status: 'assigned', agent_id: undefined,
			},
		},
		agents: {},
		metrics: {
			active_agents: 0, total_tokens: 0, total_spend_usd: 0,
			live_tps: 0, live_spend_per_s: 0, completion_rate: 0,
		},
		seed: 'realtime',
		running: true,
	};
	serverBus.publish(serverState.apply({ type: 'snapshot', state: snapshot }));

	// Start item
	serverBus.publish(serverState.apply({
		type: 'tick', tick_id: 1,
		items: [{ id: 'A1', status: 'in_progress', started_at: Date.now(), tps: 2 }],
		agents: [{ id: 'AG1', work_item_id: 'A1' }],
		metrics: { live_tps: 2 },
	}));

	// Optional real model call while we stream a few ticks
	const summaryPromise = maybeGeminiSummarize(task);

	for (let i = 0; i < 4; i++) {
		await new Promise(r => setTimeout(r, 700));
		serverBus.publish(serverState.apply({
			type: 'tick', tick_id: 2 + i,
			items: [{ id: 'A1', tps: 2 + i * 0.3, tokens_done: (i + 1) * 5, eta_ms: Math.max(0, 4000 - (i + 1) * 700) }],
			metrics: { live_tps: 2 + i * 0.3 },
		}));
	}

	const summary = await summaryPromise;

	// Complete item and clear agent
	serverBus.publish(serverState.apply({
		type: 'tick', tick_id: 10,
		items: [{ id: 'A1', status: 'done', agent_id: undefined, eta_ms: 0, desc: `${task} -> ${summary}` }],
		agents_remove: ['AG1'],
		metrics: { live_tps: 0 },
	}));
}
