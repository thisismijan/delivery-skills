import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Surface, parseUnifiedDiff, scanDiff } from "./diff-scan";

interface Change {
	path: string;
	added?: string[];
	removed?: string[];
	status?: "added" | "deleted" | "modified";
}

function diffOf(...changes: Change[]): string {
	return changes
		.map(({ path, added = [], removed = [], status = "modified" }) => {
			const header = [`diff --git a/${path} b/${path}`];
			if (status === "added") header.push("new file mode 100644");
			if (status === "deleted") header.push("deleted file mode 100644");
			header.push("index 1111111..2222222");
			header.push(status === "added" ? "--- /dev/null" : `--- a/${path}`);
			header.push(status === "deleted" ? "+++ /dev/null" : `+++ b/${path}`);
			header.push(`@@ -1,${removed.length} +1,${added.length} @@`);
			return [
				...header,
				...removed.map((line) => `-${line}`),
				...added.map((line) => `+${line}`),
			].join("\n");
		})
		.join("\n");
}

function kinds(diff: string): string[] {
	return scanDiff(diff).loweredBar.map((hit) => hit.kind);
}

describe("parseUnifiedDiff", () => {
	test("reads status, path, and changed lines", () => {
		const files = parseUnifiedDiff(
			diffOf(
				{ path: "src/a.ts", added: ["x"], removed: ["y"] },
				{ path: "src/gone.ts", removed: ["z"], status: "deleted" },
				{ path: "src/new.ts", added: ["n"], status: "added" },
			),
		);
		expect(files.map((file) => [file.path, file.status])).toEqual([
			["src/a.ts", "modified"],
			["src/gone.ts", "deleted"],
			["src/new.ts", "added"],
		]);
		expect(files[0]?.added).toEqual(["x"]);
		expect(files[0]?.removed).toEqual(["y"]);
	});

	test("keeps the new path of a rename and marks binaries", () => {
		const files = parseUnifiedDiff(
			[
				"diff --git a/old/name.ts b/new/name.ts",
				"similarity index 100%",
				"rename from old/name.ts",
				"rename to new/name.ts",
				"diff --git a/img/logo.png b/img/logo.png",
				"Binary files a/img/logo.png and b/img/logo.png differ",
			].join("\n"),
		);
		expect(files).toEqual([
			{
				path: "new/name.ts",
				status: "renamed",
				binary: false,
				added: [],
				removed: [],
			},
			{
				path: "img/logo.png",
				status: "modified",
				binary: true,
				added: [],
				removed: [],
			},
		]);
	});

	test("refuses hunk lines with no file header", () => {
		expect(() => parseUnifiedDiff("@@ -1 +1 @@\n+x")).toThrow(
			"diff line before any file header",
		);
	});

	test("refuses an unreadable hunk line", () => {
		expect(() =>
			parseUnifiedDiff("diff --git a/x b/x\n@@ -1 +1 @@\n?garbage"),
		).toThrow("unreadable hunk line");
	});
});

