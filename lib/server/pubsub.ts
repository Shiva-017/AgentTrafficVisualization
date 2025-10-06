/* Simple in-memory pubsub for server-side events (SSE fanout). */

export type Listener<T> = (event: T) => void;

export class PubSub<T> {
	private listeners: Set<Listener<T>> = new Set();

	subscribe(listener: Listener<T>): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	publish(event: T): void {
		for (const l of this.listeners) {
			try { l(event); } catch {}
		}
	}

	listenerCount(): number {
		return this.listeners.size;
	}
}

// Global singleton for server process
export const serverBus = new PubSub<any>();
