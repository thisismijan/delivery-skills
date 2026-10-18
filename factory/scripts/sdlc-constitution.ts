import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const CONSTITUTION_VERSION = 1 as const;
export const RUN_CONTRACT_VERSION = 1 as const;

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CONSTITUTION_PREFLIGHT_INVOCATION =
	"scripts/sdlc-constitution.ts preflight";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CONSTITUTION_FREEZE_INVOCATION =
	"scripts/sdlc-constitution.ts freeze <draft.json>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CONSTITUTION_CHECK_INVOCATION =
	"scripts/sdlc-constitution.ts check <run-contract.json> <stage> [ticket-key]";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CONSTITUTION_REPORT_INVOCATION =
	"scripts/sdlc-constitution.ts report <run-contract.json> <stage> <results.json> [ticket-key]";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CONSTITUTION_SUPERSEDE_INVOCATION =
	"scripts/sdlc-constitution.ts supersede <current.json> <proposal.json>";

export const RUN_CONTRACT_RELATIVE_PATH =
	".delivery/runs/<id>.run-contract.json";

export const EnforcementKind = z.enum([
	"schema",
	"gate",
	"state-machine",
	"contract-test",
	"judgement",
]);
export type EnforcementKind = z.infer<typeof EnforcementKind>;

export const CommandmentKind = z.enum(["MUST", "NEVER"]);
export type CommandmentKind = z.infer<typeof CommandmentKind>;

export const HumanOwnedAction = z.enum([
	"merge",
	"tracker-status",
	"release-risk",
	"gate-override",
	"skill-install",
]);
export type HumanOwnedAction = z.infer<typeof HumanOwnedAction>;

export const ConstitutionPrecedence = z.enum([
	"constitution",
	"conductor",
	"auto",
	"ledger",
	"stage-spec",
	"skill",
	"historical",
]);
export type ConstitutionPrecedence = z.infer<typeof ConstitutionPrecedence>;

export const Commandment = z
	.object({
		id: z.string().regex(/^[a-z][a-z0-9-]*$/),
		kind: CommandmentKind,
		title: z.string().min(1),
		enforcement: EnforcementKind,
		enforcementId: z.string().min(1),
	})
	.strict();
export type Commandment = z.infer<typeof Commandment>;

export const StageContract = z
	.object({
		inputs: z.array(z.string().min(1)),
		writes: z.array(z.string().min(1)),
		outputs: z.array(z.string().min(1)),
		next: z.array(z.string().min(1)),
		stops: z.array(z.string().min(1)),
		humanApprovals: z.array(z.string().min(1)),
	})
	.strict();
export type StageContract = z.infer<typeof StageContract>;

export const ConstitutionDocument = z
	.object({
		version: z.literal(CONSTITUTION_VERSION),
		id: z.literal("sdlc-constitution"),
		title: z.string().min(1),
		precedence: z.array(ConstitutionPrecedence).nonempty(),
		humanOwned: z.array(HumanOwnedAction).nonempty(),
		commandments: z.array(Commandment).min(1),
		stages: z.record(z.string(), StageContract),
	})
	.strict()
	.superRefine((doc, ctx) => {
		const ids = doc.commandments.map((item) => item.id);
		if (new Set(ids).size !== ids.length) {
			ctx.addIssue({
				code: "custom",
				path: ["commandments"],
				message: "commandment ids must be unique",
			});
		}
		if (doc.precedence[0] !== "constitution") {
			ctx.addIssue({
				code: "custom",
				path: ["precedence", 0],
				message: "constitution must outrank every other source",
			});
		}
		if (doc.precedence[doc.precedence.length - 1] !== "historical") {
			ctx.addIssue({
				code: "custom",
				path: ["precedence"],
				message: "historical files must be lowest precedence",
			});
		}
		for (const [stage, contract] of Object.entries(doc.stages)) {
			for (const write of contract.writes) {
				if ((HumanOwnedAction.options as string[]).includes(write)) {
					ctx.addIssue({
						code: "custom",
						path: ["stages", stage, "writes"],
						message: `stage '${stage}' cannot write human-owned action '${write}'`,
					});
				}
			}
		}
	});
export type ConstitutionDocument = z.infer<typeof ConstitutionDocument>;