describe("surfaces", () => {
	const cases: [Surface, Change, string][] = [
		[
			"data",
			{
				path: "db/migrations/0042_add_users.sql",
				added: ["x"],
				status: "added",
			},
			"migration path",
		],
		[
			"data",
			{ path: "src/main/resources/db/changelog/v2.xml", added: ["x"] },
			"java changelog",
		],
		[
			"data",
			{
				path: "app/models.py",
				added: ["    op.add_column('users', sa.Column('email'))"],
			},
			"alembic op",
		],
		["contract", { path: "api/openapi.yaml", added: ["x"] }, "openapi"],
		["contract", { path: "proto/orders.proto", added: ["x"] }, "proto"],
		[
			"contract",
			{ path: "src/main/java/com/x/OrderController.java", added: ["x"] },
			"java controller",
		],
		["config", { path: ".env.example", added: ["X=1"] }, "env file"],
		[
			"config",
			{ path: "src/main/resources/application-prod.yml", added: ["x"] },
			"spring config",
		],
		[
			"config",
			{ path: "src/handler.ts", added: ["const url = process.env.API_URL;"] },
			"env read",
		],
		[
			"config",
			{ path: "svc/client.py", added: ["url = os.getenv('URL')"] },
			"python env read",
		],
		["auth", { path: "src/auth/session.ts", added: ["x"] }, "auth path"],
		[
			"auth",
			{
				path: "src/main/java/com/x/Orders.java",
				added: ["@PreAuthorize(\"hasRole('ADMIN')\")"],
			},
			"spring auth",
		],
		["infra", { path: "Dockerfile", added: ["FROM node:22"] }, "dockerfile"],
		["infra", { path: ".gitlab-ci.yml", added: ["x"] }, "ci"],
		["infra", { path: "deploy/main.tf", added: ["x"] }, "terraform"],
		["dependencies", { path: "package.json", added: ["x"] }, "npm"],
		["dependencies", { path: "pyproject.toml", added: ["x"] }, "python"],
		["dependencies", { path: "service/pom.xml", added: ["x"] }, "maven"],
		["dependencies", { path: "build.gradle.kts", added: ["x"] }, "gradle"],
		["user-facing", { path: "web/src/Button.tsx", added: ["x"] }, "ui"],
		["user-facing", { path: "README.md", added: ["x"] }, "docs"],
	];

	for (const [surface, change, label] of cases) {
		test(`${label} marks ${surface}`, () => {
			const scan = scanDiff(diffOf(change));
			expect(scan.surfaces).toContain(surface);
			expect(
				scan.marks.some(
					(mark) => mark.surface === surface && mark.path === change.path,
				),
			).toBe(true);
		});
	}

	test("a plain source edit marks nothing", () => {
		const scan = scanDiff(
			diffOf({
				path: "src/math/add.ts",
				added: ["return a + b;"],
				removed: ["return a - b;"],
			}),
		);
		expect(scan.surfaces).toEqual([]);
		expect(scan.loweredBar).toEqual([]);
		expect(scan.oneWay).toEqual([]);
	});

	test("spec and delivery artefacts are excluded and mark nothing", () => {
		const scan = scanDiff(
			diffOf(
				{
					path: "openspec/changes/x/.openspec.yaml",
					added: ["schema: spec-driven"],
				},
				{ path: ".delivery/ledger.md", added: ["x"] },
				{ path: ".review/mr-1/abc/fanout.json", added: ["x"] },
			),
		);
		expect(scan.surfaces).toEqual([]);
		expect(scan.paths).toEqual([]);
		expect(scan.excluded).toEqual([
			"openspec/changes/x/.openspec.yaml",
			".delivery/ledger.md",
			".review/mr-1/abc/fanout.json",
		]);
	});

	test("surfaces are listed once, in a fixed order", () => {
		const scan = scanDiff(
			diffOf(
				{ path: "package.json", added: ["x"] },
				{ path: "Dockerfile", added: ["x"] },
				{ path: "db/migrations/1.sql", added: ["x"] },
				{ path: "db/migrations/2.sql", added: ["x"] },
			),
		);
		expect(scan.surfaces).toEqual(["data", "infra", "dependencies"]);
	});
});

describe("one-way signals", () => {
	test("a dropped column is one-way", () => {
		const scan = scanDiff(
			diffOf({
				path: "db/migrations/3.sql",
				added: ["ALTER TABLE users DROP COLUMN email;"],
			}),
		);
		expect(scan.oneWay).toEqual([
			{
				path: "db/migrations/3.sql",
				line: "ALTER TABLE users DROP COLUMN email;",
			},
		]);
	});

	test("truncate, delete, and alembic drops are one-way", () => {
		const scan = scanDiff(
			diffOf({
				path: "migrations/versions/4.py",
				added: [
					"TRUNCATE TABLE audit;",
					"DELETE FROM sessions;",
					"op.drop_table('legacy')",
				],
			}),
		);
		expect(scan.oneWay).toHaveLength(3);
	});

	test("a removed drop is not a one-way signal", () => {
		const scan = scanDiff(
			diffOf({ path: "db/migrations/5.sql", removed: ["DROP TABLE x;"] }),
		);
		expect(scan.oneWay).toEqual([]);
	});

	test("an added table is not one-way", () => {
		const scan = scanDiff(
			diffOf({
				path: "db/migrations/6.sql",
				added: ["CREATE TABLE x (id int);"],
			}),
		);
		expect(scan.oneWay).toEqual([]);
	});
});

