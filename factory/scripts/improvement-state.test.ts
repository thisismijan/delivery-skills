import { expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detectLegacyState,
	improvementPaths,
	resolveStateRoot,
} from "./improvement-state";

async function fingerprint(root: string): Promise<string> {
	const lines: string[] = [];
	async function walk(dir: string, rel: string): Promise<void> {
		let names: string[];
		try {
			names = (await readdir(dir)).sort();
		} catch {
			lines.push(`${rel}<missing>`);
			return;
		}
		for (const name of names) {
			const path = join(dir, name);
			const next = rel ? `${rel}/${name}` : name;
			const info = await stat(path);
			if (info.isDirectory()) {
				lines.push(`d ${next}`);
				await walk(path, next);
			} else {
				lines.push(`f ${next} ${await readFile(path, "utf8")}`);
			}
		}
	}
	await walk(root, "");
	return lines.join("\n");
}

test("the default state root is the target repository .delivery folder", async () => {
	const repo = await mkdtemp(join(tmpdir(), "improve-repo-"));
	try {
		expect(resolveStateRoot({}, repo)).toBe(join(repo, ".delivery"));
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});

test("DELIVERY_STATE_ROOT overrides the default state root", async () => {
	const repo = await mkdtemp(join(tmpdir(), "improve-repo-"));
	const override = await mkdtemp(join(tmpdir(), "improve-state-"));
	try {
		expect(resolveStateRoot({ DELIVERY_STATE_ROOT: override }, repo)).toBe(
			override,
		);
		const paths = improvementPaths(override);
		expect(paths.candidates).toBe(join(override, "candidates"));
		expect(paths.versions).toBe(join(override, "versions"));
	} finally {
		await rm(repo, { recursive: true, force: true });
		await rm(override, { recursive: true, force: true });
	}
});

test("candidate and version folders resolve under the state root", async () => {
	const repo = await mkdtemp(join(tmpdir(), "improve-repo-"));
	try {
		const root = resolveStateRoot({}, repo);
		const paths = improvementPaths(root);
		expect(paths.candidates).toBe(join(repo, ".delivery", "candidates"));
		expect(paths.versions).toBe(join(repo, ".delivery", "versions"));
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});

test("detection reports leftover skill-local candidates and versions with destinations", async () => {
	const skill = await mkdtemp(join(tmpdir(), "improve-skill-"));
	const stateRoot = await mkdtemp(join(tmpdir(), "improve-state-"));
	try {
		const candidate = "improve-20261015-missing-rollback";
		const version = "20261015T000000Z-deadbeef";
		await mkdir(join(skill, "candidates", candidate), { recursive: true });
		await writeFile(
			join(skill, "candidates", candidate, "manifest.md"),
			"legacy candidate",
		);
		await mkdir(join(skill, "versions", version), { recursive: true });
		await writeFile(
			join(skill, "versions", version, "skill.md"),
			"legacy version",
		);
		const beforeSkill = await fingerprint(skill);
		const beforeState = await fingerprint(stateRoot);
		const report = await detectLegacyState(skill, stateRoot);
		expect(report.entries).toEqual([
			{
				kind: "candidate",
				name: candidate,
				from: join(skill, "candidates", candidate),
				to: join(stateRoot, "candidates", candidate),
			},
			{
				kind: "version",
				name: version,
				from: join(skill, "versions", version),
				to: join(stateRoot, "versions", version),
			},
		]);
		expect(await fingerprint(skill)).toBe(beforeSkill);
		expect(await fingerprint(stateRoot)).toBe(beforeState);
	} finally {
		await rm(skill, { recursive: true, force: true });
		await rm(stateRoot, { recursive: true, force: true });
	}
});

test("detection performs no writes against an empty or missing skill folder", async () => {
	const root = await mkdtemp(join(tmpdir(), "improve-empty-"));
	try {
		const missingSkill = join(root, "missing-skill");
		const emptySkill = join(root, "empty-skill");
		const missingState = join(root, "missing-state");
		await mkdir(emptySkill, { recursive: true });
		await mkdir(join(emptySkill, "candidates"), { recursive: true });
		await mkdir(join(emptySkill, "versions"), { recursive: true });
		const beforeEmpty = await fingerprint(emptySkill);
		const beforeRoot = await fingerprint(root);
		expect(
			(await detectLegacyState(missingSkill, missingState)).entries,
		).toEqual([]);
		expect((await detectLegacyState(emptySkill, missingState)).entries).toEqual(
			[],
		);
		expect(await fingerprint(emptySkill)).toBe(beforeEmpty);
		expect(await fingerprint(root)).toBe(beforeRoot);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
