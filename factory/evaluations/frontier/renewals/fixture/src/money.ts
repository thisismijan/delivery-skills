// Every amount is a whole number of minor units (pence, cents).

export function assertMinorUnits(amount: number): void {
	if (!Number.isSafeInteger(amount) || amount < 0) {
		throw new RangeError(`not a whole minor-unit amount: ${amount}`);
	}
}

export function addMinor(a: number, b: number): number {
	assertMinorUnits(a);
	assertMinorUnits(b);
	const sum = a + b;
	assertMinorUnits(sum);
	return sum;
}
