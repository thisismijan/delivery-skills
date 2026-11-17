import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginAgent } from "./cursor-plugin";
import { repairPolicy } from "./subagent-outputs";

const root = join(import.meta.dir, "..", "..");
const brief = readFileSync(
	join(root, "factory/agents/conflict-resolver.md"),
	"utf8",
);
const flat = (text: string) => text.replace(/\s+/g, " ");

test("the conflict resolver keeps both intents and never weakens a test", () => {
	const text = flat(brief);
	expect(text).toContain("Keep **both** intents");
	expect(text).toContain(
		"keep the target's behaviour, leave the change's side out of that hunk",
	);
	expect(text).toContain(
		"Never weaken, skip, or delete a test, an assertion, a check, or validation",
	);
	expect(text).toContain(
		"A conflicted test file keeps every test from both sides.",
	);
	expect(text).toContain("you have **no** `Bash` and **no MCP tools**");
	for (const heading of [
		"**Files resolved:**",
		"**Kept from both:**",
		"**Could not keep:**",
		"**Not checked:**",
	]) {
		expect(brief).toContain(heading);
	}
});

test("its output gets one repair turn and the plugin leaves it writable", () => {
	expect(repairPolicy("conflict-resolver")).toMatchObject({ kind: "advisory" });
	expect(pluginAgent(brief)).toMatchObject({
		name: "conflict-resolver",
		readonly: false,
	});
});

test("auto dispatches the conflict resolver and stops on anything it could not keep", () => {
	const auto = flat(
		readFileSync(join(root, "skills/delivery/workflows/auto.md"), "utf8"),
	);
	expect(auto).toContain(
		"the `conflict-resolver` subagent with the conflicted files and the change's OpenSpec change",
	);
	expect(auto).toContain(
		"When its handoff lists anything under **Could not keep**, or a conflict marker remains, abort the rebase and stop for a person.",
	);
});
