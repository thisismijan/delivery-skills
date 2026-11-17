import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isFastEligible,
	proposedTier,
	routingFloor,
	shadowRoute,
	shadowTier,
} from "./shadow-route";
import type { TaskProfileInput } from "./task-profile";

const localSearch: TaskProfileInput = {
	version: 1,
	taskId: "search-1",
	stage: "discover",
	workType: "search",
	reasoningDepth: "low",
	ambiguity: "low",
	blastRadius: "local",
	risk: "reversible",
	novelty: "known-pattern",
	verificationStrength: "strong",
	contextSize: "small",
	domains: ["user-interface"],
	reason: ["inventory existing dashboard modules"],
	promotionTriggers: ["a required source was missed"],
};

const implement: TaskProfileInput = {
	...localSearch,
	taskId: "impl-1",
	stage: "execute",
	workType: "implement",
	reasoningDepth: "medium",
	blastRadius: "subsystem",
	risk: "material",
	novelty: "adaptation",
	verificationStrength: "strong",
	domains: ["public-contract"],
	reason: ["ordinary feature behind an existing seam"],
};

test("mechanical local search is fast-eligible", () => {
	expect(isFastEligible(localSearch)).toBe(true);
	expect(shadowTier(localSearch)).toBe("fast");
});

test("implementation never drops below standard", () => {
	expect(routingFloor(implement)).toBe("standard");
	expect(shadowTier(implement)).toBe("standard");
});

test("classified mechanical-edit can be fast-eligible", () => {
	const edit: TaskProfileInput = {
		...localSearch,
		taskId: "rename-1",
		stage: "address",
		workType: "mechanical-edit",
		reason: ["rename a local helper with the existing test gate"],
	};
	expect(isFastEligible(edit)).toBe(true);
	expect(shadowTier(edit)).toBe("fast");
	expect(routingFloor(edit)).toBe("fast");
});

test("auth work is always frontier even when otherwise simple", () => {
	const auth = {
		...localSearch,
		workType: "implement" as const,
		stage: "execute" as const,
		domains: ["auth" as const],
		reason: ["touches the login token path"],
	};
	expect(shadowTier(auth)).toBe("frontier");
});

test("holdout review is always frontier", () => {
	const review = {
		...implement,
		workType: "review" as const,
		reasoningDepth: "low" as const,
		risk: "reversible" as const,
		reason: ["final holdout adjudication"],
	};
	expect(shadowTier(review)).toBe("frontier");
});

test("weak verification plus non-local blast radius is frontier", () => {
	const weak = {
		...implement,
		verificationStrength: "weak" as const,
		blastRadius: "cross-system" as const,
		reason: ["no executable seam for the contract"],
	};
	expect(shadowTier(weak)).toBe("frontier");
});

test("high-ambiguity decomposition is frontier", () => {
	const split = {
		...localSearch,
		stage: "groom" as const,
		workType: "decompose" as const,
		ambiguity: "high" as const,
		reason: ["the idea still has two destinations"],
	};
	expect(shadowTier(split)).toBe("frontier");
});

test("shadow mode records a cheaper recommendation without changing execution", () => {
	const decision = shadowRoute(localSearch, "sonnet");
	expect(decision.mode).toBe("shadow");
	expect(decision.executed).toBe("current");
	expect(decision.currentModel).toBe("sonnet");
	expect(decision.currentTier).toBe("standard");
	expect(decision.shadowTier).toBe("fast");
	expect(decision.profile.selectedTier).toBe("fast");
});

test("live opus execution stays frontier even if shadow would be cheaper", () => {
	const decision = shadowRoute(implement, "opus");
	expect(decision.currentTier).toBe("frontier");
	expect(decision.shadowTier).toBe("standard");
	expect(decision.executed).toBe("current");
});

test("a floor raise is recorded when proposal would otherwise be too cheap", () => {
	const authSearch = {
		...localSearch,
		domains: ["auth" as const],
		reason: ["lists auth call sites"],
	};
	expect(proposedTier(authSearch)).toBe("fast");
	expect(shadowRoute(authSearch, "sonnet").floorApplied).toBe(true);
	expect(shadowTier(authSearch)).toBe("frontier");
});

test("CLI writes a shadow decision and never prints a dispatch instruction", async () => {
	const dir = await mkdtemp(join(tmpdir(), "shadow-route-"));
	try {
		const profilePath = join(dir, "profile.json");
		const outPath = join(dir, "decision.json");
		await writeFile(profilePath, JSON.stringify(localSearch));
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "shadow-route.ts"),
				profilePath,
				"sonnet",
				outPath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const stdout = await new Response(proc.stdout).text();
		expect(await proc.exited).toBe(0);
		expect(stdout).not.toContain("dispatch");
		const decision = shadowRoute(localSearch, "sonnet");
		expect(JSON.parse(stdout).shadowTier).toBe(decision.shadowTier);
		expect((await Bun.file(outPath).json()).executed).toBe("current");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
