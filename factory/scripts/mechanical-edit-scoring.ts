import { scoreCandidate } from "./evaluation-corpus";
import type { CorpusEntry } from "./evaluation-corpus";
import {
	fastCatalogueCandidateIds,
	loadModelCatalogue,
} from "./model-catalogue";
import { buildObservation } from "./record-routing";
import type { RoutingObservation } from "./routing-observation";
import type { TaskProfileInput } from "./task-profile";

export {
	fastCatalogueCandidateIds,
	requireFastCatalogueCandidate,
} from "./model-catalogue";

export interface UnscriptedMechanicalFixture {
	id: string;
	reason: string;
	files: Record<string, string>;
	payload: {
		operation: "rename" | "import-only" | "format-only";
		from?: string;
		to?: string;
		files: string[];
		reversible: true;
		classificationComplete: true;
		surfaces: string[];
		verification: "strong";
	};
}

const unit = {
	reversible: true as const,
	classificationComplete: true as const,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

export function unscriptedMechanicalFixtures(): UnscriptedMechanicalFixture[] {
	return [
		{
			id: "java-method-overload",
			reason: "Java method overloads are not a proven scripted rename",
			files: {
				"src/Host.java":
					"public class Host {\n  String slugifyTitle(String value) { return value; }\n  String slugifyTitle(int value) { return String.valueOf(value); }\n}\n",
			},
			payload: {
				...unit,
				operation: "rename",
				from: "slugifyTitle",
				to: "slugify",
				files: ["src/Host.java"],
			},
		},
		{
			id: "python-incomplete-graph",
			reason:
				"Python rename graphs that omit a referencing file stay unscripted",
			files: {
				"src/a.py": "def slugify_title():\n    return 'x'\n",
				"src/b.py": "from a import slugify_title\nslugify_title()\n",
			},
			payload: {
				...unit,
				operation: "rename",
				from: "slugify_title",
				to: "slugify",
				files: ["src/a.py"],
			},
		},
		{
			id: "typescript-ambiguous-symbol",
			reason: "Ambiguous TypeScript symbols stay on the current worker",
			files: {
				"src/a.ts":
					'export function slugifyTitle(): string { return "a"; }\nexport const other = { slugifyTitle(): string { return "b"; } };\n',
				"src/b.ts": 'import { slugifyTitle } from "./a";\nslugifyTitle();\n',
			},
			payload: {
				...unit,
				operation: "rename",
				from: "slugifyTitle",
				to: "slugify",
				files: ["src/a.ts", "src/b.ts"],
			},
		},
		{
			id: "unsupported-language",
			reason: "Languages without a proven script stay on the current worker",
			files: {
				"src/a.rb": "def slugify_title\n  1\nend\n",
			},
			payload: {
				...unit,
				operation: "rename",
				from: "slugify_title",
				to: "slugify",
				files: ["src/a.rb"],
			},
		},
		{
			id: "mixed-languages",
			reason: "A unit that lists more than one language stays unscripted",
			files: {
				"src/a.ts": "export function slugifyTitle(): string { return 'x'; }\n",
				"src/a.py": "def slugify_title():\n    return 'x'\n",
			},
			payload: {
				...unit,
				operation: "rename",
				from: "slugifyTitle",
				to: "slugify",
				files: ["src/a.ts", "src/a.py"],
			},
		},
		{
			id: "python-star-import",
			reason: "Python star imports cannot be proven unused",
			files: {
				"src/a.py": "from os.path import *\nvalue = join('a', 'b')\n",
			},
			payload: {
				...unit,
				operation: "import-only",
				files: ["src/a.py"],
			},
		},
	];
}

function profileFor(fixture: UnscriptedMechanicalFixture): TaskProfileInput {
	return {
		version: 1,
		taskId: fixture.id,
		stage: "execute",
		workType: "mechanical-edit",
		reasoningDepth: "low",
		ambiguity: "low",
		blastRadius: "local",
		risk: "reversible",
		novelty: "known-pattern",
		verificationStrength: "strong",
		contextSize: "small",
		domains: ["user-interface"],
		reason: [fixture.reason],
		promotionTriggers: [],
	};
}

export function representativeUnscriptedMechanicalObservations(
	source: RoutingObservation["source"] = "representative-run",
): RoutingObservation[] {
	return unscriptedMechanicalFixtures().map((fixture, index) =>
		buildObservation({
			runId: `run-unscripted-mechanical-${fixture.id}`,
			source,
			recordedAt: `2026-10-26T18:${String(index).padStart(2, "0")}:00.000Z`,
			currentModel: "sonnet",
			profile: profileFor(fixture),
			outcome: {
				gates: [{ name: "green", passed: true, attempt: 1 }],
				gatesPassed: true,
				repairs: 0,
				escalations: 0,
				terminal: "continue",
			},
			usage: { source: "unavailable" },
		}),
	);
}

export function scoreUnscriptedMechanicalPack(input: {
	candidateModel: string;
	relativeUtility: number;
	criticalMisses?: number;
	source?: RoutingObservation["source"];
}): CorpusEntry[] {
	return representativeUnscriptedMechanicalObservations(
		input.source ?? "representative-run",
	).map((observation) =>
		scoreCandidate(observation, {
			candidateModel: input.candidateModel,
			relativeUtility: input.relativeUtility,
			criticalMisses: input.criticalMisses ?? 0,
		}),
	);
}

if (import.meta.main) {
	console.log(
		JSON.stringify({
			fastCandidates: fastCatalogueCandidateIds(await loadModelCatalogue()),
			fixtures: unscriptedMechanicalFixtures().map((fixture) => fixture.id),
			observations: representativeUnscriptedMechanicalObservations().length,
		}),
	);
}
