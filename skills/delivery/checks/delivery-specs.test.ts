import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

setDefaultTimeout(60_000);

const ROOT = process.env.DELIVERY_SKILL_ROOT ?? join(import.meta.dir, "..");
const SKILLS_ROOT = process.env.DELIVERY_SKILLS_ROOT ?? join(import.meta.dir, "..", "..");
function defaultMaxParallelWorktrees(): number {
	const candidates = [
		join(SKILLS_ROOT, "..", "factory", "scripts", "config.ts"),
		join(SKILLS_ROOT, "_factory", "scripts", "config.ts"),
	];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		const match = readFileSync(path, "utf8").match(
			/export const DEFAULT_MAX_PARALLEL_WORKTREES = (\d+);/,
		);
		if (match?.[1]) return Number(match[1]);
	}
	throw new Error("DEFAULT_MAX_PARALLEL_WORKTREES not found");
}
const DEFAULT_MAX_PARALLEL_WORKTREES = defaultMaxParallelWorktrees();
const HISTORICAL_INDEPENDENCE = process.env.DELIVERY_HISTORICAL_INDEPENDENCE === "1";
const SKILL_PATH = existsSync(join(ROOT, "SKILL.md")) ? join(ROOT, "SKILL.md") : join(ROOT, "delivery-SKILL.proposed.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");
const WORKFLOWS = join(ROOT, "workflows");
const LEDGER = readFileSync(join(WORKFLOWS, "delivery-ledger.md"), "utf8");
const AUTO = readFileSync(join(WORKFLOWS, "auto.md"), "utf8");
const CODE_REVIEW_MAX = readFileSync(join(SKILLS_ROOT, "code-review-max", "SKILL.md"), "utf8");
const MR_REVIEW = readFileSync(join(SKILLS_ROOT, "mr-review", "SKILL.md"), "utf8");
const ADDRESS_COMMENTS = readFileSync(join(SKILLS_ROOT, "address-comments", "SKILL.md"), "utf8");
const EXECUTE = readFileSync(join(SKILLS_ROOT, "execute", "SKILL.md"), "utf8");
const FORGE_PROVIDER = 'bun "${FACTORY_ROOT}/scripts/forge-provider.ts"';
const PROVIDER_NATIVE = /\b(?:gl-mr|gl-note|glab)\b/;
const SPECS = Object.fromEntries(
  readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => [f, readFileSync(join(WORKFLOWS, f), "utf8")]),
);
const HISTORICAL_FILES = new Set(["NOTES.md", "delivery-orchestrator.md"]);
const LEGACY_SECTION_EXEMPT = new Set([
	"delivery-orchestrator.md",
	"epic-to-backlog.md",
	"ticket-to-mr.md",
	"mr-review-to-ready.md",
]);

function section(doc: string, heading: string): string {
  const lines = doc.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const body: string[] = [];
  let fenced = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("```")) fenced = !fenced;
    const depth = line.match(/^(#+) /)?.[1].length;
    if (!fenced && depth !== undefined && depth <= level) break;
    body.push(line);
  }
  return body.join("\n");
}

