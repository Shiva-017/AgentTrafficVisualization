"use client";

import type { SimMsg } from '@/lib/simBridge';
import { attachBridgeToStore } from '@/lib/bridgeToStore';
import { appStore } from '@/lib/store';
import { debugLog } from '@/lib/debug';

let _es: EventSource | null = null;
let _unsub: (() => void) | null = null;

export function connectRealtime() {
	if (typeof window === 'undefined') return null;
	if (_es) return _es;
	const url = '/api/stream';
	const es = new EventSource(url);
	_es = es;
	const subscribers = new Set<(msg: SimMsg) => void>();
	function emit(msg: SimMsg) {
		for (const fn of subscribers) fn(msg);
	}
	const bridge = {
		subscribe(handler: (msg: SimMsg) => void) {
			subscribers.add(handler);
			return () => subscribers.delete(handler);
		},
		postIntent() {},
		getLastTickId() { return 0; },
		destroy() { try { es.close(); } catch {} },
	};
	_unsub = attachBridgeToStore(bridge as any, appStore).destroy;

	// Expose inspection helpers
	try { (window as any).__ATC_STORE__ = appStore; } catch {}

	es.onmessage = (e) => {
		try {
			const msg = JSON.parse(e.data);
			if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
			debugLog('realtime', 'event', { type: (msg as any).type, tick_id: (msg as any).tick_id, items: (msg as any).items?.length, agents: (msg as any).agents?.length });
			// Extra verbose logging in dev: full payload for tick/snapshot
			if ((window as any)?.__ATC_DEBUG__ === true) {
				try { console.debug('[atc][realtime] payload', msg); } catch {}
			}
			emit(msg as SimMsg);
		} catch (err) {
			try { console.warn('[atc][realtime] parse error', err); } catch {}
		}
	};

	es.onerror = (e) => {
		debugLog('realtime', 'error', e);
	};
	return es;
}

export function disconnectRealtime() {
	try { _unsub?.(); } catch {}
	try { _es?.close(); } catch {}
	_unsub = null; _es = null;
}
