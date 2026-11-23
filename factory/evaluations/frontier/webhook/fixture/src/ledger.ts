export interface Account {
	id: string;
	currency: string;
	balanceMinor: bigint;
}

export interface Charge {
	id: string;
	amountMinor: bigint;
	refunds: bigint[];
}

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
	const previous = locks.get(key) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	locks.set(key, previous.then(() => current));
	await previous;
	try {
		return await run();
	} finally {
		release();
	}
}

export function total(amounts: bigint[]): bigint {
	return amounts.reduce((sum, amount) => sum + amount, 0n);
}

export async function transfer(from: Account, to: Account, amount: bigint): Promise<void> {
	if (from.currency !== to.currency) throw new Error("currency mismatch");
	await withLock(from.id, async () => {
		if (from.balanceMinor < amount) throw new Error("insufficient funds");
		from.balanceMinor -= amount;
		to.balanceMinor += amount;
	});
}

export function refund(charge: Charge, amount: bigint): void {
	if (amount > charge.amountMinor) throw new Error("refund exceeds charge");
	charge.refunds.push(amount);
}

export function roundAdjustment(value: number): number {
	return Math.round(value);
}