const TicketKey = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/);

export const RunContractTicket = z
	.object({
		key: TicketKey,
		title: z.string().min(1),
		acceptance: z.array(z.string().min(1)).min(1).max(3),
		blockedBy: z.array(TicketKey),
	})
	.strict();
export type RunContractTicket = z.infer<typeof RunContractTicket>;

export const RunContractApproval = z
	.object({
		who: z.string().trim().min(1),
		words: z.string().trim().min(1),
		at: z.string().datetime(),
	})
	.strict();
export type RunContractApproval = z.infer<typeof RunContractApproval>;

const RunContractFields = {
	version: z.literal(RUN_CONTRACT_VERSION),
	runId: z.string().min(1),
	planVersion: z.number().int().positive(),
	goal: z.string().min(1),
	scope: z.array(z.string().min(1)).min(1),
	nonGoals: z.array(z.string().min(1)),
	tickets: z.array(RunContractTicket).min(1),
	permittedWrites: z.array(z.string().min(1)).min(1),
	humanOwned: z.array(HumanOwnedAction).nonempty(),
	approval: RunContractApproval,
	supersedesHash: z
		.string()
		.regex(/^sha256:[0-9a-f]{64}$/)
		.optional(),
	reason: z.string().min(1).optional(),
	affectedInvariant: z.string().min(1).optional(),
};

function refineRunContract(
	draft: {
		tickets: Array<{ key: string }>;
		permittedWrites: string[];
		planVersion: number;
		supersedesHash?: string;
		reason?: string;
		affectedInvariant?: string;
	},
	ctx: z.RefinementCtx,
): void {
	const keys = draft.tickets.map((ticket) => ticket.key);
	if (new Set(keys).size !== keys.length) {
		ctx.addIssue({
			code: "custom",
			path: ["tickets"],
			message: "ticket keys must be unique",
		});
	}
	for (const write of draft.permittedWrites) {
		if ((HumanOwnedAction.options as string[]).includes(write)) {
			ctx.addIssue({
				code: "custom",
				path: ["permittedWrites"],
				message: `human-owned action '${write}' cannot be a permitted write`,
			});
		}
	}
	if (draft.planVersion > 1 && !draft.supersedesHash) {
		ctx.addIssue({
			code: "custom",
			path: ["supersedesHash"],
			message: "a new plan version must name the hash it supersedes",
		});
	}
	if (draft.planVersion > 1 && !draft.reason) {
		ctx.addIssue({
			code: "custom",
			path: ["reason"],
			message: "a new plan version must record why the scope changed",
		});
	}
	if (draft.planVersion > 1 && !draft.affectedInvariant) {
		ctx.addIssue({
			code: "custom",
			path: ["affectedInvariant"],
			message: "a new plan version must name the affected invariant",
		});
	}
}

export const RunContractDraft = z
	.object(RunContractFields)
	.strict()
	.superRefine(refineRunContract);
export type RunContractDraft = z.infer<typeof RunContractDraft>;

export const FrozenRunContract = z
	.object({
		...RunContractFields,
		constitutionHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
		contractHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
	})
	.strict()
	.superRefine(refineRunContract);
export type FrozenRunContract = z.infer<typeof FrozenRunContract>;

export interface ConstitutionBundle {
	dir: string;
	document: ConstitutionDocument;
	markdown: string;
	hash: string;
}

export interface ContractCheckResult {
	ok: boolean;
	reason?: string;
}

const TICKET_SCOPED_STAGES = new Set([
	"draft",
	"execute",
	"review",
	"address-comments",
	"ship",
	"archive",
	"verify",
]);

export interface ConformanceCheck {
	id: string;
	ok: boolean;
	required: boolean;
	detail: string;
}

export interface ConformanceReport {
	version: 1;
	stage: string;
	constitutionHash: string;
	contractHash: string;
	allRequiredPassed: boolean;
	checks: ConformanceCheck[];
}

function canonical(value: unknown): string {
	return `${JSON.stringify(sortValue(value))}\n`;
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, sortValue(record[key])]),
		);
	}
	return value;
}

