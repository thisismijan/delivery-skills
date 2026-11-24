import { addMonths, isoDay, startOfUtcDay } from "./dates";
import type { Gateway } from "./gateway";
import { assertMinorUnits } from "./money";
import type { Subscription, SubscriptionStore } from "./subscriptions";

// Called when a signed-in customer loads any page. Removed by nightly-renewals.
export async function renewOnVisit(
	store: SubscriptionStore,
	gateway: Gateway,
	subscription: Subscription,
	now: Date,
): Promise<void> {
	if (subscription.status !== "active" || subscription.renewsAt > now) return;
	assertMinorUnits(subscription.planAmount);
	const today = startOfUtcDay(now);
	const result = await gateway.charge({
		customer: subscription.customer,
		amount: subscription.planAmount,
		currency: subscription.currency,
		idempotencyKey: `visit:${subscription.id}:${isoDay(today)}`,
	});
	if (result.status !== "succeeded") return;
	subscription.renewsAt = addMonths(today, 1);
	await store.save(subscription);
}
