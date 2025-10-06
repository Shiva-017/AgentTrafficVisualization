"use client";

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ensureConnected, postIntent } from '@/lib/simClient';
import { connectRealtime } from '@/lib/realtimeClient';
import AudioPlayer from '@/components/AudioPlayer';
import { tracks, radio } from '@/lib/audio/tracks';
import { PLAN_NAMES, DEFAULT_PLAN_NAME } from '@/plans';
import { appStore } from '@/lib/store';

const LS_PREFIX = 'ccr.';
const LS = {
	plan: LS_PREFIX + 'plan',
	speed: LS_PREFIX + 'speed',
};

// Toggle for local simulation vs server realtime stream
const USE_SERVER_STREAM = true;

export default function ControlBar() {
	const [plan, setPlan] = useState<string>(DEFAULT_PLAN_NAME);
	const [demoTask, setDemoTask] = useState<string>('Research and summarize ATC Pro design');
	const pingEnabled = useSyncExternalStore(
		appStore.subscribe,
		() => appStore.getState().pingAudioEnabled,
		() => appStore.getState().pingAudioEnabled,
	);
	// Speed controls temporarily removed for stability
	// No longer exposing running/pause in UI

	useEffect(() => {
		if (USE_SERVER_STREAM) {
			// Connect to server SSE stream and rely on backend-driven updates
			connectRealtime();
			try {
				const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(LS.plan)) || DEFAULT_PLAN_NAME;
				setPlan(stored);
				try { appStore.getState().setPlanName(stored); } catch {}
			} catch {}
			return;
		}
		// Fallback: local worker simulation path
		ensureConnected();
		try {
			const stored = localStorage.getItem(LS.plan) || DEFAULT_PLAN_NAME;
			setPlan(stored);
			// Reflect selected plan in global UI store for ProjectId/Description
			try { appStore.getState().setPlanName(stored); } catch {}
			const url = new URL(window.location.href);
			const urlSeed = url.searchParams.get('seed');
			const randomSeed = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
			postIntent({ type: 'set_seed', seed: urlSeed || randomSeed });
			// Apply plan before starting engine to avoid pause from later set_plan
			postIntent({ type: 'set_plan', plan: stored });
			// Start the engine automatically
			postIntent({ type: 'set_running', running: true });
			// Snapshot to sync UI quickly
			postIntent({ type: 'request_snapshot' });
		} catch {}
	}, []);

	// Persist plan whenever it changes (engine is only updated via Execute or initial mount)
	useEffect(() => {
		try { localStorage.setItem(LS.plan, plan); } catch {}
	}, [plan]);
	// Speed persistence removed
	// running state persistence removed

	return (
		<div className="px-2 py-2 flex flex-wrap gap-2 items-center">
			<label className="text-sm text-gray-300">Project</label>
			<select
				value={plan}
				onChange={(e) => setPlan(e.target.value)}
				className="bg-black border border-gray-700 px-2 py-1 text-sm h-8 text-gray-100"
			>
				{PLAN_NAMES.map((p) => (
					<option key={p} value={p}>{p}</option>
				))}
			</select>
			<button
				onClick={() => {
					if (!USE_SERVER_STREAM) {
						// Apply plan and immediately start running (local sim)
						postIntent({ type: 'set_plan', plan: plan });
						postIntent({ type: 'set_running', running: true });
						postIntent({ type: 'request_snapshot' });
					}
					// Reflect applied plan in the UI after executing
					try { appStore.getState().setPlanName(plan); } catch {}
				}}
				className="text-xs px-2 py-1 border border-gray-600 text-gray-200 h-8"
			>Execute</button>

			{/* Minimal real-agent demo controls */}
			<div className="flex items-center gap-2 ml-4">
				<input
					type="text"
					value={demoTask}
					onChange={(e) => setDemoTask(e.target.value)}
					placeholder="Ask: what's the weather in New York?"
					className="bg-black border border-gray-700 px-2 py-1 text-sm h-8 text-gray-100 min-w-[300px]"
				/>
				<button
					onClick={async () => {
						try {
							await fetch('/api/demo/autogen-weather', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ prompt: demoTask }),
							});
						} catch {}
					}}
					className="text-xs px-2 py-1 border border-gray-600 text-gray-200 h-8"
				>Run AutoGen Weather</button>
			</div>

			{/* Speed controls removed for now */}

			{/* Right-aligned players: Radio + Music + Ping toggle */}
			<div className="ml-auto flex items-end gap-6">
				{/* Radar ping sound toggle with label above (SFX) */}
				<div className="flex flex-col items-end gap-1 text-sm">
					<div className="text-gray-300 select-none">SFX</div>
					<button
						type="button"
						onClick={() => appStore.getState().togglePingAudio()}
						title={pingEnabled ? 'Radar ping sound: ON' : 'Radar ping sound: OFF'}
						className={`h-8 w-8 grid place-items-center border ${pingEnabled ? 'border-green-500/70 text-green-400' : 'border-gray-600 text-gray-300'} bg-black hover:bg-gray-900`}
						aria-pressed={pingEnabled}
						aria-label={pingEnabled ? 'Disable radar ping sound' : 'Enable radar ping sound'}
					>
						{pingEnabled ? (
							// Speaker with waves (on)
							<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
								<path d="M3 10h3l4-3v10l-4-3H3z" fill="currentColor" stroke="none" />
								<path d="M15 9c1.5 1.5 1.5 4.5 0 6" />
								<path d="M17.5 7c2.5 2.5 2.5 7.5 0 10" />
								<path d="M20 5c3.3 3.3 3.3 10.7 0 14" />
							</svg>
						) : (
							// Speaker with X (muted)
							<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
								<path d="M3 10h3l4-3v10l-4-3H3z" fill="currentColor" stroke="none" />
								<path d="M16 8l6 6" />
								<path d="M22 8l-6 6" />
							</svg>
						)}
					</button>
				</div>
				<AudioPlayer tracks={radio} showSourceLink className="text-right" />
				<AudioPlayer tracks={tracks} className="text-right" />
			</div>
		</div>
	);
}
