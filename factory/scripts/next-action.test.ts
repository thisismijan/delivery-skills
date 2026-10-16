import { describe, expect, test } from "bun:test";
import { classifyEntry, selectNextAction } from "./next-action";

function recordingWriter(): {
	writer: { write: (markdown: string) => void };
	calls: string[];
} {
	const calls: string[] = [];
	return {
		writer: {
			write: (markdown: string) => {
				calls.push(markdown);
			},
		},
		calls,
	};
}

describe("classifyEntry", () => {
	test("a ticket key with no verb is a bare key", () => {
		expect(classifyEntry("MDF-1234")).toEqual({
			kind: "bare-key",
			key: "MDF-1234",
		});
		expect(classifyEntry("  SMAI-740  ")).toEqual({
			kind: "bare-key",
			key: "SMAI-740",
		});
	});

	test("a known lifecycle verb is an explicit verb", () => {
		expect(classifyEntry("execute MDF-1234")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
		expect(classifyEntry("draft MDF-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "draft",
		});
		expect(classifyEntry("build MDF-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
	});

	test("an unmatched command word is unknown", () => {
		expect(classifyEntry("frobnicate MDF-1234").kind).toBe("unknown");
		expect(classifyEntry("publish").kind).toBe("unknown");
		expect(classifyEntry("deploy 740").kind).toBe("unknown");
	});
});

describe("selectNextAction resume", () => {
	test("a bare key at drafted selects execute and does not continue the span", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "MDF-1234", status: "[drafted]" },
			writer,
		);
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("execute");
		expect(result.singleStep).toBe(true);
		expect(calls).toEqual([]);
	});

	test("a bare key at ready selects release readiness", () => {
		const result = selectNextAction({
			args: "MDF-1234",
			status: "[ready !740]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("ship");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at reviewed-blocked selects address comments", () => {
		const result = selectNextAction({
			args: "MDF-1234",
			status: "[reviewed-blocked !12]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("address");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at addressed selects review, not address comments", () => {
		const result = selectNextAction({
			args: "MDF-1234",
			status: "[addressed !12]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("review");
		expect(result.singleStep).toBe(true);
	});
});

describe("selectNextAction explicit verb", () => {
	test("execute at drafted runs only execute", () => {
		const result = selectNextAction({
			args: "execute MDF-1234",
			status: "[drafted]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("execute");
		expect(result.singleStep).toBe(true);
	});

	test("draft at groomed runs only draft", () => {
		const result = selectNextAction({
			args: "draft MDF-1234",
			status: "[groomed]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("draft");
		expect(result.singleStep).toBe(true);
	});
});

describe("selectNextAction stop without writing", () => {
	test("execute at ready stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "execute MDF-1234", status: "[ready !740]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.reason.length).toBeGreaterThan(0);
		expect(result.reason).not.toMatch(/mutate|kind:|writeLedger/i);
		expect(calls).toEqual([]);
	});

	test("an unknown command stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "frobnicate MDF-1234", status: "[drafted]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});

	test("a status with nothing next stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "MDF-1234", status: "[stopped: gate failed]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});
});
