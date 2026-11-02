export interface QuietHours {
	start: number;
	end: number;
	timeZone: string;
}

export function parseQuietHours(
	value: string | undefined,
	timeZone: string,
): QuietHours | undefined {
	if (value === undefined || value.trim() === "") return undefined;
	const match = value.trim().match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
	const minutes = (hours?: string, mins?: string) =>
		Number(hours) * 60 + Number(mins);
	if (!match) {
		throw new Error(
			`quiet hours must look like 19:00-08:45, not "${value.trim()}"`,
		);
	}
	const start = minutes(match[1], match[2]);
	const end = minutes(match[3], match[4]);
	if (
		Number(match[1]) > 23 ||
		Number(match[3]) > 23 ||
		Number(match[2]) > 59 ||
		Number(match[4]) > 59 ||
		start === end
	) {
		throw new Error(`quiet hours "${value.trim()}" are not a valid range`);
	}
	try {
		new Intl.DateTimeFormat("en-GB", { timeZone });
	} catch {
		throw new Error(`unknown time zone "${timeZone}"`);
	}
	return { start, end, timeZone };
}

function minuteOfDay(at: Date, formatter: Intl.DateTimeFormat): number {
	const parts = formatter.formatToParts(at);
	const hour = Number(parts.find((part) => part.type === "hour")?.value);
	const minute = Number(parts.find((part) => part.type === "minute")?.value);
	return (hour % 24) * 60 + minute;
}

function inQuietHours(minute: number, quiet: QuietHours): boolean {
	return quiet.start < quiet.end
		? minute >= quiet.start && minute < quiet.end
		: minute >= quiet.start || minute < quiet.end;
}

// Minutes inside quiet hours do not count, so a change that leaves draft late
// in the evening waits for the reviewers' morning pass instead of settling
// overnight.
export function settleTime(
	start: Date,
	windowMinutes: number,
	quiet?: QuietHours,
): Date {
	if (!quiet) return new Date(start.getTime() + windowMinutes * 60_000);
	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone: quiet.timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	let at = start.getTime();
	let counted = 0;
	while (counted < windowMinutes) {
		if (!inQuietHours(minuteOfDay(new Date(at), formatter), quiet)) {
			counted += 1;
		}
		at += 60_000;
	}
	return new Date(at);
}
