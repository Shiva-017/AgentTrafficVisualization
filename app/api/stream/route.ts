import { serverBus } from '@/lib/server/pubsub';
import { serverState } from '@/lib/server/state';

export async function GET(req: Request) {
	const encoder = new TextEncoder();
	let closed = false;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let keepAlive: ReturnType<typeof setInterval> | null = null;
			let unsub: (() => void) | null = null;

			function safeEnqueue(chunk: string) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			}

			function send(ev: any) {
				const data = JSON.stringify(ev);
				safeEnqueue(`data: ${data}\n\n`);
			}

			function cleanup() {
				if (closed) return;
				closed = true;
				try { if (keepAlive) clearInterval(keepAlive); } catch {}
				keepAlive = null;
				try { unsub?.(); } catch {}
				unsub = null;
				try { controller.close(); } catch {}
			}

			// initial snapshot
			send(serverState.getSnapshot());
			// subscribe to subsequent events
			unsub = serverBus.subscribe(send);
			// keep-alive comment
			keepAlive = setInterval(() => {
				safeEnqueue(`: keep-alive\n\n`);
			}, 25000);

			// close handling via request abort
			try { req.signal.addEventListener('abort', cleanup, { once: true }); } catch {}
		},
		cancel() {
			closed = true;
		},
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
		},
	});
}
