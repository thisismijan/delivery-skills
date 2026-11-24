// Renewal dates are stored as UTC midnight.

export function startOfUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

export function addMonths(date: Date, months: number): Date {
	const next = new Date(date.getTime());
	next.setUTCMonth(next.getUTCMonth() + months);
	return next;
}

export function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}
