import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSwiftFormat, swiftIdentity } from "./apply-swift-format";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function project(source: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "swift-format-"));
	roots.push(root);
	await mkdir(join(root, "Sources"), { recursive: true });
	await writeFile(join(root, "Sources/A.swift"), source);
	return root;
}

async function wrapper(root: string): Promise<void> {
	await mkdir(join(root, "bin"), { recursive: true });
	await writeFile(join(root, "bin/swift-format"), "#!/bin/sh\ncat\n");
	await chmod(join(root, "bin/swift-format"), 0o755);
}

test("Swift identity ignores layout and nested comments but keeps every string form", () => {
	expect(
		swiftIdentity(
			'func run(){/* a /* b */ c */ let raw = #"x"#; let text = """\nhello\n"""}',
		),
	).toBe(
		swiftIdentity(
			'func run() {\n    let raw = #"x"#\n;    let text = """\nhello\n"""\n}',
		),
	);
	expect(swiftIdentity('let text = "\\(value)"')).not.toBe(
		swiftIdentity('let text = "\\( value )"'),
	);
});

test("format-only needs the repo wrapper, accepts layout, and rejects token changes", async () => {
	const root = await project("func run(){ return }\n");
	expect(
		await planSwiftFormat({
			root,
			files: ["Sources/A.swift"],
			run: async () => undefined,
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("bin/swift-format"),
	});
	await wrapper(root);
	let command: string[] = [];
	expect(
		await planSwiftFormat({
			root,
			files: ["Sources/A.swift"],
			run: async (argv) => {
				command = argv;
				return "func run() {\n  return\n}\n";
			},
		}),
	).toMatchObject({ ok: true });
	expect(command.slice(1)).toEqual([
		"format",
		"--assume-filename",
		"Sources/A.swift",
	]);
	expect(
		await planSwiftFormat({
			root,
			files: ["Sources/A.swift"],
			run: async () => "func execute() {\n  return\n}\n",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("non-whitespace"),
	});
});