export function sha256Canonical(value: unknown): string {
	return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function parseJson(text: string, label: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${label} is not valid JSON`);
	}
}

export function parseConstitutionDocument(
	input: unknown,
): ConstitutionDocument {
	return ConstitutionDocument.parse(input);
}

export function parseRunContractDraft(input: unknown): RunContractDraft {
	return RunContractDraft.parse(input);
}

export function parseFrozenRunContract(input: unknown): FrozenRunContract {
	const parsed = FrozenRunContract.parse(input);
	const { contractHash, ...body } = parsed;
	const expected = sha256Canonical(body);
	if (expected !== contractHash) {
		throw new Error("run contract hash does not match its body");
	}
	return parsed;
}

export function defaultFactoryRoot(): string {
	return process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
}

export function resolveConstitutionDir(
	factoryRoot = defaultFactoryRoot(),
): string {
	const candidates = [
		join(factoryRoot, "..", "skills", "delivery"),
		join(factoryRoot, "..", "delivery"),
	];
	for (const dir of candidates) {
		if (
			existsSync(join(dir, "sdlc-constitution.json")) &&
			existsSync(join(dir, "SDLC-CONSTITUTION.md"))
		) {
			return dir;
		}
	}
	throw new Error(
		"SDLC constitution is missing. Reinstall this delivery-skills version.",
	);
}

export function loadConstitution(
	factoryRoot = defaultFactoryRoot(),
): ConstitutionBundle {
	const dir = resolveConstitutionDir(factoryRoot);
	const document = parseConstitutionDocument(
		parseJson(
			readFileSync(join(dir, "sdlc-constitution.json"), "utf8"),
			"sdlc-constitution.json",
		),
	);
	const markdown = readFileSync(join(dir, "SDLC-CONSTITUTION.md"), "utf8");
	assertMarkdownMatches(document, markdown);
	return {
		dir,
		document,
		markdown,
		hash: sha256Canonical(document),
	};
}

export function assertMarkdownMatches(
	document: ConstitutionDocument,
	markdown: string,
): void {
	const collapsed = markdown.replace(/\s+/g, " ");
	const prose = markdown.toLowerCase();
	if (!markdown.includes("# SDLC constitution")) {
		throw new Error("constitution markdown is missing its title");
	}
	if (!markdown.includes("this file wins")) {
		throw new Error("constitution markdown must state precedence");
	}
	for (const commandment of document.commandments) {
		if (!markdown.includes(`Id \`${commandment.id}\``)) {
			throw new Error(
				`constitution markdown is missing commandment ${commandment.id}`,
			);
		}
		if (!collapsed.includes(commandment.title.replace(/\.$/, ""))) {
			throw new Error(
				`constitution markdown is missing title for ${commandment.id}`,
			);
		}
	}
	for (const action of document.humanOwned) {
		const needle = action.replaceAll("-", " ");
		if (!prose.includes(needle) && !prose.includes(action)) {
			throw new Error(
				`constitution markdown is missing human-owned action ${action}`,
			);
		}
	}
}

export function freezeRunContract(
	draftInput: unknown,
	constitutionHash: string,
): FrozenRunContract {
	if (!/^sha256:[0-9a-f]{64}$/.test(constitutionHash)) {
		throw new Error("constitution hash must be a sha256 digest");
	}
	const draft = parseRunContractDraft(draftInput);
	const withConstitution = {
		...draft,
		constitutionHash,
	};
	const contractHash = sha256Canonical(withConstitution);
	return FrozenRunContract.parse({
		...withConstitution,
		contractHash,
	});
}

export function freezeAgainstLiveConstitution(
	draftInput: unknown,
	factoryRoot = defaultFactoryRoot(),
): FrozenRunContract {
	const live = loadConstitution(factoryRoot);
	const draft = parseRunContractDraft(draftInput);
	for (const owned of live.document.humanOwned) {
		if (!draft.humanOwned.includes(owned)) {
			throw new Error(`run contract omitted human-owned action '${owned}'`);
		}
	}
	return freezeRunContract(draft, live.hash);
}

