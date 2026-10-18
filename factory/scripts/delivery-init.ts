import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// biome-ignore format: workflow contracts require one literal invocation
export const DELIVERY_INIT_INVOCATION = 'scripts/delivery-init.ts';

const DELIVERY_IGNORES = [".delivery/", ".review/"] as const;

export function withDeliveryIgnores(input: string): string {
	const lines = input.split(/\r?\n/);
	const existing = new Set(lines.map((line) => line.trim()));
	const output = input.length === 0 ? [] : [...lines];
	while (output.at(-1) === "") output.pop();
	for (const entry of DELIVERY_IGNORES) {
		if (!existing.has(entry)) output.push(entry);
	}
	return `${output.join("\n")}\n`;
}

async function repositoryRoot(cwd: string): Promise<string> {
	const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`run delivery init inside the target git repository${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
		);
	}
	return stdout.trim();
}

export async function initializeTargetRepository(cwd: string): Promise<string> {
	const root = await repositoryRoot(cwd);
	const ignorePath = join(root, ".gitignore");
	try {
		if ((await lstat(ignorePath)).isSymbolicLink()) {
			throw new Error("refusing to write a symlinked .gitignore");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	let current = "";
	try {
		current = await readFile(ignorePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const next = withDeliveryIgnores(current);
	if (next !== current) await writeFile(ignorePath, next);
	return root;
}

if (import.meta.main) {
	try {
		const root = await initializeTargetRepository(process.cwd());
		const factoryRoot =
			process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
		const doctor = Bun.spawn(
			["bun", join(factoryRoot, "scripts", "doctor.ts")],
			{
				cwd: root,
				env: { ...process.env, DELIVERY_FACTORY_ROOT: factoryRoot },
				stdout: "inherit",
				stderr: "inherit",
			},
		);
		const code = await doctor.exited;
		console.log(
			[
				"",
				`Target repository initialized: ${root}`,
				"First commands:",
				"  /delivery help",
				"  /delivery discover <idea>",
				"  /delivery status",
			].join("\n"),
		);
		process.exit(code);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
