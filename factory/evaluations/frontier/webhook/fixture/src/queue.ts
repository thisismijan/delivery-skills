import { handleWebhook } from "./webhook";

export interface Job {
	eventId: string;
	body: string;
}

const CONCURRENCY = 8;
const pending: Job[] = [];
let running = 0;

// Up to eight jobs run at once. The provider retries a delivery it has not
// seen acknowledged within 5 seconds, so the same event can arrive twice.
export function enqueue(job: Job): void {
	pending.push(job);
	drain();
}

function drain(): void {
	while (running < CONCURRENCY && pending.length > 0) {
		const job = pending.shift() as Job;
		running += 1;
		handleWebhook(job).finally(() => {
			running -= 1;
			drain();
		});
	}
}
