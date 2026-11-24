export interface Subscription {
	id: string;
	customer: string;
	planAmount: number;
	currency: string;
	renewsAt: Date;
	status: "active" | "paused" | "cancelled";
	pausedAt: Date | null;
	declines: number;
}

export interface SubscriptionStore {
	// Active subscriptions whose renewsAt is on or before now.
	dueForRenewal(now: Date): Promise<Subscription[]>;
	save(subscription: Subscription): Promise<void>;
}