export function checkRunContract(input: {
	frozen: FrozenRunContract;
	constitution: ConstitutionBundle;
	stage: string;
	ticketKey?: string;
	proposal?: FrozenRunContract;
}): ContractCheckResult {
	if (input.frozen.constitutionHash !== input.constitution.hash) {
		return {
			ok: false,
			reason:
				"the frozen run contract was hashed against a different constitution; re-approve the plan",
		};
	}
	const expected = sha256Canonical(omitHash(input.frozen));
	if (expected !== input.frozen.contractHash) {
		return { ok: false, reason: "run contract hash does not match its body" };
	}
	const stage = input.constitution.document.stages[input.stage];
	if (!stage) {
		return { ok: false, reason: `unknown stage '${input.stage}'` };
	}
	for (const write of stage.writes) {
		if (
			(HumanOwnedAction.options as string[]).includes(write) ||
			input.constitution.document.humanOwned.includes(write as HumanOwnedAction)
		) {
			return {
				ok: false,
				reason: `stage '${input.stage}' is not allowed to perform '${write}'`,
			};
		}
		if (!input.frozen.permittedWrites.includes(write)) {
			return {
				ok: false,
				reason: `stage '${input.stage}' write '${write}' is outside the frozen run contract`,
			};
		}
	}
	for (const owned of input.constitution.document.humanOwned) {
		if (!input.frozen.humanOwned.includes(owned)) {
			return {
				ok: false,
				reason: `run contract omitted human-owned action '${owned}'`,
			};
		}
	}
	if (TICKET_SCOPED_STAGES.has(input.stage) && !input.ticketKey) {
		return {
			ok: false,
			reason: `stage '${input.stage}' requires a ticket key`,
		};
	}
	if (input.ticketKey) {
		const known = input.frozen.tickets.some(
			(ticket) => ticket.key === input.ticketKey,
		);
		if (!known) {
			return {
				ok: false,
				reason: `ticket ${input.ticketKey} is outside the frozen run contract`,
			};
		}
	}
	if (input.proposal) {
		return checkProposal(input.frozen, input.proposal, input.constitution.hash);
	}
	return { ok: true };
}

function omitHash(
	frozen: FrozenRunContract,
): Omit<FrozenRunContract, "contractHash"> {
	const { contractHash: _contractHash, ...body } = frozen;
	return body;
}

