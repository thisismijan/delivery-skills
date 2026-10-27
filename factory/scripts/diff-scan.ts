import { NON_CODE_PREFIXES } from "./review-fanout";

export const SURFACES = [
	"data",
	"contract",
	"config",
	"auth",
	"infra",
	"dependencies",
	"user-facing",
] as const;

export type Surface = (typeof SURFACES)[number];

export const BAR_KINDS = [
	"deleted-test",
	"skipped-test",
	"removed-assertions",
	"lowered-threshold",
	"suppression",
	"stub",
] as const;

export type BarKind = (typeof BAR_KINDS)[number];

export interface DiffFile {
	path: string;
	status: "added" | "deleted" | "modified" | "renamed";
	binary: boolean;
	added: string[];
	removed: string[];
}

export interface SurfaceMark {
	surface: Surface;
	path: string;
	signal: string;
}

export interface OneWaySignal {
	path: string;
	line: string;
}

export interface BarHit {
	kind: BarKind;
	path: string;
	detail: string;
}

export interface DiffScan {
	surfaces: Surface[];
	marks: SurfaceMark[];
	oneWay: OneWaySignal[];
	loweredBar: BarHit[];
	paths: string[];
	excluded: string[];
}

function unquote(raw: string): string {
	if (!raw.startsWith('"')) return raw;
	if (!raw.endsWith('"') || raw.length < 2) {
		throw new Error(`unreadable quoted path: ${raw}`);
	}
	return raw
		.slice(1, -1)
		.replace(/\\(["\\])/g, "$1")
		.replace(/\\t/g, "\t");
}

function stripPrefix(raw: string, prefix: "a/" | "b/"): string {
	const path = unquote(raw.trim());
	if (!path.startsWith(prefix)) {
		throw new Error(`unreadable diff path: ${raw}`);
	}
	return path.slice(prefix.length);
}

function headerPaths(line: string): { from: string; to: string } {
	const rest = line.slice("diff --git ".length);
	if (rest.startsWith('"')) {
		const match = rest.match(/^("(?:[^"\\]|\\.)*")\s+(.+)$/);
		if (!match?.[1] || !match[2]) {
			throw new Error(`unreadable diff header: ${line}`);
		}
		return {
			from: stripPrefix(match[1], "a/"),
			to: stripPrefix(match[2], "b/"),
		};
	}
	const split = rest.indexOf(" b/");
	if (!rest.startsWith("a/") || split < 0) {
		throw new Error(`unreadable diff header: ${line}`);
	}
	return {
		from: rest.slice(2, split),
		to: rest.slice(split + 3),
	};
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
	const files: DiffFile[] = [];
	let current: DiffFile | undefined;
	let inHunk = false;
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git ")) {
			const { from, to } = headerPaths(line);
			current = {
				path: to,
				status: from === to ? "modified" : "renamed",
				binary: false,
				added: [],
				removed: [],
			};
			files.push(current);
			inHunk = false;
			continue;
		}
		if (!current) {
			if (line.trim() === "") continue;
			throw new Error(`diff line before any file header: ${line}`);
		}
		if (line.startsWith("@@")) {
			inHunk = true;
			continue;
		}
		if (!inHunk) {
			if (line.startsWith("new file mode")) current.status = "added";
			else if (line.startsWith("deleted file mode")) current.status = "deleted";
			else if (line.startsWith("Binary files ")) current.binary = true;
			else if (line.startsWith("--- ") && current.status === "deleted") {
				current.path = stripPrefix(line.slice(4), "a/");
			} else if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null")) {
				current.path = stripPrefix(line.slice(4), "b/");
			}
			continue;
		}
		if (line.startsWith("+")) current.added.push(line.slice(1));
		else if (line.startsWith("-")) current.removed.push(line.slice(1));
		else if (line.startsWith(" ") || line.startsWith("\\") || line === "") {
			// context, "\ No newline at end of file", or trailing newline
		} else {
			throw new Error(`unreadable hunk line in ${current.path}: ${line}`);
		}
	}
	return files;
}

interface PathRule {
	surface: Surface;
	pattern: RegExp;
	signal: string;
}

