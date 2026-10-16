import { describe, expect, test } from "bun:test";
import {
	canStartStage,
	CURSOR_HOST,
	CLAUDE_CODE_HOST,
	UNKNOWN_HOST,
} from "./stage-gating";

describe("canStartStage", () => {
	test("denies a mutating stage on an unenforced host and still allows read-only stages", () => {
		const execute = canStartStage({ stage: "execute", host: CURSOR_HOST });
		expect(execute.allowed).toBe(false);
		expect(execute.reason).toMatch(/unenforced|mutation/i);
		expect(canStartStage({ stage: "review", host: CURSOR_HOST }).allowed).toBe(
			true,
		);
		expect(canStartStage({ stage: "status", host: CURSOR_HOST }).allowed).toBe(
			true,
		);
	});

	test("denies a mutating stage on an unknown host", () => {
		const result = canStartStage({ stage: "draft", host: UNKNOWN_HOST });
		expect(result.allowed).toBe(false);
	});

	test("denies an unknown stage even on an enforced host", () => {
		const result = canStartStage({
			stage: "not-a-stage",
			host: CLAUDE_CODE_HOST,
		});
		expect(result.allowed).toBe(false);
	});

	test("denies a mutating stage when the host capability is missing", () => {
		const result = canStartStage({
			stage: "execute",
			host: { name: "cursor" },
		});
		expect(result.allowed).toBe(false);
	});

	test("allows a mutating stage on an enforced host", () => {
		expect(
			canStartStage({ stage: "execute", host: CLAUDE_CODE_HOST }).allowed,
		).toBe(true);
		expect(
			canStartStage({ stage: "draft", host: CLAUDE_CODE_HOST }).allowed,
		).toBe(true);
	});

	test("Cursor mutating stages stay blocked while its declaration is unenforced", () => {
		expect(CURSOR_HOST.mutationEnforcement).toBe("unenforced");
		expect(
			canStartStage({ stage: "execute", host: CURSOR_HOST }).allowed,
		).toBe(false);
		expect(
			canStartStage({ stage: "address-comments", host: CURSOR_HOST }).allowed,
		).toBe(false);
	});
});
