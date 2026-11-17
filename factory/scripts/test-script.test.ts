import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const FACTORY = join(import.meta.dir, "..");
const PACK = join(FACTORY, "..");
const scripts = (
	JSON.parse(readFileSync(join(FACTORY, "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	}
).scripts;

function testFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === "node_modules") return [];
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return testFiles(path);
		return entry.name.endsWith(".test.ts") ? [relative(PACK, path)] : [];
	});
}

test("the test script runs the factory tests and then the skill checks", () => {
	expect(scripts.test).toBe("bun test && bun run test:skills");
	const skills = scripts["test:skills"] ?? "";
	expect(skills).toStartWith("cd .. && ");
	expect(skills).toContain("BUN_RUNTIME_TRANSPILER_CACHE_PATH=0");
	const filters = skills
		.slice(skills.indexOf("bun test ") + "bun test ".length)
		.split(/\s+/)
		.filter((word) => word.length > 0 && !word.startsWith("-"));
	expect(filters.length).toBeGreaterThan(0);
	const skillTests = testFiles(join(PACK, "skills"));
	expect(skillTests.length).toBeGreaterThan(0);
	for (const file of skillTests) {
		expect(filters.some((filter) => file.startsWith(filter))).toBe(true);
	}
});

test("the contributor docs run the script, not a bare bun test", () => {
	for (const doc of ["CONTRIBUTING.md", "README.md"]) {
		const text = readFileSync(join(PACK, doc), "utf8");
		const blocks = [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map(
			(match) => match[1] ?? "",
		);
		const commands = blocks.flatMap((block) =>
			block.split("\n").map((line) => line.trim()),
		);
		expect(commands).toContain("bun run test");
		expect(commands.filter((line) => /^bun test\b/.test(line))).toEqual([]);
		expect(
			commands.filter((line) => line.includes("bun test skills/")),
		).toEqual([]);
	}
});
