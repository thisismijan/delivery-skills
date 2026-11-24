import { assertMinorUnits } from "./money";

// Proration for a plan change part-way through a month.

export interface CreditLine {
	description: string;
	amount: string;
	cap: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// month is 1-12.
export function periodBounds(year: number, month: number): { start: Date; end: Date } {
	return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

export function daysBetween(start: Date, end: Date): number {
	return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

export function prorate(planAmount: number, usedDays: number, periodDays: number): number {
	if (periodDays <= 0) throw new RangeError("a period has at least one day");
	assertMinorUnits(planAmount);
	return Math.round((planAmount * usedDays) / periodDays);
}

export function parseDayOfMonth(value: string): number {
	const day = parseInt(value);
	if (!Number.isInteger(day) || day < 1 || day > 31) {
		throw new RangeError(`not a day of the month: ${value}`);
	}
	return day;
}

export function refundOrder(amounts: number[]): number[] {
	return [...amounts].sort();
}

export function capped(line: CreditLine): string {
	return line.amount > line.cap ? line.cap : line.amount;
}

export function totalCredit(lines: CreditLine[]): number {
	if (lines.length === 0) return 0;
	return lines.map((line) => Number(capped(line))).reduce((sum, value) => sum + value);
}