const PATH_RULES: PathRule[] = [
	{
		surface: "data",
		pattern:
			/(^|\/)(migrations?|alembic|flyway|liquibase|db\/changelog|schema)(\/|$)|\.sql$|(^|\/)schema\.prisma$|(^|\/)src\/main\/resources\/db\//i,
		signal: "migration or schema path",
	},
	{
		surface: "contract",
		pattern:
			/(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$|\.(proto|avsc|graphql|gql)$|(^|\/)(routes?|controllers?|endpoints?|handlers?|api)(\/|$)|Controller\.java$|Resource\.java$/i,
		signal: "API, route, or message schema path",
	},
	{
		surface: "config",
		pattern:
			/(^|\/)\.env(\.|$)|(^|\/)application[^/]*\.(ya?ml|properties)$|(^|\/)(config|settings|conf)(\/|$)|(^|\/)settings\.py$|(^|\/)[^/]*\.(ini|cfg|properties)$|(^|\/)(feature[-_]?flags?)[^/]*$/i,
		signal: "configuration path",
	},
	{
		surface: "auth",
		pattern:
			/(auth|security|permission|rbac|oauth|oidc|jwt|token|session|login|acl|credential|secret)/i,
		signal: "authentication or authorization path",
	},
	{
		surface: "infra",
		pattern:
			/(^|\/)(Dockerfile|Containerfile)[^/]*$|(^|\/)docker-compose[^/]*\.ya?ml$|(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)\.gitlab\/ci\/|(^|\/)\.github\/workflows\/|(^|\/)Jenkinsfile$|\.(tf|tfvars|hcl|nomad)$|(^|\/)(helm|charts|k8s|kubernetes|deploy|deployment|terraform|nomad|infra)(\/|$)|(^|\/)Procfile$/i,
		signal: "container, CI, or deploy path",
	},
	{
		surface: "dependencies",
		pattern:
			/(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.(txt|in)|constraints[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(\.lock)?|setup\.py|setup\.cfg|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.lockfile|libs\.versions\.toml|go\.mod|go\.sum|Cargo\.(toml|lock))$/i,
		signal: "dependency manifest or lockfile",
	},
	{
		surface: "user-facing",
		pattern:
			/\.(md|mdx|rst|html?|css|scss|sass|less|tsx|jsx|vue|svelte|po|pot)$|(^|\/)(docs|i18n|locales?|templates|static|public)(\/|$)/i,
		signal: "UI, copy, or user docs path",
	},
];

interface LineRule {
	surface: Surface;
	pattern: RegExp;
	signal: string;
}

const LINE_RULES: LineRule[] = [
	{
		surface: "data",
		pattern:
			/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|COLUMN|SCHEMA|VIEW)\b|\bTRUNCATE\s+(TABLE\s+)?\w|\bDELETE\s+FROM\b|\bop\.(add|drop|alter)_column\b|@(Entity|Table)\b/i,
		signal: "schema or data statement",
	},
	{
		surface: "config",
		pattern:
			/\bprocess\.env\b|\bBun\.env\b|\bimport\.meta\.env\b|\bos\.environ\b|\bos\.getenv\(|\bSystem\.getenv\(|@Value\(\s*"\$\{|@ConfigurationProperties\b/,
		signal: "environment or configuration read",
	},
	{
		surface: "auth",
		pattern:
			/@(PreAuthorize|PostAuthorize|Secured|RolesAllowed|PermitAll|DenyAll)\b|\bEnableWebSecurity\b|\bSecurityFilterChain\b|\bjwt\.(sign|verify|decode)\(|\bbcrypt\b|\bAuthorization\b|\bBearer\b|\blogin_required\b|\bpermission_required\b/,
		signal: "authentication or authorization code",
	},
];

const ONE_WAY =
	/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|INDEX)\b|\bTRUNCATE\s+(TABLE\s+)?\w|\bDELETE\s+FROM\b|\bop\.drop_(table|column)\b|\bdropTable\b|\bdropColumn\b/i;

const TEST_PATH =
	/(^|\/)(tests?|__tests__|spec|src\/test|src\/it)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)conftest\.py$|(Test|Tests|IT|TestCase)\.(java|kt)$/;

const SKIP_PATTERNS: [RegExp, string][] = [
	[/\b(it|test|describe|context)\.(skip|todo|failing)\b/, "skipped test"],
	[/\b(it|test|describe)\.only\b/, "focused test hides others"],
	[/(^|[^\w.])x(it|describe|test)\s*\(/, "skipped test"],
	[/@pytest\.mark\.(skip|skipif|xfail)\b/, "skipped or expected-fail test"],
	[/\bpytest\.(skip|xfail)\s*\(/, "skipped or expected-fail test"],
	[/@unittest\.(skip|skipIf|skipUnless|expectedFailure)\b/, "skipped test"],
	[/@(Disabled|DisabledIf\w*|Ignore)\b/, "disabled test"],
	[/\bAssumptions?\.assume(True|False|That)\s*\(/, "assumption can skip test"],
];

const SUPPRESSIONS: [RegExp, string][] = [
	[/@ts-(ignore|expect-error|nocheck)\b/, "type-check suppression"],
	[/\beslint-disable\b/, "lint suppression"],
	[/\bbiome-ignore\b/, "lint suppression"],
	[/#\s*type:\s*ignore\b/, "type-check suppression"],
	[/#\s*noqa\b/, "lint suppression"],
	[/#\s*pylint:\s*disable\b/, "lint suppression"],
	[/#\s*pyright:\s*ignore\b/, "type-check suppression"],
	[/#\s*pragma:\s*no\s*cover\b/, "coverage suppression"],
	[/\b(istanbul|c8|v8)\s+ignore\b/, "coverage suppression"],
	[/@SuppressWarnings\b/, "compiler warning suppression"],
	[/@SuppressFBWarnings\b/, "static analysis suppression"],
	[/\bNOSONAR\b/, "static analysis suppression"],
	[/\bnosemgrep\b/, "security scanner suppression"],
	[/#\s*nosec\b/, "security scanner suppression"],
	[/\bgitleaks:allow\b/, "secret scanner allow"],
	[/\bpragma:\s*allowlist\s+secret\b/, "secret scanner allow"],
	[/\bCHECKSTYLE:OFF\b|@formatter:off/, "style check suppression"],
];

const STUBS: [RegExp, string][] = [
	[/\braise\s+NotImplementedError\b/, "not-implemented stub"],
	[
		/\bthrow\s+new\s+UnsupportedOperationException\s*\(/,
		"not-implemented stub",
	],
	[
		/\bthrow\s+new\s+Error\s*\(\s*["'`](not\s+implemented|todo|unimplemented)/i,
		"not-implemented stub",
	],
	[/\bTODO\s*\(\s*\)|\bunimplemented!\s*\(/, "not-implemented stub"],
];

const ASSERTION =
	/\bexpect\s*\(|\bassert[A-Z]\w*\s*\(|\bassert\b|\bassertThat\s*\(|\bverify\s*\(|\.should\b|\bself\.assert\w*\s*\(|\bpytest\.raises\s*\(/;

const THRESHOLD_KEY =
	/(["']?)([\w.-]*(coverage|threshold|fail[_-]?under|minimum|min[_-]?(?:coverage|ratio|score)|branches|lines|functions|statements|covered[_-]?ratio)[\w.-]*)\1\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i;

// Thresholds live in build and tool config; a `lines = 3` in source code is
// not one.
const THRESHOLD_FILE =
	/\.(json|ya?ml|toml|ini|cfg|xml|properties|gradle|kts)$|(^|\/)\.[^/]*rc$|config\.[cm]?[jt]s$/i;

const THRESHOLD_TAG =
	/<(minimum|coveredratio|minimumCoverage|haltOnFailure)>\s*(\d+(?:\.\d+)?)\s*</i;

function thresholds(lines: string[]): Map<string, number> {
	const found = new Map<string, number>();
	for (const line of lines) {
		const keyed = line.match(THRESHOLD_KEY);
		if (keyed?.[2] && keyed[4]) {
			found.set(keyed[2].toLowerCase(), Number(keyed[4]));
			continue;
		}
		const tagged = line.match(THRESHOLD_TAG);
		if (tagged?.[1] && tagged[2]) {
			found.set(`<${tagged[1].toLowerCase()}>`, Number(tagged[2]));
		}
	}
	return found;
}

function firstMatch(
	lines: string[],
	rules: [RegExp, string][],
): { line: string; label: string }[] {
	const hits: { line: string; label: string }[] = [];
	for (const line of lines) {
		for (const [pattern, label] of rules) {
			if (pattern.test(line)) {
				hits.push({ line: line.trim(), label });
				break;
			}
		}
	}
	return hits;
}

function count(lines: string[], pattern: RegExp): number {
	return lines.filter((line) => pattern.test(line)).length;
}

export function scanDiff(diff: string): DiffScan {
	const files = parseUnifiedDiff(diff);
	const marks: SurfaceMark[] = [];
	const oneWay: OneWaySignal[] = [];
	const loweredBar: BarHit[] = [];
	const paths: string[] = [];
	const excluded: string[] = [];

	for (const file of files) {
		if (NON_CODE_PREFIXES.some((prefix) => file.path.startsWith(prefix))) {
			excluded.push(file.path);
			continue;
		}
		paths.push(file.path);
		const isTest = TEST_PATH.test(file.path);

		for (const rule of PATH_RULES) {
			if (rule.pattern.test(file.path)) {
				marks.push({
					surface: rule.surface,
					path: file.path,
					signal: rule.signal,
				});
			}
		}
		const changed = [...file.added, ...file.removed];
		for (const rule of LINE_RULES) {
			if (isTest) continue;
			const line = changed.find((candidate) => rule.pattern.test(candidate));
			if (line !== undefined) {
				marks.push({
					surface: rule.surface,
					path: file.path,
					signal: `${rule.signal}: ${line.trim()}`,
				});
			}
		}

		for (const line of file.added) {
			if (ONE_WAY.test(line))
				oneWay.push({ path: file.path, line: line.trim() });
		}

		if (file.status === "deleted" && isTest) {
			loweredBar.push({
				kind: "deleted-test",
				path: file.path,
				detail: "test file deleted",
			});
		}
		for (const hit of firstMatch(file.added, SKIP_PATTERNS)) {
			loweredBar.push({
				kind: "skipped-test",
				path: file.path,
				detail: `${hit.label}: ${hit.line}`,
			});
		}
		for (const hit of firstMatch(file.added, SUPPRESSIONS)) {
			loweredBar.push({
				kind: "suppression",
				path: file.path,
				detail: `${hit.label}: ${hit.line}`,
			});
		}
		if (!isTest) {
			for (const hit of firstMatch(file.added, STUBS)) {
				loweredBar.push({
					kind: "stub",
					path: file.path,
					detail: `${hit.label}: ${hit.line}`,
				});
			}
		}
		if (isTest && file.status !== "deleted") {
			const removed = count(file.removed, ASSERTION);
			const added = count(file.added, ASSERTION);
			if (removed > added) {
				loweredBar.push({
					kind: "removed-assertions",
					path: file.path,
					detail: `${removed - added} more assertion lines removed than added`,
				});
			}
		}
		if (!THRESHOLD_FILE.test(file.path)) continue;
		const before = thresholds(file.removed);
		const after = thresholds(file.added);
		for (const [key, was] of before) {
			const now = after.get(key);
			if (now === undefined) {
				loweredBar.push({
					kind: "lowered-threshold",
					path: file.path,
					detail: `${key} ${was} removed`,
				});
			} else if (now < was) {
				loweredBar.push({
					kind: "lowered-threshold",
					path: file.path,
					detail: `${key} lowered from ${was} to ${now}`,
				});
			}
		}
	}

	const surfaces = SURFACES.filter((surface) =>
		marks.some((mark) => mark.surface === surface),
	);
	return { surfaces, marks, oneWay, loweredBar, paths, excluded };
}

async function gitDiff(base: string, head: string): Promise<string> {
	const proc = Bun.spawn(
		[
			"git",
			"-c",
			"core.quotepath=false",
			"diff",
			"--no-color",
			"--no-ext-diff",
			"-M",
			`${base}...${head}`,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(err.trim() || `git diff exited ${code}`);
	return out;
}

const USAGE = [
	"usage: diff-scan <base> <head>",
	"       diff-scan --diff <file.diff>",
].join("\n");

if (import.meta.main) {
	const [first, second] = process.argv.slice(2);
	if (!first || !second) {
		console.error(USAGE);
		process.exit(2);
	}
	try {
		const diff =
			first === "--diff"
				? await Bun.file(second).text()
				: await gitDiff(first, second);
		console.log(JSON.stringify(scanDiff(diff), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
