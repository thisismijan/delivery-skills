const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function normalizeTicketKey(input: string): string {
	const key = input.trim().toUpperCase();
	if (!TICKET_KEY.test(key)) {
		throw new Error("invalid ticket key");
	}
	return key;
}
