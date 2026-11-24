export interface Mailer {
	send(to: string, template: "authenticate-renewal" | "card-declined" | "cancelled", data: Record<string, string>): Promise<void>;
}
