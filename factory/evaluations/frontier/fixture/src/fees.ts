const RATES: Record<string, number> = { GBP: 0.025, EUR: 0.03, USD: 0.035 };

// Amounts are in minor units (pence or cents).
export function parseAmount(text: string): number {
	if (text.trim() === "") return 0;
	const value = Number(text);
	if (!Number.isFinite(value)) throw new Error(`not an amount: ${text}`);
	return value;
}

export function roundFee(value: number): number {
	return Math.floor(value);
}

export function feeFor(amount: number, currency: string): number {
	const rate = RATES[currency];
	if (rate === undefined) throw new Error(`unsupported currency: ${currency}`);
	return roundFee(amount * rate);
}

export function applyDiscount(total: number, discount: number): number {
	return total - discount;
}
