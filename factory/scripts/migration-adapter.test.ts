import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const adapter = join(
	import.meta.dir,
	"..",
	"..",
	"adapters",
	"migration",
	"legacy-state.ts",
);

describe("migration adapter legacy reads", () => {
	test("maps old metadata, groom path, and audit marker into delivery names", async () => {
		const mod = await import(adapter);
		expect(mod.LEGACY_GROOM_ROOT).toBe(".ig-spec/grooming");
		expect(mod.LEGACY_META_FILENAME).toBe(".ig-spec.json");
		expect(mod.LEGACY_AUDIT_PREFIX).toBe("**ig-spec** ·");
		expect(mod.legacyGroomDir("add-export")).toBe(
			".ig-spec/grooming/add-export/",
		);
		expect(
			mod.parseLegacyChangeMeta(
				JSON.stringify({
					jiraKey: "SMAI-9",
					complexitySignal: "high",
					opusJustification: "locking",
				}),
			),
		).toEqual({
			workItemKey: "SMAI-9",
			complexitySignal: "high",
			frontierJustification: "locking",
		});
		expect(mod.isLegacyAuditComment("**ig-spec** · merged\n\nok")).toBe(true);
		expect(mod.isLegacyAuditComment("**delivery** · merged\n\nok")).toBe(false);
	});
});
