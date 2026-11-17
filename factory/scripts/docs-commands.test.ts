import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BRANCH_PUSH_INVOCATION,
	BRANCH_UPDATE_INVOCATION,
} from "./branch-update";
import { CHARACTERIZE_INVOCATION } from "./characterize";
import { SANDBOX_REAP_INVOCATION } from "./sandbox-run";
import { SKILL_SIZE_RAISE_INVOCATION } from "./skill-size";

const root = join(import.meta.dir, "..", "..");
const read = (path: string) =>
	readFileSync(join(root, path), "utf8")
		.replaceAll('"$FACTORY_ROOT/scripts/', "scripts/")
		.replaceAll('.ts"', ".ts");

test("the reference shows the real command for each Phase 3 script", () => {
	const reference = read("docs/reference.md");
	for (const invocation of [
		CHARACTERIZE_INVOCATION,
		BRANCH_UPDATE_INVOCATION,
		BRANCH_PUSH_INVOCATION,
		SANDBOX_REAP_INVOCATION,
		SKILL_SIZE_RAISE_INVOCATION,
	]) {
		expect(reference).toContain(invocation);
	}
});

test("troubleshooting names the reap command and contributing names the raise command", () => {
	expect(read("docs/troubleshooting.md")).toContain(SANDBOX_REAP_INVOCATION);
	expect(read("CONTRIBUTING.md")).toContain(
		SKILL_SIZE_RAISE_INVOCATION.replace(
			"<skill-path>",
			"skills/<name>/SKILL.md",
		),
	);
});