function cells(line: string): string[] {
  return line
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

type Route = { patterns: RegExp[]; entry: string };

function entryTable(): Route[] {
  const table = section(SKILL, "## Phase 0 — Entry detection");
  const routes: Route[] = [];
  for (const line of table.split("\n")) {
    if (!line.startsWith("| `^")) continue;
    const row = cells(line);
    const patterns = [...row[1].matchAll(/`(\^[^`]+)`/g)].map((m) => new RegExp(m[1]));
    routes.push({ patterns, entry: row[2] });
  }
  return routes;
}

function classify(arg: string): string {
  const trimmed = arg.trim();
  if (trimmed === "") return "Help";
  for (const r of entryTable()) {
    if (r.patterns.some((p) => p.test(trimmed))) return r.entry;
  }
  return "Full epic";
}

describe("entry detection", () => {
  const cases: [string, string][] = [
    ["MDF-1234", "Resume"],
    ["SMAI-740", "Resume"],
    ["740", "Review only"],
    ["740 MDF-12", "Review only with work-item key"],
    ["MDF-12 740", "Review only with work-item key"],
    ["discover a cost dashboard for job runs", "Discovery"],
    ["discover discover-2026-10-13-cost-dashboard", "Discovery"],
    ["triage MDF-2100", "Bug intake"],
    ["ship 740", "Release readiness"],
    ["verify 740", "Post-merge verify"],
    ["retro MDF-2000", "Retro (work item or group)"],
    ["improve", "Improvement"],
    ["improve MDF-2000", "Improvement"],
    ["improve all", "Improvement"],
    ["improve status", "Improvement"],
    ["improve apply improve-20261015-missing-rollback", "Improvement decision"],
    ["improve reject improve-20261015-missing-rollback", "Improvement decision"],
    ["improve rollback 20261015-abc123", "Improvement decision"],
    ["status", "Catch-up"],
    ["status MDF-2000", "Catch-up"],
    ["  MDF-1234  ", "Resume"],
    ["Add per-job cost limits to the factory", "Full epic"],
    ["status of the cost work", "Full epic"],
    ["docs/stories/F5-4-port-igspec-gates.md", "Full epic"],
    ["", "Help"],
    ["help", "Help"],
    ["doctor", "Doctor"],
    ["init", "Initialize"],
    ["auto", "Auto"],
    ["auto Add a spend-by-repository panel to the costs page", "Auto"],
    ["auto MDF-2000", "Auto"],
    ["auto 740", "Auto"],
    ["automate the cost alerts", "Full epic"],
    ["auto-scaling for job runners", "Full epic"],
    ["groom Add a spend-by-repository panel to the costs page", "Groom"],
    ["groom docs/stories/F5-4-port-igspec-gates.md", "Groom"],
    ["draft MDF-2101", "Draft"],
    ["draft #123", "Draft"],
    ["draft owner/repo#123", "Draft"],
    ["draft a plan for the costs page", "Full epic"],
    ["execute MDF-2101", "Execute"],
    ["execute LOCAL-1", "Execute"],
    ["build MDF-2101", "Execute"],
    ["build a costs panel", "Full epic"],
    ["review 740", "Review"],
    ["review 740 MDF-2101", "Review"],
    ["review the costs page design", "Full epic"],
    ["address MDF-2101", "Address comments"],
    ["archive MDF-2101", "Archive"],
    ["archive mdf-2063-decide-whether-a-suspected-bug-marker", "Archive"],
  ];
  for (const [arg, expected] of cases) {
    test(`${JSON.stringify(arg)} routes to ${expected}`, () => {
      expect(classify(arg)).toBe(expected);
    });
  }

  test("every verb row is listed before the bare key and bare iid rows", () => {
    const entries = entryTable().map((r) => r.entry);
    const bare = Math.min(entries.indexOf("Resume"), entries.indexOf("Review only"));
    const verbs = entries.slice(0, bare);
    expect(verbs).toContain("Auto");
    expect(verbs).toContain("Archive");
    expect(entries.slice(bare).every((e) => e.startsWith("Resume") || e.startsWith("Review only"))).toBe(true);
  });
});

describe("one command to remember", () => {
  const cheatSheet = section(SKILL, "## Command cheat-sheet");

  test("the cheat-sheet names only /delivery commands", () => {
    const commands = [...cheatSheet.matchAll(/^\/[\w:-]+/gm)].map((m) => m[0]);
    expect(commands.length).toBeGreaterThan(10);
    expect(commands.filter((c) => c !== "/delivery")).toEqual([]);
  });

  test("every verb in the entry table is on the cheat-sheet", () => {
    const verbs = entryTable()
      .flatMap((r) => r.patterns.map((p) => p.source.match(/^\^\(?([a-z|]+)/)?.[1]))
      .filter((v): v is string => Boolean(v))
      .flatMap((v) => v.split("|"));
    const missing = verbs.filter((v) => v !== "build" && !cheatSheet.includes(`/delivery ${v}`));
    expect(missing).toEqual([]);
  });

  const wrapped = [
    "/groom",
    "/draft",
    "/execute",
    "/code-review-max !<iid>",
    "/mr-review <iid>",
    "/address-comments",
    "/openspec-archive",
  ];
  for (const command of wrapped) {
    test(`the skill still invokes ${command} itself`, () => {
      expect(section(SKILL, "### Single steps")).toContain(command);
    });
  }
});

describe("source of truth", () => {
  test("workflow specs are bundled and have no personal fallback", () => {
    expect(section(SKILL, "## Source of truth")).toContain("no machine-specific fallbacks");
    expect(SKILL).not.toContain("/Users/");
    for (const [name, doc] of Object.entries(SPECS)) {
      if (HISTORICAL_FILES.has(name)) continue;
      expect([name, doc.includes("/Users/") || doc.includes("delivery-runs")]).toEqual([name, false]);
    }
  });

  test("the ledger lives in target-repo state with compare-and-swap", () => {
    expect(section(SKILL, "## Source of truth")).toContain("`.delivery/`");
    expect(section(SKILL, "## Source of truth")).toContain("routing/");
    expect(LEDGER).toContain("<target repo>/.delivery/runs/");
    expect(LEDGER).toContain("compare-and-swap");
  });

  test("the skill keeps its frontmatter", () => {
    expect(SKILL.startsWith("---\nname: delivery\n")).toBe(true);
    expect(SKILL).not.toContain("disable-model-invocation");
    expect(SKILL).not.toContain("argument-hint");
    expect(SKILL).not.toContain("$ARGUMENTS");
  });
});

describe("workflow authority", () => {
  test("Source of truth names live files and marks historical files non-actionable", () => {
    const src = section(SKILL, "## Source of truth");
    expect(src).toContain("no machine-specific fallbacks");
    expect(src).toContain("`.delivery/`");
    expect(src).toContain("routing/");
    expect(src).toContain("`workflows/auto.md`");
    expect(src).toContain("`workflows/delivery-ledger.md`");
    expect(src).toContain("`workflows/NOTES.md`");
    expect(src).toContain("`workflows/delivery-orchestrator.md`");
    expect(src).toMatch(/non-actionable/i);
    expect(src).toMatch(/cannot override/i);
    expect(src).toMatch(/conductor/i);
    expect(src).toMatch(/next-step table|auto\.md/i);
    expect(src).toMatch(/stage specs/i);
    expect(src).toContain("SDLC-CONSTITUTION.md");
    expect(src).toContain("sdlc-constitution.json");
    expect(src).toMatch(/policy kernel/i);
    expect(src).toMatch(/it wins/i);
  });

  test("historical files carry the non-actionable marker and make no source-of-truth claim", () => {
    if (HISTORICAL_INDEPENDENCE) return;
    for (const name of HISTORICAL_FILES) {
      const doc = SPECS[name];
      const head = doc.split("\n").slice(0, 8).join("\n");
      expect([name, /non-actionable/i.test(head)]).toEqual([name, true]);
      expect(head).toContain("SKILL.md");
      expect(head).toMatch(/cannot override/i);
      expect([name, /are source of truth/i.test(doc)]).toEqual([name, false]);
      expect(doc).not.toMatch(/Source of truth for stage behavior remains/i);
      expect(doc).not.toContain("Factory opens ready MRs");
      expect(doc).not.toMatch(/Runtime host: Claude Code/);
      expect(doc).not.toContain("Three stage workflows are source of truth");
    }
  });

  test("live files do not defer to historical files for a rule", () => {
    const live: [string, string][] = [
      ["SKILL.md", SKILL],
      ...Object.entries(SPECS).filter(([name]) => !HISTORICAL_FILES.has(name)),
    ];
    for (const [name, doc] of live) {
      expect([name, /Three stage workflows are source of truth/.test(doc)]).toEqual([name, false]);
      expect(doc).not.toMatch(/Source of truth for stage behavior remains the three stage files/i);
      for (const hist of HISTORICAL_FILES) {
        const escaped = hist.replace(".", "\\.");
        const defer = new RegExp(
          `(?:follow|load|run|obey|source of truth)[^.\n]{0,80}${escaped}|${escaped}[^.\n]{0,80}(?:source of truth|is actionable)`,
          "i",
        );
        expect([name, hist, defer.test(doc)]).toEqual([name, hist, false]);
      }
    }
  });
});

describe("human decision context", () => {
  const brief = section(SKILL, "## Human decision brief");

  test("the canonical brief supplies complete evidence and option context", () => {
    for (const field of [
      "## Decision:",
      "**Why now:**",
      "### Evidence and constraints",
      "Known:",
      "Constraint:",
      "Assumption:",
      "Unknown:",
      "### Option A:",
      "**How it works:**",
      "**Pros:**",
      "**Cons:**",
      "**Risks and consequences:**",
      "### Comparison and recommendation",
      "**Recommendation:**",
      "**Would change if:**",
      "**Reversibility:**",
      "**If we wait:**",
      "**Choose:**",
    ]) {
      expect([field, brief.includes(field)]).toEqual([field, true]);
    }
    expect(brief).toMatch(/two or more viable options/i);
    expect(brief).toMatch(/recommendation is\s+weak/i);
    expect(brief).toMatch(/Ask exactly one final question/i);
  });

  test("the brief applies only to real choices and preserves hard gates", () => {
    expect(brief).toMatch(/Do not manufacture a choice/i);
    for (const excluded of [
      "factual question",
      "missing identifier",
      "deterministic gate result",
      "one viable path",
      "simple confirmation",
    ]) {
      expect([excluded, brief.includes(excluded)]).toEqual([excluded, true]);
    }
    expect(brief).toMatch(/failed gate never\s+becomes an option/i);
    expect(brief).toMatch(/does not take.*decision|does not.*weaken.*approval/is);
  });

  test("DSA and system-design lenses teach only material differences", () => {
    expect(brief).toContain("### DSA lens");
    expect(brief).toMatch(/data structures/i);
    expect(brief).toMatch(/time\/space complexity/i);
    expect(brief).toMatch(/concurrency/i);
    expect(brief).toContain("No material DSA difference");
    expect(brief).toMatch(/Never invent Big-O claims/i);
    expect(brief).toContain("### System-design lens");
    for (const concern of [
      "boundaries",
      "state ownership",
      "consistency",
      "scaling",
      "reliability",
      "recovery",
      "security",
      "operability",
    ]) {
      expect([concern, brief.includes(concern)]).toEqual([concern, true]);
    }
    expect(brief).toContain("No material system-design");
  });

  test("analysis depth scales from local reversible to consequential choices", () => {
    expect(brief).toMatch(/local, cheap, reversible choice\s+short/i);
    expect(brief).toMatch(
      /public contract.*persistent data.*security boundary.*distributed state.*cross-system.*operational topology/s,
    );
    expect(brief).toMatch(/plain language/i);
    expect(brief).toMatch(/practical consequence/i);
  });

  test("every live workflow that can ask a multi-option question invokes the brief", () => {
    const governed = [
      "discovery.md",
      "epic-to-backlog.md",
      "auto.md",
      "intake.md",
      "mr-review-to-ready.md",
      "release-readiness.md",
      "post-merge-verify.md",
      "improve.md",
    ];
    for (const name of governed) {
      expect([
        name,
        /Human\s+decision\s+brief/i.test(SPECS[name]),
      ]).toEqual([name, true]);
    }
  });
});

const CONTRADICTED_NOTES = `# NOTES — contradicted historical file

Three stage workflows are source of truth.
Factory opens ready MRs.
Runtime host: Claude Code.
Tickets may consume ~50% of a session context.
Invalid ledger tag: \`[ready bogus]\`.
`;

const CONTRADICTED_ORCHESTRATOR = `# Workflow: delivery-orchestrator

Source of truth for stage behavior remains the three stage files; if they
disagree with this conductor, fix this file.
Invalid ledger tag: \`[stopped:contradicted]\`.
`;

if (!HISTORICAL_INDEPENDENCE) {
  describe("live contracts independent of historical wording", () => {
    test("the suite passes when historical files contradict live rules", async () => {
      const dest = mkdtempSync(join(tmpdir(), "delivery-authority-"));
      try {
        const packRoot = join(import.meta.dir, "..", "..", "..");
        for (const name of ["README.md", "install.sh", "NOTICE.md"]) {
          cpSync(join(packRoot, name), join(dest, name));
        }
        cpSync(join(packRoot, "skills"), join(dest, "skills"), { recursive: true });
        cpSync(join(packRoot, "factory"), join(dest, "factory"), { recursive: true });
        cpSync(join(packRoot, "adapters"), join(dest, "adapters"), { recursive: true });
        writeFileSync(join(dest, "skills", "delivery", "workflows", "NOTES.md"), CONTRADICTED_NOTES);
        writeFileSync(
          join(dest, "skills", "delivery", "workflows", "delivery-orchestrator.md"),
          CONTRADICTED_ORCHESTRATOR,
        );
        const proc = Bun.spawn(
          [process.execPath, "test", join(import.meta.dir, "delivery-specs.test.ts")],
          {
            cwd: packRoot,
            env: {
              ...process.env,
              DELIVERY_SKILL_ROOT: join(dest, "skills", "delivery"),
              DELIVERY_SKILLS_ROOT: join(dest, "skills"),
              DELIVERY_HISTORICAL_INDEPENDENCE: "1",
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
            },
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      } finally {
        rmSync(dest, { recursive: true, force: true });
      }
    });
  });
}

describe("durable ledger writer", () => {
  const STORE = readFileSync(
    join(SKILLS_ROOT, "..", "factory", "scripts", "ledger-store.ts"),
    "utf8",
  );

  function invocation(name: string): string {
    const match = STORE.match(
      new RegExp(`export const ${name} = "([^"]+)"`),
    );
    expect(match?.[1]).toBeTruthy();
    return match?.[1] ?? "";
  }

  test("workflows name the writer and recovery commands from the store, and call a conflict a terminal stop", () => {
    const writeCommand = invocation("LEDGER_WRITE_INVOCATION");
    const recoverCommand = invocation("LEDGER_RECOVER_INVOCATION");
    expect(writeCommand).toContain("ledger-store.ts");
    expect(recoverCommand).toContain("ledger-store.ts recover");
    for (const [name, doc] of [
      ["delivery-ledger.md", LEDGER],
      ["SKILL.md", SKILL],
    ] as const) {
      expect([name, doc.includes(writeCommand)]).toEqual([name, true]);
      expect([name, doc.includes(recoverCommand)]).toEqual([name, true]);
    }
    expect(LEDGER.toLowerCase()).toContain("concurrency conflict");
    expect(LEDGER).toMatch(/terminal stop/i);
    expect(SKILL.toLowerCase()).toContain("concurrency conflict");
    expect(SKILL).toMatch(/terminal stop/i);
  });
});

function normaliseTag(tag: string): string {
  return tag
    .replace(/!(N|<iid>|\d+)/g, "!N")
    .replace(/<[^>]+>|MDF-\d+/g, "<x>")
    .replace(/\s+/g, " ");
}

const STATUS_TAG = /`(\[(?:discovering|triage|groomed|drafted|executing|addressed|ready|go|no-go|merged|verified|regressed|retro|stopped|waiting)[^`]*\])`/g;

const vocabulary = new Set(
  [...section(LEDGER, "## Status tags").matchAll(/^\| `(\[[^`]+\])` \|/gm)].map((m) => normaliseTag(m[1])),
);

describe("ledger vocabulary", () => {
  test("the ledger defines status tags", () => {
    expect(vocabulary.size).toBeGreaterThan(10);
  });

  const docs: [string, string][] = [["SKILL.md", SKILL], ...Object.entries(SPECS).filter(([name]) => !HISTORICAL_FILES.has(name))];
  for (const [name, doc] of docs) {
    test(`${name} uses only ledger status tags`, () => {
      const used = [...doc.matchAll(STATUS_TAG)].map((m) => normaliseTag(m[1]));
      expect(used.filter((t) => !vocabulary.has(t))).toEqual([]);
    });
  }

  test("every verdict kind a spec writes is defined with its values", () => {
    const kinds = section(LEDGER, "## Verdict kinds");
    const defined = new Map(
      [...kinds.matchAll(/^\| `(\w+)` \| [^|]+ \| ([^|]+) \|/gm)].map((m) => [m[1], [...m[2].matchAll(/`([\w-]+)`/g)].map((v) => v[1])]),
    );
    expect([...defined.keys()].sort()).toEqual(["readiness", "review", "verify"]);
    const writes: [string, string, string[]][] = [
      ["release-readiness.md", "readiness", ["GO", "NO-GO"]],
      ["post-merge-verify.md", "verify", ["Verified", "Regressed", "Inconclusive"]],
    ];
    for (const [spec, kind, values] of writes) {
      expect(SPECS[spec]).toContain(`\`${kind}\` row`);
      for (const v of values) {
        expect(defined.get(kind)).toContain(v.toLowerCase());
      }
    }
    expect(SKILL).toContain("`review` verdict row");
  });
});

describe("auto", () => {
  const table = section(AUTO, "### Next step by status");
  const rows = table.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Status") && !l.startsWith("|---"));
  const tagsWithANextStep = rows.map((l) => cells(l)[1]).filter((c) => c.startsWith("`[")).map((c) => normaliseTag(c.slice(1, -1)));

  test("every status tag the ledger defines has a next step", () => {
    expect([...vocabulary].filter((t) => !tagsWithANextStep.includes(t))).toEqual([]);
  });

  test("every next-step row is a ledger status, or the run before a ledger exists", () => {
    const others = rows.map((l) => cells(l)[1]).filter((c) => !c.startsWith("`["));
    expect(others).toEqual(["no ledger yet"]);
    expect(tagsWithANextStep.filter((t) => !vocabulary.has(t))).toEqual([]);
  });

  test("continuous delivery asks for merge but not routine post-merge progression", () => {
    const asks = (tag: string) => cells(rows.find((l) => l.startsWith(`| \`${tag}\``)) ?? "")[3];
    expect(asks("[go !N]")).toBe("The merge");
    expect(asks("[merged !N]")).toBe("Nothing");
  });

  test("one plan approval authorizes routine stages but not human-owned decisions", () => {
    const start = section(AUTO, "## Start");
    const whenToAsk = section(AUTO, "## When to ask");
    expect(start).toContain("`continuous-delivery: yes`");
    expect(start).not.toContain("build-without-asking");
    for (const routine of [
      "test-seam",
      "review-publication",
      "archive",
      "retro",
      "improvement-preparation",
    ]) {
      expect(start).toContain(routine);
    }
    for (const human of ["merge", "risk", "Installing"]) {
      expect(whenToAsk).toMatch(new RegExp(human, "i"));
    }
  });

  test("ready waves dispatch concurrently in isolated worktrees", () => {
    const choosing = section(AUTO, "### Choosing a key");
    expect(choosing).toContain("maxParallelWorktrees");
    expect(choosing).toContain("MAX_PARALLEL_WORKTREES");
    expect(choosing).toContain('scripts/config.ts" ready-wave');
    expect(choosing).toContain(`default ${DEFAULT_MAX_PARALLEL_WORKTREES}`);
    expect(SKILL).toContain("maxParallelWorktrees");
    expect(SKILL).toMatch(
      new RegExp(`scripts/config.ts[\\s\\S]*default\\s+${DEFAULT_MAX_PARALLEL_WORKTREES}`),
    );
    expect(choosing).toContain("one detached git worktree per dispatched key");
    expect(choosing).toContain("Start every worker in the current batch before awaiting any one");
    expect(choosing).toContain("DELIVERY_WORKER_JOURNAL");
    expect(choosing).toContain("coordinator remains the only writer");
    expect(choosing).toMatch(/Do not silently run[\s\S]*sequentially/);
  });

  test("continuous groom materializes only approved verified stories", () => {
    const epic = SPECS["epic-to-backlog.md"];
    expect(epic).toMatch(
      /continuous mode[\s\S]*create exactly one work item[\s\S]*approved, verified draft/i,
    );
    expect(epic).toContain("run id and slice number");
    expect(epic).toMatch(/reuse that exact item if it exists/i);
    expect(epic).toMatch(/Never create an unapproved slice/i);
    expect(SKILL).toContain(
      "Create work items only from approved, verified groom drafts",
    );
  });

  test("a failed stage is never retried", () => {
    expect(cells(rows.find((l) => l.startsWith("| `[stopped:")) ?? "")[2]).toContain("Never retry");
    expect(section(AUTO, "## Waiting")).toContain("**Never retry a failed stage.**");
  });

  test("waiting ends the turn instead of polling", () => {
    const waiting = section(AUTO, "## Waiting");
    expect(waiting).toMatch(/For a person\*\*[^\n]*: do not poll/);
    expect(waiting).toContain("Do not sleep or poll in the same turn");
    expect(waiting).not.toMatch(/every 60 seconds|for up to\s+30 minutes/);
  });
});

describe("atomic ticket sizing", () => {
  test("groom and ticket delivery reserve most context for recovery", () => {
    for (const doc of [
      SKILL,
      SPECS["epic-to-backlog.md"],
      SPECS["ticket-to-mr.md"],
    ]) {
      expect(doc).toContain("~25%");
      expect(doc).not.toContain("~50%");
    }
  });

  test("oversized tickets stop at draft and return to vertical slicing", () => {
    expect(SPECS["ticket-to-mr.md"]).toContain("`SPLIT_REQUIRED`");
    expect(SPECS["ticket-to-mr.md"]).toContain("Human creates the smaller tickets");
    expect(SPECS["epic-to-backlog.md"]).toContain("one to three acceptance criteria");
    expect(SPECS["epic-to-backlog.md"]).toContain("vertically complete");
  });
});

describe("capabilities", () => {
  const rows = section(SKILL, "## Capabilities")
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Capability") && !l.startsWith("|---"))
    .map(cells);

  test("every capability the workflow depends on is checked", () => {
    expect(rows.map((r) => r[1])).toEqual(["Stage specs", "Factory", "Review commands", "Forge", "Work items", "Spec tool", "Deployed environment", "Skill evaluation"]);
  });

  test("every stage a capability blocks is a real /delivery verb", () => {
    const verbs = new Set(
      entryTable()
        .flatMap((r) => r.patterns.map((p) => p.source.match(/^\^\(?([a-z|]+)/)?.[1]))
        .filter((v): v is string => Boolean(v))
        .flatMap((v) => v.split("|")),
    );
    const named = rows.slice(1).flatMap((r) => r[3].split(",").map((v) => v.trim()));
    expect(named.filter((v) => !verbs.has(v))).toEqual([]);
  });

  test("every capability says how to fix it", () => {
    expect(rows.filter((r) => r[4].length < 10).map((r) => r[1])).toEqual([]);
  });

  test("auto checks only the current stage and again at the next stage", () => {
    const preconditions = section(SKILL, "## Phase 1 — Preconditions and ledger");
    expect(preconditions).toContain("`checkCapabilities`");
    expect(preconditions).toContain("check only");
    expect(preconditions).toContain("what that stage needs");
    expect(preconditions).toContain("check again when the next stage starts");
    expect(preconditions).not.toContain("all once");
    expect(AUTO).toContain("stage boundary");
    expect(AUTO).toContain("`checkCapabilities`");
    const workItems = rows.find((r) => r[1] === "Work items") ?? [];
    expect(workItems[2]).toContain("real work-item read");
    expect(workItems[2].toLowerCase()).toMatch(/no key|failed/);
  });

  test("the stamped max skill is required and a lightweight review never stands in", () => {
    const review = rows.find((r) => r[1] === "Review commands") ?? [];
    expect(review[2]).toContain("`/code-review-max` and `/mr-review` are available");
    expect(review[2]).toContain("A lightweight built-in review does not count");
  });

  test("a merged-results pipeline counts for the head it merged", () => {
    const readiness = SPECS["release-readiness.md"];
    expect(readiness).toContain("`current: true`");
    expect(readiness).toContain("merged-results revision checks");
    expect(readiness).toContain("older or unrelated evidence");
  });

  test("the readiness workflow states the fail-closed rule", () => {
    const readiness = SPECS["release-readiness.md"];
    const lenses = section(readiness, "### 3. Run the lenses");
    const decide = section(readiness, "### 6. Decide");
    const brief = section(readiness, "### 7. Write the brief");
    expect(lenses).not.toMatch(/proof of concept or it is downgraded/i);
    expect(lenses).toContain("Critical, High, Important,");
    expect(lenses).toMatch(/keeps its severity/);
    expect(lenses).toMatch(/marked unverified/);
    expect(decide).toMatch(/Critical and High/);
    expect(decide).toMatch(/unverified/);
    expect(decide).toContain("Only the operator");
    expect(decide).toContain("this iid at this head");
    expect(decide).toMatch(/Critical (?:or|and) High/);
    expect(brief).toMatch(/unverified/i);
    expect(brief).toMatch(/Risks accepted[\s\S]*head/i);
  });

  test("auto waits on the MR's own pipeline, not the branch's", () => {
    const waiting = section(AUTO, "## Waiting");
    expect(waiting).toMatch(/normalized `pipeline` from `forge-provider\.ts read`/);
    expect(waiting).toContain("not a branch pipeline");
    expect(waiting).toContain("`current: true`");
  });

  test("pipeline monitoring covers the open head and exact merged revision", () => {
    const monitoring = SPECS["pipeline-monitoring.md"];
    expect(monitoring).toContain("the open change pipeline at its exact head revision");
    expect(monitoring).toContain("the default-branch pipeline at the exact merged");
    expect(monitoring).toContain('"revision": "<merged revision>"');
    expect(monitoring).toContain("pipeline-route.ts");
    expect(monitoring).toMatch(/event subscription/i);
    expect(monitoring).toMatch(/Never sleep, loop, or repeatedly call status APIs/i);
    expect(monitoring).toMatch(/Only an attributable failure[\s\S]*inside the frozen run contract[\s\S]*maxFixAttempts/i);
    expect(monitoring).toMatch(/new draft change/i);
    expect(monitoring).toMatch(/never performs a human-owned action/i);
    expect(AUTO).toMatch(/exact `revisions\.merged`[\s\S]*normalized[\s\S]*`pipeline` operation/i);
    expect(SPECS["post-merge-verify.md"]).toContain("Default-branch pipeline passed");
  });

  test("a cloud run never opens a second merge request", () => {
    expect(section(SKILL, "## One merge request")).toContain("Never open a second one for the same change");
  });
});

describe("hard rules survive", () => {
  const rules = [
    "Never merge via the forge provider",
    "never transition work-item status",
    "Create work items only from approved, verified groom drafts",
    "Never substitute another review skill",
    "A lightweight built-in review is **out of this chain**",
    "Fail closed with the stage's failure modes",
    "The delivery skill changes only through `improve.md`",
    "`/openspec-archive` runs only after the product MR is merged",
  ];
  for (const rule of rules) {
    test(`the skill keeps: ${rule.split("\n")[0]}`, () => {
      expect(SKILL).toContain(rule);
    });
  }

  test("auto forbids what the conductor forbids", () => {
    const never = section(AUTO, "## Never");
    for (const phrase of ["Merge", "Create work items outside", "transition", "permission to merge", "Retry a failed stage", "Skip a correctness", "Install or rollback"]) {
      expect(never).toContain(phrase);
    }
  });

  for (const [name, doc] of Object.entries(SPECS)) {
    if (name === "delivery-ledger.md" || HISTORICAL_FILES.has(name) || LEGACY_SECTION_EXEMPT.has(name)) continue;
    test(`${basename(name)} has Never, Terminal stops, and Ledger writes sections`, () => {
      expect(doc).toContain("\n## Never\n");
      expect(doc).toContain("\n## Terminal stops\n");
      expect(doc).toContain("\n## Ledger writes\n");
    });
  }
});

describe("approval-gated self-improvement", () => {
  const improve = SPECS["improve.md"];
  const retro = SPECS["retro.md"];
  const STATE_ROOT = "<state root>";
  const CANDIDATES = `${STATE_ROOT}/candidates/`;
  const VERSIONS = `${STATE_ROOT}/versions/`;

  test("candidates and versions live under the state root", () => {
    expect(improve).toContain(CANDIDATES);
    expect(improve).toContain(VERSIONS);
    if (!HISTORICAL_INDEPENDENCE) {
      expect(SPECS["NOTES.md"]).toContain(CANDIDATES);
      expect(SPECS["NOTES.md"]).toContain(VERSIONS);
    }
    expect(section(SKILL, "## Source of truth")).toContain("`.delivery/`");
    expect(section(SKILL, "## Source of truth")).toContain(
      "never beside the installed skill",
    );
  });

  test("status reports leftover skill-local state and never installs it", () => {
    expect(improve).toContain(
      "reports each leftover with the state-root path it should be migrated to",
    );
    expect(improve).toContain("Detection is read-only");
    expect(improve).toContain("never eligible for apply or rollback");
  });

  test("preparation is isolated from the live skill", () => {
    expect(improve).toContain("Preparation never edits the live managed tree.");
    expect(improve).toContain("Make all edits only\nthere.");
    expect(improve).toContain("at least two independent delivery runs");
  });

  test("a candidate proves a new test against baseline and candidate", () => {
    expect(improve).toMatch(/At least one new\s+assertion must fail for the expected reason\./);
    expect(improve).toContain(`\`DELIVERY_SKILL_ROOT\` set to \`${CANDIDATES}<id>/skill/\``);
    expect(improve).toContain("run three fresh subagents\nin parallel");
    expect(improve).toContain("Reviewer agreement is not proof.");
  });

  test("candidate evaluation is paired, hidden, mutation-tested, and quality-gated", () => {
    const paired = section(improve, "### 3a. Paired benchmark");
    expect(paired).toMatch(
      /same\s+task fixture, exact model, environment, allowed context, tools, output contract/i,
    );
    expect(paired).toContain("managed skill tree is the only variable");
    expect(paired).toMatch(/hidden from both runs/i);
    expect(paired).toMatch(/safe mutation/i);
    for (const metric of [
      "input and output tokens",
      "capture-usage.ts",
      "cost",
      "wall time from the captured usage timer",
      "repair or retry count",
      "delivered code size",
    ]) {
      expect(paired).toContain(metric);
    }
    expect(paired).toContain("at least 90 percent of baseline");
    expect(paired).toContain("zero Critical misses");
    expect(paired).toMatch(/diagnostic evidence only/i);
    expect(paired).toContain(
      'bun "${FACTORY_ROOT}/scripts/paired-evaluation.ts"',
    );
    expect(paired).toContain(
      'bun "${FACTORY_ROOT}/scripts/generate-paired-evidence.ts"',
    );
    expect(paired).toContain("paired-plan.json");
    expect(paired).toMatch(/hashes every fixed input and both managed trees/i);
    expect(paired).toMatch(/reads usage from\s+`capture-usage.ts`/i);
    expect(paired).toMatch(/reads quality outcomes from the gate-result files/i);
    expect(paired).toMatch(/refuses missing wall time/i);
    expect(paired).toContain("paired-evidence.json");
    expect(paired).toContain("paired-result.json");
    expect(paired).toMatch(/Malformed or unpaired evidence exits non-zero/);
    expect(paired).toMatch(/do not calculate or override the decision in prose/i);
  });

  test("retro acceptance cannot install a candidate", () => {
    expect(retro).toMatch(
      /Accepting a proposal approves investigation, not a patch\s+and not installation\./,
    );
    expect(improve).toContain("Retro acceptance is not installation approval.");
    expect(AUTO).toMatch(/`\/delivery auto` never answers\s+that checkpoint\./);
  });

  test("apply is bound to an exact candidate and unchanged baseline", () => {
    expect(improve).toContain("`/delivery improve apply <candidate>` is approval for that candidate only.");
    expect(improve).toContain("must exactly equal the manifest's hash");
    expect(improve).toContain("restore the version immediately");
  });

  test("install and rollback both preserve a verified recovery copy", () => {
    expect(improve).toContain("Copy the complete live managed tree to a new immutable");
    expect(improve).toContain("Snapshot the current managed tree as another immutable version.");
    expect(improve).toContain("a new chat is required");
  });

  test("the learner cannot silently weaken delivery or leak run data", () => {
    const never = section(improve, "## Never");
    for (const phrase of [
      "without exact operator approval",
      "Copy secrets, personal data, transcripts, or product source",
      "Weaken or delete a test, gate, review requirement, approval, or safety rule",
    ]) {
      expect(never).toContain(phrase);
    }
  });
});

describe("engineering learning postmortem", () => {
	const retro = SPECS["retro.md"];

	test("retro persists a chronological, evidence-backed learning artifact", () => {
		expect(retro).toContain(".delivery/runs/<run-id>-postmortem.md");
		expect(retro).toContain(
			"`attempt → evidence of failure → changed model → result`",
		);
		expect(retro).toContain(
			"Every claim\nabout an attempt or failure links to a commit",
		);
		expect(retro).toContain("## Exercises for the reader");
	});

	test("retro teaches DSA without inventing algorithmic depth", () => {
		expect(retro).toContain("#### Data structures and algorithms");
		expect(retro).toContain("State the invariant");
		expect(retro).toContain("time and space complexity");
		expect(retro).toContain("No material DSA decision in this change");
	});

	test("retro covers concrete system-design trade-offs and recovery", () => {
		expect(retro).toContain("#### System design");
		for (const topic of [
			"trust boundaries",
			"consistency model",
			"concurrency control",
			"idempotency",
			"observability",
			"rollback",
		]) {
			expect(retro).toContain(topic);
		}
		expect(retro).toContain("what became cheaper");
		expect(retro).toContain("what became more expensive");
	});
});

describe("shadow model routing", () => {
	test("the conductor records shadow decisions and does not dispatch them", () => {
		const policy = section(SKILL, "## Orchestration policy");
		expect(policy).toContain("Shadow model routing");
		expect(policy).toContain("task-profile-controller");
		expect(policy).toContain("ROUTING_PROFILING=always");
		expect(policy).toContain("defaults");
		expect(policy).toContain("off");
		expect(policy).toContain("every quality gate");
		expect(policy).toContain("still runs");
		expect(policy).toContain(".delivery/routing/");
		expect(policy).toContain("90 percent");
		expect(policy).toContain("never dispatched");
		expect(policy).toContain("select-model.ts");
		expect(policy).toContain("model-catalogue.ts");
		expect(policy).toContain("runtime-advertised live frontier candidate");
		expect(policy).toContain("representative-run");
		expect(policy).toContain("promotion approval");
		expect(policy).toContain("Public rankings never promote");
		expect(policy).toContain("capture-usage.ts");
		expect(policy).toContain("wall time");
		expect(policy).toMatch(/do not guess/i);
	});

	test("the conductor records the host-advertised model list", () => {
		const preconditions = section(SKILL, "## Phase 1 — Preconditions and ledger");
		expect(preconditions).toContain("model-inventory.json");
		expect(preconditions).toContain("exact model identifiers");
		expect(preconditions).toContain("evaluation-only");
	});
});

describe("portable dynamic orchestration", () => {
  const policy = section(SKILL, "## Orchestration policy");

  test("isolated workers stop at decisions not covered by plan approval", () => {
    expect(policy).toContain("mutating isolated");
    for (const stop of ["merge", "risk acceptance", "failed or ambiguous gate", "candidate installation"]) {
      expect(policy).toContain(stop);
    }
  });

  test("runtime-specific helpers are optional and cannot define the outcome", () => {
    expect(policy).toContain("A runtime-specific workflow helper may replace a large homogeneous read-only");
    expect(policy).toContain("must not depend on a helper that only one host provides");
  });

  test("fan-out is bounded, structured, durable, and fail-closed", () => {
    expect(policy).toContain("one to four read-only subagents");
    expect(policy).toContain("require structured");
    expect(policy).toContain("Store intermediate state in the ledger or a named artifact");
    expect(policy).toContain("missing, null, stalled, malformed, or unverified");
  });

  test("improvement evaluation has three lenses and rejects incomplete workers", () => {
    for (const lens of ["Evidence auditor", "Regression auditor", "Safety auditor"]) {
      expect(SPECS["improve.md"]).toContain(lens);
    }
    expect(SPECS["improve.md"]).toContain("result is a failed evaluation, never a pass");
  });
});

describe("portable factory pack", () => {
  const packRoot = join(ROOT, "..", "..");
  const readme = readFileSync(join(packRoot, "README.md"), "utf8");

  test("install --all skips an unwritable Cloud Agent store", () => {
    const compat = readFileSync(join(packRoot, "adapters", "compat.sh"), "utf8");
    const store = readFileSync(
      join(packRoot, "adapters", "cursor", "install-store.sh"),
      "utf8",
    );
    expect(compat).toContain("targets+=(cursor claude store)");
    expect(store).toContain("Agent store skipped (not writable here)");
    expect(store).toContain('elif [[ "$store" == /cursor/* ]]');
    expect(store).toContain("store_probe=/cursor");
    expect(readme).toContain("./install.sh --skills-dir");
  });

  test("the README SDLC names every stage skill and every human gate", () => {
    expect(readme).toContain("```mermaid");
    expect(readme).toContain("flowchart TD");
    for (const node of [
      "groom",
      "one plan approval",
      "Parallel isolated worktrees",
      "draft",
      "Select the smallest complete test seams",
      "execute",
      "Reconcile MR, tests, gates, dirty tree",
      "correctness review pass",
      "mr-review",
      "address-comments",
      "Human merges",
      "archive",
      "improve",
      "Operator apply, reject, or rollback",
    ]) {
      expect(readme).toContain(node);
    }
    expect(readme).toContain("Approval of the final groomed plan authorizes routine");
    expect(readme).toContain("Independent tickets run concurrently");
    expect(readme).toContain("SDLC-CONSTITUTION.md");
    expect(readme).toContain("policy kernel");
    expect(readme).toContain(".delivery/runs/<id>.run-contract.json");
  });

  test("the README explains constitutional precedence and frozen scope", () => {
    const constitution = readFileSync(
      join(packRoot, "skills", "delivery", "sdlc-constitution.json"),
      "utf8",
    );
    const policy = JSON.parse(constitution) as {
      precedence: string[];
      humanOwned: string[];
    };
    const sectionStart = readme.indexOf("## Constitution and run contracts");
    const sectionEnd = readme.indexOf("\n## SDLC", sectionStart);
    const docs = readme.slice(sectionStart, sectionEnd);
    expect(sectionStart).toBeGreaterThan(-1);
    expect(docs).toContain("sdlc-constitution.json");
    expect(docs).toContain("highest precedence");
    expect(docs).toContain("previous contract hash");
    expect(docs).toContain("new explicit approval");
    expect(docs).toContain("sdlc-constitution.ts\" preflight");
    const normalizedDocs = docs
      .toLowerCase()
      .replaceAll("-", " ")
      .replace(/\s+/g, " ");
    for (const action of policy.humanOwned) {
      expect(normalizedDocs).toContain(action.replaceAll("-", " "));
    }
    expect(policy.precedence[0]).toBe("constitution");
  });

  test("the README explains one-approval continuous delivery from live contracts", () => {
    expect(readme).toContain("## Continuous delivery");
    expect(readme).toContain("/delivery <idea-or-PRD>");
    expect(readme).toContain(
      "single routine delivery\nauthorization for the run",
    );
    expect(readme).toContain("one isolated git worktree and");
    expect(readme).toContain("It does not ask whether to proceed");
    for (const boundary of [
      "merge",
      "release-risk\nacceptance",
      "bypassing a gate",
      "installing a skill candidate",
    ]) {
      expect(readme).toContain(boundary);
    }
    expect(readme).toContain(".delivery/workers/<run>/<key>.md");
  });

  test("the README describes runtime model inventory and shadow routing", () => {
    expect(readme).toContain("model-inventory.json");
    expect(readme).toContain("evaluation-only");
    expect(readme).toContain("ROUTING_PROFILING=always");
    expect(readme).toContain("defaults off");
    expect(readme).toContain("90 percent");
    expect(readme).toContain("recorded, never dispatched");
    expect(readme).toContain("factory/model-catalogue.json");
    expect(readme).toContain("representative-run");
    expect(readme).toContain("promotion approval");
    expect(readme).toContain("distributed-state");
    expect(readme).toContain("weak-verification");
    expect(readme).toContain("Public rankings");
    expect(readme).toContain("wall time automatically");
    expect(readme).toContain("host token and cost");
    expect(readme).toContain("review-fanout.ts");
    expect(readme).toContain("Cost controls");
    expect(readme).toMatch(/reply-only round/i);
  });


  test("factory skills and runtime ship beside the conductor", () => {
    for (const name of ["groom", "draft", "execute", "address-comments", "openspec-archive"]) {
      expect(existsSync(join(packRoot, "skills", name, "SKILL.md"))).toBe(true);
    }
    expect(existsSync(join(packRoot, "factory", "RUNTIME.md"))).toBe(true);
    expect(existsSync(join(packRoot, "factory", "scripts", "find-change.ts"))).toBe(true);
  });

  test("the conductor invokes pack skills, not a source-framework plugin", () => {
    expect(section(SKILL, "### Single steps")).not.toContain("/ig-spec:");
    expect(SKILL).toContain("Do not load a second factory pack in the same session");
  });
});

describe("max review contract", () => {
  test("the skill is manually invoked and pins both refs", () => {
    expect(CODE_REVIEW_MAX).toContain("name: code-review-max");
    expect(CODE_REVIEW_MAX).not.toContain("disable-model-invocation");
    expect(CODE_REVIEW_MAX).toContain("full base SHA, full head SHA");
    expect(CODE_REVIEW_MAX).toContain("The current branch is irrelevant.");
  });

  test("the max pass fans out independent lenses and adjudicates candidates", () => {
    for (const lens of [
      "Correctness and security",
      "Tests and specification",
      "Reliability and operations",
      "Repository standards and blast radius",
    ]) {
      expect(CODE_REVIEW_MAX).toContain(lens);
    }
    expect(CODE_REVIEW_MAX).toContain("No candidate is a finding merely because several reviewers repeated it.");
  });

  test("review lenses use the standard tier and reduce only proven small reversible changes", () => {
    expect(CODE_REVIEW_MAX).toContain("model-catalogue.ts");
    expect(CODE_REVIEW_MAX).toContain("resolve standard");
    expect(CODE_REVIEW_MAX).toContain("exact model identifier");
    expect(CODE_REVIEW_MAX).toContain("review-fanout.ts");
    expect(CODE_REVIEW_MAX).toContain("authoritative");
    expect(CODE_REVIEW_MAX).toMatch(/Invalid input or a non-zero exit\s+stops the review/i);
    expect(CODE_REVIEW_MAX).toMatch(/at most 2 files/);
    expect(CODE_REVIEW_MAX).toMatch(/fewer than 50\s+changed lines/);
    expect(CODE_REVIEW_MAX).toContain("two-way door");
    expect(CODE_REVIEW_MAX).toMatch(/run lenses 1 and 2/i);
    expect(CODE_REVIEW_MAX).toMatch(/full review.*all four lenses/i);
    expect(CODE_REVIEW_MAX).toMatch(/unknown classification/i);
    expect(CODE_REVIEW_MAX).toContain("The reduced pass never applies");
    for (const floor of ["auth", "migrations", "public", "configuration", "infrastructure", "one-way"]) {
      expect(CODE_REVIEW_MAX).toContain(floor);
    }
  });

  test("the handoff marker binds findings to an MR head", () => {
    const marker = "<!-- code-review-max:mr=<iid> head=<full-head-sha> -->";
    expect(CODE_REVIEW_MAX).toContain(marker);
    expect(MR_REVIEW).toContain(marker);
    expect(MR_REVIEW).toContain("must exactly match the live `read` result");
  });

  test("mr-review accepts the stamped max pass but rejects a lightweight built-in review", () => {
    expect(MR_REVIEW).toContain("`/code-review-max !<iid>` output");
    expect(MR_REVIEW).toContain("Reject a lightweight built-in review");
  });

  test("the correctness pass cannot publish or change code", () => {
    expect(CODE_REVIEW_MAX).toContain("Do not publish findings through the forge provider.");
    expect(CODE_REVIEW_MAX).toContain("- Make code changes.");
    expect(CODE_REVIEW_MAX).toContain("- Post notes, approve, merge, or change tracker items.");
  });
});

describe("ledger resume", () => {
  const phase0 = section(SKILL, "## Phase 0 — Entry detection");

  function invocation(name: string): string {
    const STORE = readFileSync(
      join(SKILLS_ROOT, "..", "factory", "scripts", "next-action.ts"),
      "utf8",
    );
    const match = STORE.match(
      new RegExp(`export const ${name} = "([^"]+)"`),
    );
    expect(match?.[1]).toBeTruthy();
    return match?.[1] ?? "";
  }

  test("Phase 0 routes a bare key to Resume, not a ticket span", () => {
    expect(classify("MDF-1234")).toBe("Resume");
    expect(phase0).not.toMatch(/Single ticket\s*\|\s*Stages 2 to 4/);
  });

  test("Phase 0 names the next-action helper from the script export", () => {
    const command = invocation("NEXT_ACTION_INVOCATION");
    expect(command).toContain("next-action.ts");
    expect(phase0).toContain(command);
  });

  test("an illegal or unknown stop does not write the ledger", () => {
    expect(phase0).toMatch(/illegal|unknown/i);
    expect(phase0).toMatch(/does not write the ledger|without writing the ledger|without changing the ledger/i);
  });

  test("Entry B resumes from the helper instead of walking Stages 2 to 4", () => {
    const entryB = section(SKILL, "### Entry B — Resume");
    const command = invocation("NEXT_ACTION_INVOCATION");
    expect(entryB).toContain(command);
    expect(entryB).not.toMatch(/Follow `ticket-to-mr\.md` for the key/);
    expect(entryB).toMatch(/only that step|selected (action|step)/i);
  });
});

describe("stage 3 readiness", () => {
  const factoryScripts = join(SKILLS_ROOT, "..", "factory", "scripts");

  test("the ledger and auto table send addressed tickets to review", () => {
    expect(vocabulary.has(normaliseTag("[addressed !N]"))).toBe(true);
    const table = section(AUTO, "### Next step by status");
    const row = table.split("\n").find((line) => line.includes("`[addressed !N]`"));
    expect(row).toBeTruthy();
    expect(cells(row ?? "")[2]).toMatch(/Review/);
    expect(cells(row ?? "")[2]).not.toMatch(/Address comments/i);
  });

  test("address-comments holdout approve leaves the merge request draft", () => {
    expect(ADDRESS_COMMENTS).toContain("[addressed !N]");
    expect(ADDRESS_COMMENTS).not.toMatch(
      /`approve`[\s\S]{0,800}glab mr update <mr> --ready/,
    );
    expect(ADDRESS_COMMENTS).toMatch(/approve[\s\S]{0,500}draft/i);
  });

  test("address-comments skips duplicate holdout work only when the head is unchanged", () => {
    expect(ADDRESS_COMMENTS).toContain("git rev-parse HEAD");
    expect(ADDRESS_COMMENTS).toMatch(/head still equals the step 2 revision/i);
    expect(ADDRESS_COMMENTS).toMatch(/no\s+`re-review-pending\.json` existed on entry/i);
    expect(ADDRESS_COMMENTS).toMatch(/skip the cumulative gates and\s+holdout re-review/i);
    expect(ADDRESS_COMMENTS).toMatch(/Stage 3 still runs\s+`\/code-review-max` and `\/mr-review`/i);
    expect(ADDRESS_COMMENTS).toMatch(/Otherwise, run one full green gate/i);
  });

  test("ship does not treat a conductor-written review row as Stage 3 passing", () => {
    const helperPath = join(factoryScripts, "stage3-readiness.ts");
    expect(existsSync(helperPath)).toBe(true);
    const helper = readFileSync(helperPath, "utf8");
    const match = helper.match(
      /export const STAGE3_READINESS_INVOCATION = "([^"]+)"/,
    );
    expect(match?.[1]).toBeTruthy();
    const command = match?.[1] ?? "";
    expect(SPECS["release-readiness.md"]).toContain(command);
    expect(SPECS["release-readiness.md"]).toMatch(
      /review row (alone|is not enough|cannot stand in)|not (enough|sufficient) to (undraft|stand in)/i,
    );
    expect(SKILL).toContain(command);
    expect(SKILL).toContain("[addressed !N]");
  });
});

describe("interrupted execute recovery", () => {
  test("auto recovers executing instead of only waiting while the build runs", () => {
    const executing = AUTO.split("\n").find((line) =>
      line.startsWith("| `[executing]`"),
    );
    expect(executing).toBeTruthy();
    expect(executing).toMatch(/matching.*merge request|matching open MR/i);
    expect(executing).toMatch(/review/i);
    expect(executing).toMatch(/interrupt/i);
    expect(executing).toMatch(/continuous authorization/i);
    expect(executing).toMatch(/live owner|still builds|still running/i);
  });

  test("resume records a matching merge request iid and proceeds to review", () => {
    const entryB = section(SKILL, "### Entry B — Resume");
    expect(entryB).toMatch(/\[executing\]/);
    expect(entryB).toMatch(/matching.*merge request|matching open MR/i);
    expect(entryB).toMatch(/record.*iid|records the iid/i);
    expect(entryB).toMatch(/review/i);
  });

  test("an interrupted execute stop offers the execute-resume command", () => {
    expect(`${SKILL}\n${AUTO}`).toContain("/delivery execute <KEY>");
    expect(SKILL).toMatch(/interrupt/i);
    expect(section(SKILL, "### Entry B — Resume")).toMatch(
      /does not run execute|must not start execute|not start execute/i,
    );
  });

  test("typing execute remains the approval to build after an interrupted stop", () => {
    expect(SKILL).toMatch(/Typing this verb is the approval to build/);
    expect(AUTO).toMatch(/Never retry a failed stage/);
  });
});

describe("normalized forge commands", () => {
  const genericDocs: [string, string][] = [
    ["delivery", SKILL],
    ["execute", EXECUTE],
    ["address-comments", ADDRESS_COMMENTS],
    ["code-review-max", CODE_REVIEW_MAX],
    ["mr-review", MR_REVIEW],
    ...Object.entries(SPECS),
  ];

  test("generic skills and workflows never name a provider-native forge helper", () => {
    for (const [name, doc] of genericDocs) {
      expect([name, PROVIDER_NATIVE.test(doc)]).toEqual([name, false]);
    }
  });

  test("execute and address-comments use exact forge-provider operations", () => {
    expect(EXECUTE).toContain(`${FORGE_PROVIDER} find`);
    expect(EXECUTE).toContain(`${FORGE_PROVIDER} create`);
    expect(EXECUTE).toContain(`${FORGE_PROVIDER} note`);
    expect(ADDRESS_COMMENTS).toContain(`${FORGE_PROVIDER} find`);
    expect(ADDRESS_COMMENTS).toContain(`${FORGE_PROVIDER} set-draft`);
    expect(ADDRESS_COMMENTS).toContain(`${FORGE_PROVIDER} discussions`);
    expect(ADDRESS_COMMENTS).toContain(`${FORGE_PROVIDER} reply`);
    expect(ADDRESS_COMMENTS).toMatch(/Never.*mark any thread resolved/i);
  });

  test("review skills keep evidence order, dry-run, and per-note checkpoints", () => {
    expect(CODE_REVIEW_MAX.indexOf(`${FORGE_PROVIDER} read`)).toBeLessThan(
      CODE_REVIEW_MAX.indexOf(`${FORGE_PROVIDER} files`),
    );
    expect(CODE_REVIEW_MAX.indexOf(`${FORGE_PROVIDER} files`)).toBeLessThan(
      CODE_REVIEW_MAX.indexOf(`${FORGE_PROVIDER} diff`),
    );
    const phase1 = MR_REVIEW.slice(
      MR_REVIEW.indexOf("## Phase 1"),
      MR_REVIEW.indexOf("## Phase 2"),
    );
    expect(phase1.indexOf(`${FORGE_PROVIDER} read`)).toBeLessThan(
      phase1.indexOf(`${FORGE_PROVIDER} commits`),
    );
    expect(phase1.indexOf(`${FORGE_PROVIDER} commits`)).toBeLessThan(
      phase1.indexOf(`${FORGE_PROVIDER} discussions`),
    );
    expect(phase1.indexOf(`${FORGE_PROVIDER} discussions`)).toBeLessThan(
      phase1.indexOf(`${FORGE_PROVIDER} files`),
    );
    expect(phase1).not.toContain(`${FORGE_PROVIDER} diff`);
    expect(MR_REVIEW).toContain('"dryRun": true');
    expect(MR_REVIEW).toMatch(/three choices:/);
    expect(MR_REVIEW).toMatch(/If one fails, report the failure and stop/);
    expect(SPECS["mr-review-to-ready.md"]).toContain("per-note prompts");
    expect(SKILL).toContain("scripts/forge-provider.ts");
    expect(SKILL).toContain("forge-provider.ts plan");
    expect(SKILL).toContain("forge-provider.ts normalize");
    expect(SKILL).toContain("mcp-inventory.ts");
  });
});


describe("comments on an open change", () => {
  const readiness = SPECS["release-readiness.md"];
  const scoping = 'bun "${FACTORY_ROOT}/scripts/forge-comments.ts"';

  test("execute opens the draft change on the first satisfied holdout review, then checks back", () => {
    expect(EXECUTE).toMatch(/Open the change as soon as the first holdout review is satisfied, then check back on it/);
    expect(EXECUTE).toMatch(/never hold it back for extra local review rounds/);
    expect(EXECUTE).toMatch(/people or automated, often comment only once a change is posted/);
    expect(SPECS["ticket-to-mr.md"]).toMatch(/opens on the \*\*first\*\* holdout `approve`/);
    expect(SPECS["ticket-to-mr.md"]).toMatch(/Check back on it/);
  });

  test("release readiness reads the change's comments with address-comments scoping and blocks on unanswered ones", () => {
    const pre = section(readiness, "## Preconditions");
    expect(pre).toMatch(/Comments on the change are answered/);
    expect(pre).toContain(`${FORGE_PROVIDER} discussions`);
    expect(pre).toContain(scoping);
    expect(ADDRESS_COMMENTS).toContain(scoping);
    expect(pre).toMatch(/becomes a comment blocker in step 6/);
    const decide = section(readiness, "### 6. Decide");
    expect(decide).toMatch(/comment on the change is unanswered[\s\S]*comment\s+blocker/);
    expect(decide).toMatch(/never accepted as a\s+risk/);
    expect(readiness).toMatch(/\| Queues the change \| Read the comments on the change again first/);
  });

  test("auto routes ready, no-go and go through the comment check", () => {
    const table = section(AUTO, "### Next step by status");
    const next = (tag: string) => cells(table.split("\n").find((l) => l.startsWith(`| \`${tag}\``)) ?? "")[2];
    expect(next("[ready !N]")).toMatch(/reads the comments on the change before any GO/);
    expect(next("[no-go !N]")).toMatch(/unanswered comment on the change is a comment blocker, fixed in one batched round/);
    expect(next("[go !N]")).toMatch(/Before it is queued, read the comments on the change again/);
    expect(AUTO).toMatch(/never one round per\s+thread, and that round counts as one review round/);
  });

  test("address-comments batches open comments, replies as the operator, and never resolves", () => {
    expect(ADDRESS_COMMENTS).toMatch(/Every open comment on the change, from people or automated reviewers, is handled in this one round/);
    expect(ADDRESS_COMMENTS).toMatch(/never one round per thread/);
    expect(ADDRESS_COMMENTS).toMatch(/forge identity of the operator running this skill/);
    expect(ADDRESS_COMMENTS).toMatch(/Never post as another person or through a separate bot account/);
    expect(SKILL).toMatch(/After the MR opens, check back on it\. No GO, and no queueing, while a comment/);
    expect(SKILL).toMatch(/threads are\s+never resolved/);
  });
});
