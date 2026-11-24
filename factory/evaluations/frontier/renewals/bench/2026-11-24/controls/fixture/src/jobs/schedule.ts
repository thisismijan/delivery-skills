import { isoDay } from "../dates";
import type { Db } from "./db";

export interface Job {
	name: string;
	hourUtc: number;
	run(now: Date): Promise<void>;
}

const jobs: Job[] = [];

export function register(job: Job): void {
	jobs.push(job);
}

// Every replica calls tick once a minute. A job runs at most once per UTC day:
// job_runs has a unique key on (job, day), so only the replica whose insert
// succeeds runs it, and a replica that starts late finds the row already there.
export async function tick(db: Db, now: Date): Promise<void> {
	for (const job of jobs) {
		if (now.getUTCHours() < job.hourUtc) continue;
		const claimed = await db.insertIgnoringConflict("job_runs", {
			job: job.name,
			day: isoDay(now),
		});
		if (claimed) await job.run(now);
	}
}
