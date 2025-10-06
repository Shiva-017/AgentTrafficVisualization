"use client";

import React, { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import { appStore } from '@/lib/store';

function useStore<T>(selector: (s: any) => T): T {
	return useSyncExternalStore(appStore.subscribe, () => selector(appStore.getState()), () => selector(appStore.getState()));
}

export default function ResultBar() {
	const items = useStore(s => s.items as Record<string, { id:string; desc?: string }>
	);
	const text = useMemo(() => {
		let latest: { id: string; desc?: string } | null = null;
		for (const it of Object.values(items)) {
			if (!it?.desc) continue;
			// prioritize Final:, then Answer ->, else any desc from WRITE
			if (/^Final:/i.test(it.desc)) { latest = it; break; }
		}
		if (!latest) {
			for (const it of Object.values(items)) {
				if (it?.desc && /Answer\s*->/i.test(it.desc)) { latest = it; break; }
			}
		}
		if (!latest) {
			for (const it of Object.values(items)) {
				if (it?.desc) { latest = it; break; }
			}
		}
		return latest?.desc || '';
	}, [items]);

	if (!text) return null;
	return (
		<div className="px-2 py-2 border-t border-b border-gray-800 bg-black text-gray-200 overflow-hidden text-ellipsis whitespace-nowrap" title={text}>
			<span className="text-[#d79326ff] mr-2">RESULT</span>
			{text}
		</div>
	);
}
