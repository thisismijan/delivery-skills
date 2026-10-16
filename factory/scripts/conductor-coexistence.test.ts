import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ExecuteRecoveryEvidence,
	executeResumeCommand,
	recoverExecuting,
} from "./execute-recovery";
import { selectNextAction } from "./next-action";
import { decideStage3Readiness } from "./stage3-readiness";

const PACK_ROOT = join(import.meta.dir, "..", "..");
const KEY = "MDF-1234";
const IID = "740";
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function recovery(
	overrides: Partial<ExecuteRecoveryEvidence> = {},
): ExecuteRecoveryEvidence {
	return {
		key: KEY,
		owner: { status: "none" },
		mergeRequest: { status: "none" },
		...overrides,
	};
}

function maxPass(): string {
	return [
		`## Code review max — !${IID}`,
		"",
		`**Head:** \`${HEAD}\``,
		"**Verdict:** PASS",
		"",
		"### Findings",
		"",
		`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
		"",
	].join("\n");
}

function approachPass(): string {
	return [
		"**Verdict:** approach is sound",
		"",
		"### Findings",
		"",
		`<!-- mr-review:${HEAD} -->`,
		"",
	].join("\n");
}

describe("Stage 3 dual-review readiness and interrupted-execute recovery coexist", () => {
	test("matching dual-review artifacts still mark the current head ready", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("ready");
	});

	test("no active owner and no merge request is still an interrupted stop", () => {
		const result = recoverExecuting(recovery());
		expect(result.kind).toBe("interrupted");
		if (result.kind !== "interrupted") return;
		expect(result.nextCommand).toBe(executeResumeCommand(KEY));
		expect(result.nextCommand).toBe("/delivery execute MDF-1234");
	});

	test("resume keeps both recovery paths: matching MR reviews, interrupted stop does not execute", () => {
		const matching = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery({
				mergeRequest: { status: "matching", iid: 740 },
			}),
		});
		expect(matching).toMatchObject({
			kind: "run",
			verb: "review",
			singleStep: true,
			iid: 740,
		});

		const interrupted = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery(),
		});
		expect(interrupted.kind).toBe("stop");
		if (interrupted.kind !== "stop") return;
		expect(interrupted.nextCommand).toBe("/delivery execute MDF-1234");
		expect(interrupted.kind).not.toBe("run");
	});

	test("the conductor names both Stage 3 readiness and execute recovery without merge markers", () => {
		const skill = readFileSync(
			join(PACK_ROOT, "skills", "delivery", "SKILL.md"),
			"utf8",
		);
		const auto = readFileSync(
			join(PACK_ROOT, "skills", "delivery", "workflows", "auto.md"),
			"utf8",
		);
		expect(skill).toContain("scripts/stage3-readiness.ts");
		expect(skill).toContain("/delivery execute <KEY>");
		expect(skill).toMatch(/interrupt/i);
		expect(auto).toMatch(/interrupt/i);
		expect(auto).toContain("/delivery execute");
		for (const [name, text] of [
			["SKILL.md", skill],
			["auto.md", auto],
		] as const) {
			for (const [index, line] of text.split(/\r?\n/).entries()) {
				expect([name, index + 1, /^(<{7}|={7}|>{7})/.test(line)]).toEqual([
					name,
					index + 1,
					false,
				]);
			}
		}
	});
});
