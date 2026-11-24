import type { Subscription, SubscriptionStore } from "./subscriptions";

export async function pause(
	store: SubscriptionStore,
	subscription: Subscription,
	now: Date,
): Promise<void> {
	subscription.status = "paused";
	subscription.pausedAt = now;
	await store.save(subscription);
}

// renewsAt is left as it was. Renew-on-visit charges a resumed subscription at
// its next visit and renews it from that day.
export async function resume(
	store: SubscriptionStore,
	subscription: Subscription,
): Promise<void> {
	subscription.status = "active";
	subscription.pausedAt = null;
	await store.save(subscription);
}
