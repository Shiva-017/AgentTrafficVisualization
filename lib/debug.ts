import { DEBUG_LOGS } from './config';

export function debugLog(tag: string, ...args: unknown[]) {
  if (!DEBUG_LOGS) return;
  console.log(`[dbg:${tag}]`, ...args);
}

