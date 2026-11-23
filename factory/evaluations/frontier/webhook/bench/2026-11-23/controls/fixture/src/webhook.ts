import { HANDLERS } from "./events";
import type { Job } from "./queue";

// Today every delivery is handled, so a retried delivery is handled twice.
export async function handleWebhook(job: Job): Promise<void> {
	const event = JSON.parse(job.body) as {
		type: string;
		data: Record<string, unknown>;
	};
	const handler = HANDLERS[event.type];
	if (!handler) return;
	await handler(event.data);
}