describe("lowered bar", () => {
	test("a deleted test file is reported in each language", () => {
		for (const path of [
			"src/a.test.ts",
			"tests/test_orders.py",
			"src/test/java/com/x/OrderTest.java",
		]) {
			expect([
				path,
				kinds(diffOf({ path, removed: ["x"], status: "deleted" })),
			]).toEqual([path, ["deleted-test"]]);
		}
	});

	test("a deleted source file is not a deleted test", () => {
		expect(
			kinds(diffOf({ path: "src/a.ts", removed: ["x"], status: "deleted" })),
		).toEqual([]);
	});

	const skipped: [string, string][] = [
		["src/a.test.ts", "it.skip('works', () => {})"],
		["src/a.test.ts", "describe.skip('suite', () => {})"],
		["src/a.test.ts", "xit('works', () => {})"],
		["src/a.test.ts", "test.only('works', () => {})"],
		["tests/test_a.py", "@pytest.mark.skip(reason='flaky')"],
		["tests/test_a.py", "@pytest.mark.xfail"],
		["tests/test_a.py", "@unittest.skip('later')"],
		["src/test/java/ATest.java", "@Disabled"],
		["src/test/java/ATest.java", "@Ignore"],
	];
	for (const [path, line] of skipped) {
		test(`skipped test: ${line}`, () => {
			expect(kinds(diffOf({ path, added: [line] }))).toEqual(["skipped-test"]);
		});
	}

	const suppressions: [string, string][] = [
		["src/a.ts", "// @ts-ignore"],
		["src/a.ts", "// @ts-expect-error"],
		["src/a.ts", "// eslint-disable-next-line no-console"],
		["src/a.ts", "// biome-ignore lint/suspicious/noExplicitAny: legacy"],
		["src/a.ts", "/* istanbul ignore next */"],
		["svc/a.py", "x = y  # type: ignore"],
		["svc/a.py", "import os  # noqa: F401"],
		["svc/a.py", "# pylint: disable=broad-except"],
		["svc/a.py", "if debug:  # pragma: no cover"],
		["svc/a.py", "subprocess.call(cmd, shell=True)  # nosec"],
		["src/main/java/A.java", '@SuppressWarnings("unchecked")'],
		["src/main/java/A.java", "int x = 1; // NOSONAR"],
		["src/a.ts", 'const key = "abc"; // gitleaks:allow'],
	];
	for (const [path, line] of suppressions) {
		test(`suppression: ${line}`, () => {
			expect(kinds(diffOf({ path, added: [line] }))).toEqual(["suppression"]);
		});
	}

	test("a removed suppression is not a hit", () => {
		expect(
			kinds(diffOf({ path: "src/a.ts", removed: ["// @ts-ignore"] })),
		).toEqual([]);
	});

	const stubs: [string, string][] = [
		["svc/orders.py", "    raise NotImplementedError"],
		[
			"src/main/java/Orders.java",
			'throw new UnsupportedOperationException("later");',
		],
		["src/orders.ts", 'throw new Error("not implemented");'],
	];
	for (const [path, line] of stubs) {
		test(`stub in production code: ${line}`, () => {
			expect(kinds(diffOf({ path, added: [line] }))).toEqual(["stub"]);
		});
	}

	test("a stub in a test file is not a production stub", () => {
		expect(
			kinds(
				diffOf({
					path: "tests/test_a.py",
					added: ["raise NotImplementedError"],
				}),
			),
		).toEqual([]);
	});

	test("net-removed assertions in a test file are reported", () => {
		const scan = scanDiff(
			diffOf({
				path: "src/orders.test.ts",
				removed: ["expect(total).toBe(3);", "expect(items).toHaveLength(2);"],
				added: ["expect(total).toBeDefined();"],
			}),
		);
		expect(scan.loweredBar).toEqual([
			{
				kind: "removed-assertions",
				path: "src/orders.test.ts",
				detail: "1 more assertion lines removed than added",
			},
		]);
	});

	test("python and java assertion removals are reported", () => {
		expect(
			kinds(
				diffOf({ path: "tests/test_a.py", removed: ["    assert total == 3"] }),
			),
		).toEqual(["removed-assertions"]);
		expect(
			kinds(
				diffOf({
					path: "src/test/java/OrderTest.java",
					removed: [
						"assertThat(total).isEqualTo(3);",
						"assertEquals(2, items.size());",
					],
					added: ["assertThat(total).isEqualTo(4);"],
				}),
			),
		).toEqual(["removed-assertions"]);
	});

	test("a reworded assertion is not a hit", () => {
		expect(
			kinds(
				diffOf({
					path: "src/orders.test.ts",
					removed: ["expect(total).toBe(3);"],
					added: ["expect(total).toBe(4);"],
				}),
			),
		).toEqual([]);
	});

	test("a lowered threshold is reported", () => {
		const scan = scanDiff(
			diffOf({
				path: "pyproject.toml",
				removed: ["fail_under = 90"],
				added: ["fail_under = 80"],
			}),
		);
		expect(scan.loweredBar).toEqual([
			{
				kind: "lowered-threshold",
				path: "pyproject.toml",
				detail: "fail_under lowered from 90 to 80",
			},
		]);
	});

	test("jest, jacoco, and removed thresholds are reported", () => {
		expect(
			kinds(
				diffOf({
					path: "jest.config.ts",
					removed: ["    branches: 85,"],
					added: ["    branches: 70,"],
				}),
			),
		).toEqual(["lowered-threshold"]);
		expect(
			kinds(
				diffOf({
					path: "pom.xml",
					removed: ["<minimum>0.80</minimum>"],
					added: ["<minimum>0.60</minimum>"],
				}),
			),
		).toEqual(["lowered-threshold"]);
		expect(
			kinds(diffOf({ path: "setup.cfg", removed: ["fail_under = 90"] })),
		).toEqual(["lowered-threshold"]);
	});

	test("a raised threshold is not a hit", () => {
		expect(
			kinds(
				diffOf({
					path: "pyproject.toml",
					removed: ["fail_under = 80"],
					added: ["fail_under = 90"],
				}),
			),
		).toEqual([]);
	});

	test("a number in source code is not a threshold", () => {
		expect(
			kinds(
				diffOf({
					path: "src/report.ts",
					removed: ["const lines = 5;"],
					added: ["const lines = 3;"],
				}),
			),
		).toEqual([]);
	});
});

