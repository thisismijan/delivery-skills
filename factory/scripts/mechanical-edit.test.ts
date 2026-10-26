import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	type MechanicalEditInput,
	classifyMechanicalEdit,
} from "./mechanical-edit";

const rename: MechanicalEditInput = {
	operation: "rename",
	from: "slugifyTitle",
	to: "slugify",
	files: ["src/slug.ts"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong",
};

test("a local rename with strong verification is mechanical", () => {
	expect(classifyMechanicalEdit(rename)).toEqual({
		verdict: "mechanical",
		reason: "rename is local, reversible, and strongly verified",
		apply: "select-model",
	});
});

test("scripted apply is used only when the command can prove it", () => {
	expect(classifyMechanicalEdit({ ...rename, scriptedApply: true }).apply).toBe(
		"script",
	);
});

test("free text and incomplete rename units fail closed", () => {
	expect(() => classifyMechanicalEdit("rename the helper")).toThrow();
	expect(() =>
		classifyMechanicalEdit({ ...rename, from: undefined, to: undefined }),
	).toThrow();
	expect(() => classifyMechanicalEdit({ ...rename, files: [] })).toThrow();
});

test("unknown operations fail closed", () => {
	expect(() =>
		classifyMechanicalEdit({ ...rename, operation: "refactor" }),
	).toThrow();
});

test("public contract and safety surfaces are not mechanical", () => {
	for (const surface of [
		"contract",
		"auth",
		"migration",
		"concurrency",
		"distributed-state",
		"data",
		"config",
		"infra",
	]) {
		const plan = classifyMechanicalEdit({ ...rename, surfaces: [surface] });
		expect(plan.verdict).toBe("not-mechanical");
		expect(plan.reason).toContain(surface);
		expect(plan.apply).toBe("select-model");
	}
});

test("weak verification and one-way edits are not mechanical", () => {
	expect(
		classifyMechanicalEdit({ ...rename, verification: "weak" }).verdict,
	).toBe("not-mechanical");
	expect(classifyMechanicalEdit({ ...rename, reversible: false }).verdict).toBe(
		"not-mechanical",
	);
	expect(
		classifyMechanicalEdit({ ...rename, classificationComplete: false })
			.verdict,
	).toBe("not-mechanical");
});

test("the CLI emits the plan for mechanical and not-mechanical input", async () => {
	const inputPath = join(import.meta.dir, ".mechanical-edit-input.test.json");
	try {
		await Bun.write(inputPath, JSON.stringify(rename));
		const ok = Bun.spawn(
			["bun", join(import.meta.dir, "mechanical-edit.ts"), inputPath],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await ok.exited).toBe(0);
		expect(JSON.parse(await new Response(ok.stdout).text())).toMatchObject({
			verdict: "mechanical",
		});
		await Bun.write(
			inputPath,
			JSON.stringify({ ...rename, reversible: false }),
		);
		const blocked = Bun.spawn(
			["bun", join(import.meta.dir, "mechanical-edit.ts"), inputPath],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await blocked.exited).toBe(0);
		expect(JSON.parse(await new Response(blocked.stdout).text())).toMatchObject(
			{
				verdict: "not-mechanical",
				apply: "select-model",
			},
		);
	} finally {
		await Bun.file(inputPath).delete();
	}
});