function checkProposal(
	frozen: FrozenRunContract,
	proposal: FrozenRunContract,
	liveHash: string,
): ContractCheckResult {
	let current: FrozenRunContract;
	let proposed: FrozenRunContract;
	try {
		current = parseFrozenRunContract(frozen);
		proposed = parseFrozenRunContract(proposal);
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	if (proposed.constitutionHash !== liveHash) {
		return {
			ok: false,
			reason:
				"proposed run contract is hashed against a different constitution",
		};
	}
	if (proposed.contractHash === current.contractHash) {
		return { ok: true };
	}
	if (proposed.planVersion <= current.planVersion) {
		return {
			ok: false,
			reason: "a scope change needs a new plan version",
		};
	}
	if (proposed.supersedesHash !== current.contractHash) {
		return {
			ok: false,
			reason: "a new plan version must supersede the current contract hash",
		};
	}
	if (!proposed.reason || !proposed.affectedInvariant) {
		return {
			ok: false,
			reason: "a scope change needs a recorded reason and affected invariant",
		};
	}
	if (!proposed.approval.words.trim()) {
		return {
			ok: false,
			reason: "a scope change needs a new explicit approval",
		};
	}
	if (proposed.approval.at === current.approval.at) {
		return {
			ok: false,
			reason: "a scope change needs a new explicit approval",
		};
	}
	return { ok: true };
}

export function constitutionPreflight(
	factoryRoot = defaultFactoryRoot(),
): ConformanceCheck[] {
	try {
		const live = loadConstitution(factoryRoot);
		return [
			{
				id: "constitution",
				ok: true,
				required: true,
				detail: `${live.document.id} v${live.document.version} ${live.hash}`,
			},
		];
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return [
			{
				id: "constitution",
				ok: false,
				required: true,
				detail,
			},
		];
	}
}

export function buildConformanceReport(input: {
	frozen: FrozenRunContract;
	constitution: ConstitutionBundle;
	stage: string;
	results: Array<{ id: string; ok: boolean; detail?: string }>;
	ticketKey?: string;
}): ConformanceReport {
	const contract = checkRunContract({
		frozen: input.frozen,
		constitution: input.constitution,
		stage: input.stage,
		ticketKey: input.ticketKey,
	});
	const checks: ConformanceCheck[] = [
		{
			id: "run-contract",
			ok: contract.ok,
			required: true,
			detail: contract.ok ? "frozen contract holds" : (contract.reason ?? ""),
		},
		{
			id: "prose-cannot-override-gate",
			ok: !input.results.some((result) => result.id === "gate" && !result.ok),
			required: true,
			detail: "a failed deterministic gate stops the stage",
		},
		...input.results.map((result) => ({
			id: result.id,
			ok: result.ok,
			required: true,
			detail: result.detail ?? "",
		})),
	];
	return {
		version: 1,
		stage: input.stage,
		constitutionHash: input.constitution.hash,
		contractHash: input.frozen.contractHash,
		allRequiredPassed: checks.every((check) => check.ok || !check.required),
		checks,
	};
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
	return parseJson(await Bun.file(path).text(), label);
}

async function main(argv: string[]): Promise<number> {
	const command = argv[0];
	if (command === "preflight" || command === "hash") {
		const live = loadConstitution();
		if (command === "hash") {
			console.log(live.hash);
			return 0;
		}
		const checks = constitutionPreflight();
		for (const check of checks) {
			const mark = check.ok ? "✓" : check.required ? "✗" : "•";
			console.log(
				`${mark} ${check.id}${check.detail ? ` — ${check.detail}` : ""}`,
			);
		}
		return checks.every((check) => check.ok || !check.required) ? 0 : 1;
	}
	if (command === "freeze") {
		const path = argv[1];
		if (!path) {
			console.error(`usage: ${CONSTITUTION_FREEZE_INVOCATION}`);
			return 2;
		}
		const frozen = freezeAgainstLiveConstitution(
			await readJsonFile(path, path),
		);
		process.stdout.write(`${JSON.stringify(frozen, null, "\t")}\n`);
		return 0;
	}
	if (command === "check") {
		const path = argv[1];
		const stage = argv[2];
		const ticket = argv[3];
		if (!path || !stage) {
			console.error(`usage: ${CONSTITUTION_CHECK_INVOCATION}`);
			return 2;
		}
		const live = loadConstitution();
		const frozen = parseFrozenRunContract(await readJsonFile(path, path));
		const result = checkRunContract({
			frozen,
			constitution: live,
			stage,
			ticketKey: ticket,
		});
		console.log(JSON.stringify(result));
		return result.ok ? 0 : 1;
	}
	if (command === "supersede") {
		const currentPath = argv[1];
		const proposalPath = argv[2];
		if (!currentPath || !proposalPath) {
			console.error(`usage: ${CONSTITUTION_SUPERSEDE_INVOCATION}`);
			return 2;
		}
		const live = loadConstitution();
		const current = parseFrozenRunContract(
			await readJsonFile(currentPath, currentPath),
		);
		const proposal = parseFrozenRunContract(
			await readJsonFile(proposalPath, proposalPath),
		);
		const result = checkProposal(current, proposal, live.hash);
		console.log(JSON.stringify(result));
		return result.ok ? 0 : 1;
	}
	if (command === "report") {
		const path = argv[1];
		const stage = argv[2];
		const resultsPath = argv[3];
		const ticketKey = argv[4];
		if (!path || !stage || !resultsPath) {
			console.error(`usage: ${CONSTITUTION_REPORT_INVOCATION}`);
			return 2;
		}
		const live = loadConstitution();
		const frozen = parseFrozenRunContract(await readJsonFile(path, path));
		const resultsRaw = await readJsonFile(resultsPath, resultsPath);
		const results = z
			.array(
				z.object({
					id: z.string().min(1),
					ok: z.boolean(),
					detail: z.string().optional(),
				}),
			)
			.parse(resultsRaw);
		const report = buildConformanceReport({
			frozen,
			constitution: live,
			stage,
			results,
			ticketKey,
		});
		process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
		return report.allRequiredPassed ? 0 : 1;
	}
	console.error(
		"usage: sdlc-constitution.ts preflight|hash|freeze|check|supersede|report ...",
	);
	return 2;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