describe("cli", () => {
	async function git(cwd: string, ...args: string[]): Promise<string> {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) throw new Error(err);
		return out.trim();
	}

	async function write(
		root: string,
		path: string,
		body: string,
	): Promise<void> {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), body);
	}

	const script = join(import.meta.dir, "diff-scan.ts");

	test("scans a real base...head range", async () => {
		const root = await mkdtemp(join(tmpdir(), "diff-scan-"));
		try {
			await git(root, "init", "-q", "-b", "main");
			await git(root, "config", "user.email", "t@example.com");
			await git(root, "config", "user.name", "t");
			await write(root, "src/a.test.ts", "expect(1).toBe(1);\n");
			await git(root, "add", ".");
			await git(root, "commit", "-qm", "base");
			const base = await git(root, "rev-parse", "HEAD");
			await write(root, "src/a.test.ts", "it.skip('x', () => {});\n");
			await write(root, "db/migrations/1.sql", "DROP TABLE users;\n");
			await write(root, "openspec/changes/x/proposal.md", "why\n");
			await git(root, "add", ".");
			await git(root, "commit", "-qm", "head");
			const head = await git(root, "rev-parse", "HEAD");

			const proc = Bun.spawn(["bun", script, base, head], {
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [out, code] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);
			expect(code).toBe(0);
			const scan = JSON.parse(out);
			expect(scan.surfaces).toEqual(["data"]);
			expect(scan.oneWay).toEqual([
				{ path: "db/migrations/1.sql", line: "DROP TABLE users;" },
			]);
			expect(
				scan.loweredBar.map((hit: { kind: string }) => hit.kind).sort(),
			).toEqual(["removed-assertions", "skipped-test"]);
			expect(scan.excluded).toEqual(["openspec/changes/x/proposal.md"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("an unreadable diff file exits non-zero with no marks", async () => {
		const root = await mkdtemp(join(tmpdir(), "diff-scan-"));
		try {
			await write(root, "bad.diff", "@@ -1 +1 @@\n+x\n");
			const proc = Bun.spawn(
				["bun", script, "--diff", join(root, "bad.diff")],
				{ stdout: "pipe", stderr: "pipe" },
			);
			const [out, err, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			expect(code).toBe(1);
			expect(out).toBe("");
			expect(err).toContain("diff line before any file header");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("an unknown revision exits non-zero", async () => {
		const root = await mkdtemp(join(tmpdir(), "diff-scan-"));
		try {
			await git(root, "init", "-q");
			const proc = Bun.spawn(["bun", script, "nope", "also-nope"], {
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(await proc.exited).toBe(1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
