import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PACK = join(import.meta.dir, "..", "..");

interface Job {
	stage?: string;
	extends?: string;
	image?: string;
	before_script?: string[];
	script?: string[];
}

const ci = Bun.YAML.parse(
	readFileSync(join(PACK, ".gitlab-ci.yml"), "utf8"),
) as Record<string, unknown> & {
	workflow: { rules: Array<{ if?: string; when?: string }> };
	stages: string[];
	default: { image: string };
};
const packageManager = (
	JSON.parse(readFileSync(join(PACK, "factory", "package.json"), "utf8")) as {
		packageManager: string;
	}
).packageManager;

function job(name: string): Job {
	const value = ci[name] as Job | undefined;
	if (!value) throw new Error(`missing job ${name}`);
	return value;
}

function script(name: string): string {
	const own = job(name);
	const parent = own.extends ? job(own.extends) : {};
	return [...(parent.before_script ?? []), ...(own.script ?? [])].join("\n");
}

test("the pipeline image is the bun version the factory pins", () => {
	expect(packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
	expect(ci.default.image).toBe(
		`oven/bun:${packageManager.slice("bun@".length)}`,
	);
	for (const name of ["check", "test"]) {
		expect(job(name).image).toBeUndefined();
	}
});

test("merge requests and the default branch run the check and test scripts", () => {
	const rules = ci.workflow.rules;
	expect(rules[0]).toEqual({
		if: '$CI_PIPELINE_SOURCE == "merge_request_event"',
	});
	expect(rules).toContainEqual({
		if: "$CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS",
		when: "never",
	});
	expect(rules).toContainEqual({
		if: "$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH",
	});
	for (const name of ["check", "test"]) {
		expect(ci.stages).toContain(job(name).stage ?? "");
		expect(script(name)).toContain("bun install --frozen-lockfile");
	}
	expect(script("check")).toMatch(/\bbun run check\b/);
	expect(script("test")).toMatch(/\bbun run test\b/);
});

test("the test job runs unprivileged with the toolchains the tests use", () => {
	const commands = script("test");
	expect(commands).toContain("su bun ");
	expect(commands.indexOf("su bun ")).toBeLessThan(
		commands.indexOf("bun run test"),
	);
	for (const tool of ["git", "python3", "golang-go"]) {
		expect(commands).toMatch(new RegExp(`apt-get install[^\\n]*\\b${tool}\\b`));
	}
});
