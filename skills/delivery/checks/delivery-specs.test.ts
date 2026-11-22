import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

setDefaultTimeout(60_000);

const ROOT = process.env.DELIVERY_SKILL_ROOT ?? join(import.meta.dir, "..");
const SKILLS_ROOT = process.env.DELIVERY_SKILLS_ROOT ?? join(import.meta.dir, "..", "..");
const PACK_ROOT = join(SKILLS_ROOT, "..");
// A checkout has factory/ beside skills/; an install has _factory/ inside the
// skills directory. Pack docs and adapters exist only in a checkout.
const FACTORY_DIR = [join(PACK_ROOT, "factory"), join(SKILLS_ROOT, "_factory")].find((dir) =>
  existsSync(join(dir, "scripts")),
);
if (!FACTORY_DIR) {
  throw new Error(
    "The factory scripts were not found: expected factory/ beside skills/ or _factory/ inside it.",
  );
}
const FACTORY_SCRIPTS = join(FACTORY_DIR, "scripts");
const IN_CHECKOUT = ["README.md", "factory", "adapters"].every((name) =>
  existsSync(join(PACK_ROOT, name)),
);
const CHECKOUT_ONLY_REASON =
  "needs a delivery-skills checkout: README.md, factory/ and adapters/ are not installed";
function checkoutOnly(name: string, body: () => void): void {
  if (IN_CHECKOUT) describe(name, body);
  else test.skip(`${name} (${CHECKOUT_ONLY_REASON})`, () => {});
}
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
const SKILL_PATH = existsSync(join(ROOT, "SKILL.md"))
  ? join(ROOT, "SKILL.md")
  : join(ROOT, "delivery-SKILL.proposed.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");
const HELP = readFileSync(join(ROOT, "reference", "help.md"), "utf8");
const DECISION_BRIEF = readFileSync(join(ROOT, "reference", "decision-brief.md"), "utf8");
const ENTRIES = readFileSync(join(ROOT, "reference", "entries.md"), "utf8");
const ORCHESTRATION = readFileSync(join(ROOT, "reference", "orchestration.md"), "utf8");
const WORKFLOWS = join(ROOT, "workflows");
const LEDGER = readFileSync(join(WORKFLOWS, "delivery-ledger.md"), "utf8");
const CONDUCTOR_WRITES = section(LEDGER, "## Writes the conductor owns");
const AUTO = readFileSync(join(WORKFLOWS, "auto.md"), "utf8");
const CODE_REVIEW_MAX = readFileSync(join(SKILLS_ROOT, "code-review-max", "SKILL.md"), "utf8");
const codeReviewMaxReference = (name: string) =>
  readFileSync(join(SKILLS_ROOT, "code-review-max", "reference", name), "utf8");
const CODE_REVIEW_MAX_LENSES = codeReviewMaxReference("lenses.md");
const CODE_REVIEW_MAX_FOCUSED_PASS = codeReviewMaxReference("focused-pass.md");
const CODE_REVIEW_MAX_NO_LENSES = codeReviewMaxReference("no-lenses.md");
const CODE_REVIEW_MAX_MEMORY = codeReviewMaxReference("review-memory.md");
const CODE_REVIEW_MAX_STANDARD = codeReviewMaxReference("standard-adjudication.md");
const CODE_REVIEW_MAX_LATER_ROUNDS = codeReviewMaxReference("later-rounds.md");
const MR_REVIEW = readFileSync(join(SKILLS_ROOT, "mr-review", "SKILL.md"), "utf8");
const ADDRESS_COMMENTS = readFileSync(join(SKILLS_ROOT, "address-comments", "SKILL.md"), "utf8");
const EXECUTE = readFileSync(join(SKILLS_ROOT, "execute", "SKILL.md"), "utf8");
const EXECUTE_RE_ENTRY = readFileSync(join(SKILLS_ROOT, "execute", "reference", "re-entry.md"), "utf8");
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
  return line.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
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
    ["ABC-1234", "Resume"],
    ["XYZ-740", "Resume"],
    ["740", "Review only"],
    ["740 ABC-12", "Review only with work-item key"],
    ["ABC-12 740", "Review only with work-item key"],
    ["discover a cost dashboard for job runs", "Discovery"],
    ["discover discover-2026-10-13-cost-dashboard", "Discovery"],
    ["triage ABC-2100", "Bug intake"],
    ["ship 740", "Release readiness"],
    ["verify 740", "Post-merge verify"],
    ["retro ABC-2000", "Retro (work item or group)"],
    ["improve", "Improvement"],
    ["improve ABC-2000", "Improvement"],
    ["improve all", "Improvement"],
    ["improve status", "Improvement"],
    ["improve apply improve-20261015-missing-rollback", "Improvement decision"],
    ["improve reject improve-20261015-missing-rollback", "Improvement decision"],
    ["improve rollback 20261015-abc123", "Improvement decision"],
    ["status", "Catch-up"],
    ["status ABC-2000", "Catch-up"],
    ["  ABC-1234  ", "Resume"],
    ["Add per-job cost limits to the factory", "Full epic"],
    ["status of the cost work", "Full epic"],
    ["docs/stories/F5-4-port-igspec-gates.md", "Full epic"],
    ["", "Help"],
    ["help", "Help"],
    ["doctor", "Doctor"],
    ["init", "Initialize"],
    ["auto", "Auto"],
    ["auto Add a spend-by-repository panel to the costs page", "Auto"],
    ["auto ABC-2000", "Auto"],
    ["auto 740", "Auto"],
    ["automate the cost alerts", "Full epic"],
    ["auto-scaling for job runners", "Full epic"],
    ["groom Add a spend-by-repository panel to the costs page", "Groom"],
    ["groom docs/stories/F5-4-port-igspec-gates.md", "Groom"],
    ["draft ABC-2101", "Draft"],
    ["draft #123", "Draft"],
    ["draft owner/repo#123", "Draft"],
    ["draft a plan for the costs page", "Full epic"],
    ["execute ABC-2101", "Execute"],
    ["execute LOCAL-1", "Execute"],
    ["build ABC-2101", "Execute"],
    ["build a costs panel", "Full epic"],
    ["review 740", "Review"],
    ["review 740 ABC-2101", "Review"],
    ["review the costs page design", "Full epic"],
    ["address ABC-2101", "Address comments"],
    ["archive ABC-2101", "Archive"],
    ["archive abc-2063-decide-whether-a-suspected-bug-marker", "Archive"],
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
    expect(
      entries.slice(bare).every((e) => e.startsWith("Resume") || e.startsWith("Review only")),
    ).toBe(true);
  });
});

describe("one command to remember", () => {
  const cheatSheet = HELP;

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
      expect(section(ENTRIES, "## Single steps")).toContain(command);
    });
  }

  test("the conductor points every other entry at its section of reference/entries.md", () => {
    const run = section(SKILL, "### Every other entry");
    expect(run).toContain("`reference/entries.md`");
    expect(run).toContain("**Single steps**");
    expect(run).toContain("**Entry**");
  });
});

describe("source of truth", () => {
  test("workflow specs are bundled and have no personal fallback", () => {
    expect(section(SKILL, "## Source of truth")).toContain("no machine-specific fallbacks");
    expect(SKILL).not.toContain("/Users/");
    for (const [name, doc] of Object.entries(SPECS)) {
      if (HISTORICAL_FILES.has(name)) continue;
      expect([name, doc.includes("/Users/") || doc.includes("delivery-runs")]).toEqual([
        name,
        false,
      ]);
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
  const brief = DECISION_BRIEF;

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
      "### Comparison",
      "**Recommendation:**",
      "**Would change if:**",
      "**Reversibility:**",
      "**If we wait:**",
      "**Choose:**",
      "**Why it matters:**",
      "## Your choice:",
    ]) {
      expect([field, brief.includes(field)]).toEqual([field, true]);
    }
    expect(brief).toMatch(/two or more viable options/i);
    expect(brief).toMatch(/recommendation is\s+weak/i);
    expect(brief).toMatch(/Ask exactly one\s+final question/i);
    expect(brief).toMatch(/Do not include a recommendation/i);
    expect(brief).toMatch(/After they choose/i);
    expect(brief).toMatch(/keep or switch/i);
    const choosePhase = brief.split("**After they choose.**")[0] ?? "";
    expect(choosePhase).toContain("### Comparison");
    expect(choosePhase).not.toContain("**Recommendation:**");
  });

  test("the brief applies only to real choices and preserves hard gates", () => {
    expect(brief).toMatch(/factory owns simple decisions/i);
    expect(brief).toMatch(/It does not ask/i);
    expect(brief).toMatch(/two-way door/i);
    expect(brief).toMatch(/agent-owned/i);
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
    expect(brief).toMatch(/missing identifier or credential is asked directly/i);
    expect(brief).toMatch(/failed gate never\s+becomes an\s+option/i);
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
    expect(brief).toMatch(/reversible product-scope\s+choice stays compact/i);
    expect(brief).toMatch(
      /public contract[\s\S]*persistent data[\s\S]*security\s+boundary[\s\S]*distributed state[\s\S]*cross-system[\s\S]*operational\s+topology/,
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
      expect([name, /Human\s+decision\s+brief/i.test(SPECS[name])]).toEqual([name, true]);
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
  checkoutOnly("live contracts independent of historical wording", () => {
    test("the suite passes when historical files contradict live rules", async () => {
      const dest = mkdtempSync(join(tmpdir(), "delivery-authority-"));
      try {
        const packRoot = join(import.meta.dir, "..", "..", "..");
        for (const name of ["README.md", "install.sh"]) {
          cpSync(join(packRoot, name), join(dest, name));
        }
        cpSync(join(packRoot, "skills"), join(dest, "skills"), { recursive: true });
        cpSync(join(packRoot, "factory"), join(dest, "factory"), { recursive: true });
        cpSync(join(packRoot, "adapters"), join(dest, "adapters"), { recursive: true });
        cpSync(join(packRoot, "docs"), join(dest, "docs"), { recursive: true });
        writeFileSync(
          join(dest, "skills", "delivery", "workflows", "NOTES.md"),
          CONTRADICTED_NOTES,
        );
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
  const STORE = readFileSync(join(FACTORY_SCRIPTS, "ledger-store.ts"), "utf8");

  function invocation(name: string): string {
    const match = STORE.match(new RegExp(`export const ${name} = "([^"]+)"`));
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
      ["writes the conductor owns", section(LEDGER, "## Writes the conductor owns")],
    ] as const) {
      expect([name, doc.includes(writeCommand)]).toEqual([name, true]);
      expect([name, doc.includes(recoverCommand)]).toEqual([name, true]);
    }
    expect(LEDGER.toLowerCase()).toContain("concurrency conflict");
    expect(LEDGER).toMatch(/terminal stop/i);
    const conductorWrites = section(LEDGER, "## Writes the conductor owns");
    expect(conductorWrites.toLowerCase()).toContain("concurrency conflict");
    expect(conductorWrites).toMatch(/terminal stop/i);
    expect(SKILL).toContain("Follow **Writes the conductor owns** in `workflows/delivery-ledger.md`.");
  });

  function timeForm(): string {
    const form = invocation("LEDGER_TIME_FORMAT");
    expect(form).toBe("yyyy-mm-ddThh:mm:ssZ");
    return form;
  }

  function lineTemplate(format: string, heading: string): string {
    const lines = format.split("\n");
    const start = lines.indexOf(heading);
    expect(start).toBeGreaterThanOrEqual(0);
    return lines.slice(start + 1).find((line) => line.startsWith("- ")) ?? "";
  }

  test("the ledger format page starts Stops and Approvals lines with the writer's time form and leaves other sections with a date", () => {
    const form = timeForm();
    const format = section(LEDGER, "## Format");
    expect(lineTemplate(format, "## Stops")).toStartWith(`- <${form}> `);
    expect(lineTemplate(format, "## Approvals")).toStartWith(`- <${form}> `);
    expect(lineTemplate(format, "## Decisions")).toStartWith("- <yyyy-mm-dd> ");
    expect(lineTemplate(format, "## Lessons")).toStartWith("- <yyyy-mm-dd> ");
  });

  test("the write rules name both forms and say Stops and Approvals entries are single lines", () => {
    const form = timeForm();
    const rules = section(LEDGER, "## Write rules");
    expect(rules).toContain(form);
    expect(rules).toMatch(/yyyy-mm-dd(?!T)/);
    expect(rules).toMatch(/\bStops\b/);
    expect(rules).toMatch(/\bApprovals\b/);
    expect(rules).toMatch(/single[- ]line|one line|single line/i);
  });

  test("no other Markdown file under skills carries the time form", () => {
    const form = timeForm();
    const ledgerPage = join(WORKFLOWS, "delivery-ledger.md");
    const files = (readdirSync(SKILLS_ROOT, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".md"))
      .map((file) => join(SKILLS_ROOT, file));
    expect(files).toContain(ledgerPage);
    expect(files.length).toBeGreaterThan(10);
    expect(LEDGER).toContain(form);
    const copies = files
      .filter((file) => file !== ledgerPage)
      .filter((file) => readFileSync(file, "utf8").includes(form));
    expect(copies).toEqual([]);
  });
});

function normaliseTag(tag: string): string {
  return tag
    .replace(/!(N|<iid>|\d+)/g, "!N")
    .replace(/<[^>]+>|ABC-\d+/g, "<x>")
    .replace(/\s+/g, " ");
}

const STATUS_TAG =
  /`(\[(?:discovering|triage|groomed|drafted|executing|addressed|ready|go|no-go|merged|verified|regressed|retro|stopped|waiting)[^`]*\])`/g;

const vocabulary = new Set(
  [...section(LEDGER, "## Status tags").matchAll(/^\| `(\[[^`]+\])` \|/gm)].map((m) =>
    normaliseTag(m[1]),
  ),
);

describe("ledger vocabulary", () => {
  test("the ledger defines status tags", () => {
    expect(vocabulary.size).toBeGreaterThan(10);
  });

  const docs: [string, string][] = [
    ["SKILL.md", SKILL],
    ["reference/entries.md", ENTRIES],
    ...Object.entries(SPECS).filter(([name]) => !HISTORICAL_FILES.has(name)),
  ];
  for (const [name, doc] of docs) {
    test(`${name} uses only ledger status tags`, () => {
      const used = [...doc.matchAll(STATUS_TAG)].map((m) => normaliseTag(m[1]));
      expect(used.filter((t) => !vocabulary.has(t))).toEqual([]);
    });
  }

  test("every verdict kind a spec writes is defined with its values", () => {
    const kinds = section(LEDGER, "## Verdict kinds");
    const defined = new Map(
      [...kinds.matchAll(/^\| `(\w+)` \| [^|]+ \| ([^|]+) \|/gm)].map((m) => [
        m[1],
        [...m[2].matchAll(/`([\w-]+)`/g)].map((v) => v[1]),
      ]),
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
    expect(CONDUCTOR_WRITES).toContain("`review` verdict row");
  });
});

describe("auto", () => {
  const table = section(AUTO, "### Next step by status");
  const rows = table
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Status") && !l.startsWith("|---"));
  const tagsWithANextStep = rows
    .map((l) => cells(l)[1])
    .filter((c) => c.startsWith("`["))
    .map((c) => normaliseTag(c.slice(1, -1)));

  test("every status tag the ledger defines has a next step", () => {
    expect([...vocabulary].filter((t) => !tagsWithANextStep.includes(t))).toEqual([]);
  });

  test("every next-step row is a ledger status, or the run before a ledger exists", () => {
    const others = rows.map((l) => cells(l)[1]).filter((c) => !c.startsWith("`["));
    expect(others).toEqual(["no ledger yet"]);
    expect(tagsWithANextStep.filter((t) => !vocabulary.has(t))).toEqual([]);
  });

  test("continuous delivery asks for forge approval but not routine post-merge progression", () => {
    const asks = (tag: string) => cells(rows.find((l) => l.startsWith(`| \`${tag}\``)) ?? "")[3];
    expect(asks("[go !N]")).toBe("Nothing; a person approves the change on the forge");
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
    expect(whenToAsk).toMatch(/Ask only when[\s\S]*factory cannot decide/i);
    expect(whenToAsk).toMatch(/Agent-owned decisions go in\s+the same log without asking/i);
  });

  test("ready waves dispatch concurrently in isolated worktrees", () => {
    const choosing = section(AUTO, "### Choosing a key");
    expect(choosing).toContain("maxParallelWorktrees");
    expect(choosing).toContain("MAX_PARALLEL_WORKTREES");
    expect(choosing).toContain('scripts/config.ts" ready-wave');
    expect(choosing).toContain(`default ${DEFAULT_MAX_PARALLEL_WORKTREES}`);
    expect(ENTRIES).toContain("maxParallelWorktrees");
    expect(ENTRIES).toMatch(
      new RegExp(`scripts/config.ts[\\s\\S]*default\\s+${DEFAULT_MAX_PARALLEL_WORKTREES}`),
    );
    expect(SKILL).toContain("`workflows/auto.md`");
    expect(SKILL).toContain("`reference/entries.md`");
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
    expect(SKILL).toContain("Create work items only from approved, verified groom drafts");
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
    for (const doc of [ENTRIES, SPECS["epic-to-backlog.md"], SPECS["ticket-to-mr.md"]]) {
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
    expect(rows.map((r) => r[1])).toEqual([
      "Stage specs",
      "Factory",
      "Review commands",
      "Forge",
      "Work items",
      "Spec tool",
      "Deployed environment",
      "Skill evaluation",
    ]);
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
    expect(lenses).toContain("resolve standard");
    expect(lenses).toMatch(/main conversation still decides GO or NO-GO/);
    expect(lenses).toMatch(/Do not dispatch a fast\s+model for these lenses/);
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
    expect(monitoring).toMatch(
      /Only an attributable failure[\s\S]*inside the frozen run contract[\s\S]*maxFixAttempts/i,
    );
    expect(monitoring).toMatch(/new draft change/i);
    expect(monitoring).toMatch(/never performs a human-owned action/i);
    expect(AUTO).toMatch(/exact `revisions\.merged`[\s\S]*normalized[\s\S]*`pipeline` operation/i);
    expect(SPECS["post-merge-verify.md"]).toContain("Default-branch pipeline passed");
  });

  test("a cloud run never opens a second merge request", () => {
    expect(section(SKILL, "## One merge request")).toContain(
      "Never open a second one for the same change",
    );
  });
});

describe("hard rules survive", () => {
  const rules = [
    "Never merge via the forge provider",
    "never close, reopen, or move a ticket backwards",
    "Tickets move forward only through `board-status.ts sync`",
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
    for (const phrase of [
      "Merge",
      "Create work items outside",
      "transition",
      "permission to merge",
      "Retry a failed stage",
      "Skip a correctness",
      "Install or rollback",
    ]) {
      expect(never).toContain(phrase);
    }
  });

  for (const [name, doc] of Object.entries(SPECS)) {
    if (
      name === "delivery-ledger.md" ||
      HISTORICAL_FILES.has(name) ||
      LEGACY_SECTION_EXEMPT.has(name)
    )
      continue;
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
    expect(section(SKILL, "## Source of truth")).toContain("never beside the installed skill");
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
    expect(paired).toContain('bun "${FACTORY_ROOT}/scripts/paired-evaluation.ts"');
    expect(paired).toContain('bun "${FACTORY_ROOT}/scripts/generate-paired-evidence.ts"');
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
    expect(improve).toContain(
      "`/delivery improve apply <candidate>` is approval for that candidate only.",
    );
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
    expect(retro).toContain(".delivery/grooming/");
    expect(retro).toContain("decisions.md");
    expect(retro).toContain(".delivery/runs/<run-id>-postmortem.md");
    expect(retro).toContain("`attempt → evidence of failure → changed model → result`");
    expect(retro).toContain("Every claim\nabout an attempt or failure links to a commit");
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
  test("the conductor points at the orchestration policy before dispatch and when profiling is on", () => {
    const pointer = section(SKILL, "## Orchestration policy");
    expect(pointer).toContain("Read `reference/orchestration.md` before you dispatch");
    expect(pointer).toContain("`routingProfiling`");
    expect(pointer).toContain("ROUTING_PROFILING=always");
  });

  test("the conductor records shadow decisions and does not dispatch them", () => {
    const policy = ORCHESTRATION;
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
  const policy = ORCHESTRATION;

  test("isolated workers stop at decisions not covered by plan approval", () => {
    expect(policy).toContain("mutating isolated");
    for (const stop of [
      "merge",
      "risk acceptance",
      "failed or ambiguous gate",
      "candidate installation",
    ]) {
      expect(policy).toContain(stop);
    }
  });

  test("runtime-specific helpers are optional and cannot define the outcome", () => {
    expect(policy).toContain(
      "A runtime-specific workflow helper may replace a large homogeneous read-only",
    );
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

checkoutOnly("portable factory pack", () => {
  const packRoot = join(ROOT, "..", "..");
  const readme = readFileSync(join(packRoot, "README.md"), "utf8");

  test("install --all skips an unwritable Cloud Agent store", () => {
    const compat = readFileSync(join(packRoot, "adapters", "compat.sh"), "utf8");
    const store = readFileSync(join(packRoot, "adapters", "cursor", "install-store.sh"), "utf8");
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
      "Human approves; auto lands",
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
    expect(docs).toContain('sdlc-constitution.ts" preflight');
    const normalizedDocs = docs.toLowerCase().replaceAll("-", " ").replace(/\s+/g, " ");
    for (const action of policy.humanOwned) {
      expect(normalizedDocs).toContain(action.replaceAll("-", " "));
    }
    expect(policy.precedence[0]).toBe("constitution");
  });

  test("the README explains one-approval continuous delivery from live contracts", () => {
    expect(readme).toContain("## Continuous delivery");
    expect(readme).toContain("/delivery <idea-or-PRD>");
    expect(readme).toContain("single routine delivery\nauthorization for the run");
    expect(readme).toContain("one isolated git worktree and");
    expect(readme).toContain("It does not ask whether to proceed");
    const flowing = readme.replace(/\s+/g, " ");
    expect(flowing).toContain("only through the land gate");
    for (const boundary of [
      "any other merge",
      "release-risk acceptance",
      "bypassing a gate",
      "installing a skill candidate",
    ]) {
      expect(flowing).toContain(boundary);
    }
    expect(readme).toContain(".delivery/workers/<run>/<key>.md");
    expect(readme).toMatch(/decides simple, reversible, and discoverable work itself/i);
  });

  test("the README teaches agent-owned defaults and informed escalations", () => {
    const start = readme.indexOf("## Learning while the factory runs");
    const end = readme.indexOf("\n## Cost controls", start);
    const learning = readme.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(learning).toContain("The factory takes simple decisions");
    expect(learning).toContain("logged as agent-owned, and not asked");
    expect(learning).toContain("Escalate only what you must own");
    expect(learning).toContain("decide before you see a preferred answer");
    expect(learning).toContain("The recommendation comes after");
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
    expect(readme).toContain("mechanical-edit.ts");
    expect(readme).toContain("apply-mechanical-edit.ts");
    expect(readme).toContain("mechanical-edit-scoring.ts");
    expect(readme).toContain("mechanical-edit-test-repos.ts");
    expect(readme).toContain("test-repo-stand-in");
    expect(readme).toContain("mechanical-edit-model-runs.ts");
    expect(readme).toContain("model-run");
    expect(readme).toContain("TypeScript");
    expect(readme).toContain("Python");
    expect(readme).toContain("Java");
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
    expect(CODE_REVIEW_MAX).toContain(
      "No candidate is a finding merely because several reviewers repeated it.",
    );
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
    for (const floor of [
      "auth",
      "migrations",
      "public",
      "configuration",
      "infrastructure",
      "one-way",
    ]) {
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

  describe("coverage check", () => {
    const flat = (text: string) => text.replace(/\s+/g, " ");
    const unquoted = (text: string) => text.replace(/"(<[^">]+>)"/g, "$1");
    const coverage = () => flat(section(CODE_REVIEW_MAX, "## Check coverage"));
    const focusedPass = () => flat(CODE_REVIEW_MAX_FOCUSED_PASS);

    test("every lens ends its report with an examined-files list, on NO FINDINGS too", () => {
      expect(CODE_REVIEW_MAX).toContain("reference/lenses.md");
      const lenses = flat(CODE_REVIEW_MAX_LENSES);
      expect(lenses).toContain("Examined files:");
      expect(lenses).toMatch(
        /Examined files:.{0,300}NO FINDINGS|NO FINDINGS.{0,300}Examined files:/,
      );
      expect(lenses).toContain("Examined files: none");
    });

    test("a file counts as examined only when the lens read it, not when it only named it", () => {
      const lenses = flat(CODE_REVIEW_MAX_LENSES);
      expect(lenses).toMatch(/read[^.]{0,80}(changed lines|contents)[^.]{0,80}(pinned diff|head)/i);
      expect(lenses).toMatch(
        /(naming|named)[^.]{0,100}(is not reading|does not count|not examined|never counts)/i,
      );
      expect(lenses).toMatch(/removed lines[^.]{0,80}deleted|deleted[^.]{0,120}removed lines/i);
    });

    test("the brief's changed-path list is the output of the paths command", () => {
      const brief = unquoted(section(CODE_REVIEW_MAX, "## Build the review brief"));
      expect(brief).toMatch(/review-fanout\.ts" paths <base-or-since> <(full-)?head(-sha)?>/);
      expect(brief).toContain("--earlier");
      expect(brief).toMatch(/binary/i);
    });

    test("Check coverage sits after Parallel review and before Adjudicate", () => {
      const parallel = CODE_REVIEW_MAX.indexOf("\n## Parallel review");
      const check = CODE_REVIEW_MAX.indexOf("\n## Check coverage");
      const adjudicate = CODE_REVIEW_MAX.indexOf("\n## Adjudicate every candidate");
      expect(parallel).toBeGreaterThan(-1);
      expect(check).toBeGreaterThan(parallel);
      expect(adjudicate).toBeGreaterThan(check);
    });

    test("the coverage command is one line, with a base or since and a head, and no path list in the input", () => {
      const lines = CODE_REVIEW_MAX.split("\n").filter((line) =>
        line.includes('review-fanout.ts" coverage'),
      );
      expect(lines).toEqual([
        'bun "${FACTORY_ROOT}/scripts/review-fanout.ts" coverage "<base-or-since>" "<full-head-sha>" ".review/mr-<iid>/<full-head-sha>/lens-coverage-input.json" ".review/mr-<iid>/<full-head-sha>/lens-coverage.json"',
      ]);
      expect(coverage()).toContain("--earlier");
      expect(coverage()).toMatch(/no path list/i);
      expect(coverage()).toMatch(/non-zero (exit )?stops the review/i);
    });

    test("one read-only subagent starts per unexamined file, once, on the standard model", () => {
      const text = coverage();
      expect(text).toMatch(
        /one (fresh )?read-only subagent per [^.]{0,80}(unexamined|needsFocusedPass)/i,
      );
      expect(text).toMatch(/one batch|one parallel batch/i);
      expect(text).toMatch(/standard/);
      expect(text).toMatch(/exact model identifier/i);
      expect(text).toContain("reference/focused-pass.md");
      expect(focusedPass()).toMatch(
        /never repeated|not repeated|exactly one (focused )?pass|no second pass/i,
      );
      expect(focusedPass()).toMatch(/binary[^.]{0,80}(no|never|not)[^.]{0,40}(pass|subagent)/i);
    });

    test("a resumed review runs the command again and dispatches only what it still asks for", () => {
      expect(coverage()).toMatch(/resuming a review[^.]{0,200}reference\/focused-pass\.md/);
      expect(focusedPass()).toMatch(
        /resumed review[^.]{0,200}(run the (same )?command again|again from step 1)[^.]{0,200}needsFocusedPass/i,
      );
    });

    test("a failed pass leaves its file named as unexamined and adjudication continues", () => {
      const text = focusedPass();
      expect(text).toMatch(/fail[^.]{0,200}still unexamined/i);
      expect(text).toMatch(/adjudication continues|continue(s)? (to|at|with) adjudication/i);
    });

    test("coverage alone never changes the verdict", () => {
      expect(flat(CODE_REVIEW_MAX)).toMatch(
        /coverage[^.]{0,100}(does not|never|cannot)[^.]{0,60}(change|set|decide)[^.]{0,40}verdict|verdict[^.]{0,100}(not|never)[^.]{0,60}coverage/i,
      );
    });

    test("a review with no lenses runs the coverage command with no reports and adds no second skipped-worker entry", () => {
      const parallel = flat(section(CODE_REVIEW_MAX, "## Parallel review"));
      expect(parallel).toMatch(
        /lenses. is empty[\s\S]{0,600}coverage command[^.]{0,80}no reports/i,
      );
      expect(coverage()).toContain("reference/no-lenses.md");
      const text = flat(CODE_REVIEW_MAX_NO_LENSES);
      expect(text).toMatch(/skipped/i);
      expect(text).toMatch(/no lens ran/i);
      expect(text).toMatch(
        /(no|not add(ing)? a)[^.]{0,40}(second|another|extra|additional)[^.]{0,60}(skipped-worker|skip(ped)? entry)/i,
      );
    });

    test("adjudication numbers lens and focused-pass candidates together and writes one candidates file", () => {
      const adjudicate = flat(section(CODE_REVIEW_MAX, "## Adjudicate every candidate"));
      expect(adjudicate).toMatch(/focused-pass|focused pass/i);
      expect(adjudicate).toMatch(
        /no lens and no focused pass returned a candidate|no lens and no focused pass/i,
      );
      expect(adjudicate).toContain("lens-candidates.json");
    });

    test("focused-pass candidates join the lens candidates and the adjudication evidence", () => {
      const text = focusedPass();
      expect(text).toMatch(/lens-candidates\.json/);
      expect(text).toMatch(/--evidence|evidence/i);
      expect(text).toMatch(/focused-pass-<n>\.md/);
    });

    test("the output has a Coverage section after Verification that says reported and never verified", () => {
      const output = section(CODE_REVIEW_MAX, "## Output");
      const verification = output.indexOf("### Verification");
      const coverageHeading = output.indexOf("### Coverage");
      expect(verification).toBeGreaterThan(-1);
      expect(coverageHeading).toBeGreaterThan(verification);
      const rest = output.slice(coverageHeading + "### Coverage".length);
      const block = flat(rest.split(/\n###|\n<!--|\n```/)[0] ?? "");
      expect(block).toMatch(/reported/i);
      expect(block).not.toMatch(/\bverified\b/i);
      const wording = flat(output.slice(output.indexOf("```", coverageHeading)));
      expect(wording).toMatch(/carried|left over from the earlier review/i);
      expect(wording).toMatch(/not read as text/i);
      expect(wording).toMatch(/skipped because no lens ran|check was skipped/i);
    });

    test("the skill states that coverage is each lens's own report and does not measure inside a file", () => {
      const text = flat(CODE_REVIEW_MAX);
      expect(text).toMatch(/(lenses'?|lens'?s?) own report|self-reported|reported examination/i);
      expect(text).toMatch(/inside a file|how much of (a|the) file/i);
    });
  });
});

describe("ledger resume", () => {
  const phase0 = section(SKILL, "## Phase 0 — Entry detection");

  function invocation(name: string): string {
    const STORE = readFileSync(join(FACTORY_SCRIPTS, "next-action.ts"), "utf8");
    const match = STORE.match(new RegExp(`export const ${name} = "([^"]+)"`));
    expect(match?.[1]).toBeTruthy();
    return match?.[1] ?? "";
  }

  test("Phase 0 routes a bare key to Resume, not a ticket span", () => {
    expect(classify("ABC-1234")).toBe("Resume");
    expect(phase0).not.toMatch(/Single ticket\s*\|\s*Stages 2 to 4/);
  });

  test("Phase 0 names the next-action helper from the script export", () => {
    const command = invocation("NEXT_ACTION_INVOCATION");
    expect(command).toContain("next-action.ts");
    expect(phase0).toContain(command);
  });

  test("an illegal or unknown stop does not write the ledger", () => {
    expect(phase0).toMatch(/illegal|unknown/i);
    expect(phase0).toMatch(
      /does not write the ledger|without writing the ledger|without changing the ledger/i,
    );
  });

  test("Entry B resumes from the helper instead of walking Stages 2 to 4", () => {
    const entryB = section(ENTRIES, "## Entry B — Resume");
    const command = invocation("NEXT_ACTION_INVOCATION");
    expect(entryB).toContain(command);
    expect(entryB).not.toMatch(/Follow `ticket-to-mr\.md` for the key/);
    expect(entryB).toMatch(/only that step|selected (action|step)/i);
  });
});

describe("stage 3 readiness", () => {
  const factoryScripts = FACTORY_SCRIPTS;

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
    expect(ADDRESS_COMMENTS).not.toMatch(/`approve`[\s\S]{0,800}glab mr update <mr> --ready/);
    expect(ADDRESS_COMMENTS).toMatch(/approve[\s\S]{0,500}draft/i);
  });

  test("address-comments skips duplicate gate work only when the head is unchanged, and leaves review to Stage 3", () => {
    expect(ADDRESS_COMMENTS).toContain("git rev-parse HEAD");
    expect(ADDRESS_COMMENTS).toMatch(/head still equals the step 2 revision/i);
    expect(ADDRESS_COMMENTS).toMatch(/no\s+`re-review-pending\.json` existed on entry/i);
    expect(ADDRESS_COMMENTS).toMatch(
      /skip the cumulative gates because\s+their code input is unchanged/i,
    );
    expect(ADDRESS_COMMENTS).toMatch(/this round runs no review of its own/i);
    expect(ADDRESS_COMMENTS).not.toMatch(/holdout-reviewer/);
    expect(ADDRESS_COMMENTS).toMatch(/Stage 3 still runs\s+`\/code-review-max` and `\/mr-review`/i);
    expect(ADDRESS_COMMENTS).toMatch(/Otherwise, run one full green gate/i);
  });

  test("ship does not treat a conductor-written review row as Stage 3 passing", () => {
    const helperPath = join(factoryScripts, "stage3-readiness.ts");
    expect(existsSync(helperPath)).toBe(true);
    const helper = readFileSync(helperPath, "utf8");
    const match = helper.match(/export const STAGE3_READINESS_INVOCATION = "([^"]+)"/);
    expect(match?.[1]).toBeTruthy();
    const command = match?.[1] ?? "";
    expect(SPECS["release-readiness.md"]).toContain(command);
    expect(SPECS["release-readiness.md"]).toMatch(
      /review row (alone|is not enough|cannot stand in)|not (enough|sufficient) to (undraft|stand in)/i,
    );
    expect(CONDUCTOR_WRITES).toContain(command);
    expect(CONDUCTOR_WRITES).toContain("[addressed !N]");
  });
});

describe("interrupted execute recovery", () => {
  test("auto recovers executing instead of only waiting while the build runs", () => {
    const executing = AUTO.split("\n").find((line) => line.startsWith("| `[executing]`"));
    expect(executing).toBeTruthy();
    expect(executing).toMatch(/matching.*merge request|matching open MR/i);
    expect(executing).toMatch(/review/i);
    expect(executing).toMatch(/interrupt/i);
    expect(executing).toMatch(/continuous authorization/i);
    expect(executing).toMatch(/live owner|still builds|still running/i);
  });

  test("resume records a matching merge request iid and proceeds to review", () => {
    const entryB = section(ENTRIES, "## Entry B — Resume");
    expect(entryB).toMatch(/\[executing\]/);
    expect(entryB).toMatch(/matching.*merge request|matching open MR/i);
    expect(entryB).toMatch(/record.*iid|records the iid/i);
    expect(entryB).toMatch(/review/i);
  });

  test("an interrupted execute stop offers the execute-resume command", () => {
    expect(`${SKILL}\n${AUTO}`).toContain("/delivery execute <KEY>");
    expect(ENTRIES).toMatch(/interrupt/i);
    expect(section(SKILL, "## Phase 0 — Entry detection")).toContain(
      "recover first as its\n**Executing recovery** says",
    );
    expect(section(ENTRIES, "## Entry B — Resume")).toMatch(
      /does not run execute|must not start execute|not start execute/i,
    );
  });

  test("typing execute remains the approval to build after an interrupted stop", () => {
    expect(ENTRIES).toMatch(/Typing this verb is the approval to build/);
    expect(AUTO).toMatch(/Never retry a failed stage/);
  });
});

describe("normalized forge commands", () => {
  const genericDocs: [string, string][] = [
    ["delivery", SKILL],
    ["execute", EXECUTE],
    ["execute re-entry", EXECUTE_RE_ENTRY],
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
    expect(EXECUTE_RE_ENTRY).toContain(`${FORGE_PROVIDER} find`);
    expect(EXECUTE).toContain("`reference/re-entry.md`");
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
    expect(SPECS["setup.md"]).toContain("mcp-inventory.ts");
  });
});

describe("comments on an open change", () => {
  const readiness = SPECS["release-readiness.md"];
  const scoping = 'bun "${FACTORY_ROOT}/scripts/forge-comments.ts"';

  test("execute opens the draft change on the first satisfied holdout review, then checks back", () => {
    expect(EXECUTE).toMatch(
      /Open the change as soon as the first holdout review is satisfied, then check back on it/,
    );
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
    expect(pre).toContain(`${scoping} --change <read.json>`);
    expect(pre).toContain("<read-input.json> > <read.json>");
    expect(ADDRESS_COMMENTS).toContain(`${scoping} --change "<reviewDir>/find.json"`);
    expect(ADDRESS_COMMENTS).toContain('"<reviewDir>/find-input.json" > "<reviewDir>/find.json"');
    expect(pre).toMatch(/becomes a comment blocker in step 6/);
    const decide = section(readiness, "### 6. Decide");
    expect(decide).toMatch(/comment on the change is unanswered[\s\S]*comment\s+blocker/);
    expect(decide).toMatch(/never accepted as a\s+risk/);
    expect(readiness).toMatch(
      /\| Queues the change \| Read the comments on the change again first/,
    );
  });

  test("auto routes ready, no-go and go through the comment check", () => {
    const table = section(AUTO, "### Next step by status");
    const next = (tag: string) =>
      cells(table.split("\n").find((l) => l.startsWith(`| \`${tag}\``)) ?? "")[2];
    expect(next("[ready !N]")).toMatch(/reads the comments on the change before any GO/);
    expect(next("[no-go !N]")).toMatch(
      /unanswered comment on the change is a comment blocker, fixed in one batched round/,
    );
    expect(next("[go !N]")).toMatch(
      /Before landing, read the comments on the change again, then land it/,
    );
    expect(AUTO).toMatch(/never one round per\s+thread, and that round counts as one review round/);
  });

  test("address-comments batches open comments, replies as the operator, and never resolves", () => {
    expect(ADDRESS_COMMENTS).toMatch(
      /Every open comment on the change, from people or automated reviewers, is handled in this one round/,
    );
    expect(ADDRESS_COMMENTS).toMatch(/never one round per thread/);
    expect(ADDRESS_COMMENTS).toMatch(/forge identity of the operator running this skill/);
    expect(ADDRESS_COMMENTS).toMatch(
      /Never post as another person or through a separate bot account/,
    );
    expect(SKILL).toMatch(
      /After the MR opens, check back on it\. No GO, and no queueing, while a comment/,
    );
    expect(SKILL).toMatch(/threads are\s+never resolved/);
  });
});

describe("look-away metrics in retro", () => {
  const retro = SPECS["retro.md"];

  function lookAwayCommand(): string {
    const source = readFileSync(join(FACTORY_SCRIPTS, "look-away-metrics.ts"), "utf8");
    const match = source.match(/export const LOOK_AWAY_INVOCATION =\s*"([^"]+)"/);
    expect(match?.[1]).toBeTruthy();
    return match?.[1] ?? "";
  }

  function namesCommand(doc: string, command: string): boolean {
    const [script, ...args] = command.split(" ");
    const wrapped = (root: string) => `bun "${root}/${script}" ${args.join(" ")}`;
    return (
      doc.includes(command) ||
      doc.includes(wrapped("${FACTORY_ROOT}")) ||
      doc.includes(wrapped("$FACTORY_ROOT"))
    );
  }

  function measureHeading(): string {
    const heading = retro.split("\n").find((line) => /^### \d+\. Measure look-away$/.test(line));
    expect(heading).toBeTruthy();
    return heading ?? "";
  }

  function measureStep(): string {
    return section(retro, measureHeading());
  }

  function presentHeading(): string {
    const heading = retro.split("\n").find((line) => /^### \d+\. Present$/.test(line));
    expect(heading).toBeTruthy();
    return heading ?? "";
  }

  test("retro names the script's command as the script exports it, in a step before Present", () => {
    const command = lookAwayCommand();
    expect(command).toContain("look-away-metrics.ts");
    const step = measureStep();
    expect(namesCommand(step, command)).toBe(true);
    expect(retro.indexOf(measureHeading())).toBeLessThan(retro.indexOf(presentHeading()));
  });

  test("the step takes the state root and run id from the ledger found in Preconditions", () => {
    const step = measureStep();
    expect(step).toMatch(/state root/i);
    expect(step).toMatch(/run id/i);
    expect(step).toMatch(/ledger/i);
  });

  test("the step presents each number in plain words and names the outcomes that are not numbers", () => {
    const step = measureStep();
    expect(step).toMatch(/at the same time|at once/i);
    expect(step).toMatch(/stops by stage|by stage/i);
    expect(step).toMatch(/hours and minutes/i);
    expect(step).toMatch(/includes[^.]*waiting/i);
    expect(step).toMatch(/\braise\b/i);
    expect(step).toMatch(/\bhold\b/i);
    expect(step).toMatch(/limit the run used/i);
    expect(step).toMatch(/limit configured now/i);
    expect(step).toMatch(/unknown/i);
    expect(step).toMatch(/at least/i);
    expect(step).toMatch(/unreadable lines?/i);
    expect(step).toMatch(/unreadable journals?/i);
    expect(step).toMatch(/idle/i);
  });

  test("the step does not tell the model to print the report's field names", () => {
    for (const field of [
      "byStage",
      "longestStretch",
      "includesWaiting",
      "configuredLimit",
      "idleWorkers",
    ]) {
      expect([field, retro.includes(field)]).toEqual([field, false]);
    }
    expect(retro).not.toMatch(/`unreadable`|"unreadable"|\.unreadable\b/);
  });

  test("the figures cover the whole run, and a single-ticket retro shows them the same way and says so", () => {
    const step = measureStep();
    expect(step).toMatch(/whole run/i);
    expect(step).toMatch(/single[- ]ticket|one[- ]ticket|single ticket/i);
    expect(step).toMatch(/says so|say so|states? (?:this|that)|tells? the operator/i);
  });

  test("a failing script reports the figures as not measured, estimates nothing, and the retro goes on", () => {
    const step = measureStep();
    expect(step).toMatch(/fails/i);
    expect(step).toMatch(/not measured/i);
    expect(step).toMatch(/estimat/i);
    expect(step).toMatch(/message/i);
    expect(step).toMatch(/carr(?:y|ies) on|continues?|goes on|go on/i);
  });

  test("the suggestion is advice: no setting changes, no work item, no checkpoint, in either mode", () => {
    const text = `${measureStep()}\n${section(retro, "## Never")}`;
    expect(text).toMatch(/no setting|not change any setting|never changes? (?:any )?setting/i);
    expect(text).toMatch(/no work item|not create a work item|never create a work item/i);
    expect(text).toMatch(/no (?:added )?checkpoint|not add a checkpoint|never add a checkpoint/i);
    expect(text).toMatch(/single-step/i);
    expect(text).toMatch(/continuous/i);
  });

  test("the Present step shows the measurement ahead of the proposals", () => {
    const present = section(retro, presentHeading());
    const measurement = present.search(/look-away|measure|figures/i);
    expect(measurement).toBeGreaterThanOrEqual(0);
    expect(measurement).toBeLessThan(present.search(/proposals/i));
  });

  test("every earlier Never rule is still there", () => {
    const never = section(retro, "## Never");
    for (const rule of [
      "Edit delivery, the factory, review standards, contributor rules, or the",
      "Treat acceptance of a retro proposal as approval to install an improvement.",
      "Create work items. Write the text; the operator creates them.",
      "Attribute a mistake to a person. Classes describe the environment.",
      "Propose a check you cannot show would have failed on a real past case.",
    ]) {
      expect([rule, never.includes(rule)]).toEqual([rule, true]);
    }
  });

  checkoutOnly("the reference page", () => {
    test("lists the script's command beside the other factory scripts", () => {
      const reference = readFileSync(join(PACK_ROOT, "docs", "reference.md"), "utf8");
      expect(namesCommand(section(reference, "## Cost-control scripts"), lookAwayCommand())).toBe(
        true,
      );
    });
  });
});

describe("needs-validation acknowledgement in the delivery pages", () => {
  const flat = (text: string) => text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");

  function constant(file: string, name: string): string {
    const source = readFileSync(join(FACTORY_SCRIPTS, file), "utf8");
    const match = source.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`));
    expect(match?.[1]).toBeTruthy();
    return match?.[1] ?? "";
  }

  const phrase = () => constant("needs-validation.ts", "NEEDS_VALIDATION_ACK_PHRASE");
  const invocation = () => constant("needs-validation.ts", "NEEDS_VALIDATION_CHECK_INVOCATION");

  function around(doc: string, needle: string, radius = 700): string {
    const windows: string[] = [];
    let from = doc.indexOf(needle);
    while (from !== -1) {
      windows.push(doc.slice(Math.max(0, from - radius), from + needle.length + radius));
      from = doc.indexOf(needle, from + 1);
    }
    return windows.join("\n");
  }

  function approvalsRules(): string {
    const start = LEDGER.lastIndexOf("\n## Approvals");
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = LEDGER.slice(start + 1);
    const next = rest.indexOf("\n## ", 5);
    return next === -1 ? rest : rest.slice(0, next);
  }

  function namesCommand(doc: string, command: string): boolean {
    const [script, ...args] = command.split(" ");
    const wrapped = (root: string) => `bun "${root}/${script}" ${args.join(" ")}`;
    return (
      doc.includes(command) ||
      doc.includes(wrapped("${FACTORY_ROOT}")) ||
      doc.includes(wrapped("$FACTORY_ROOT"))
    );
  }

  test("the ledger page's Approvals rules carry the phrase and the line template from the code", () => {
    const rules = approvalsRules();
    const time = constant("ledger-store.ts", "LEDGER_TIME_FORMAT");
    expect(rules).toContain(phrase());
    expect(rules).toContain(`- <${time}> !<iid> — ${phrase()} <id> — <who> — "<operator's words>"`);
  });

  test("the ledger page says the scope is the merge request and not a head", () => {
    const window = flat(around(approvalsRules(), phrase()));
    expect(window).toMatch(/scope is the (merge request|MR)|scoped to the (merge request|MR)/i);
    expect(window).toMatch(
      /not a head|never a head|no head|not scoped to a head|not to a head|without a head/i,
    );
  });

  test("the ledger page says continuous delivery never authorizes an acknowledgement", () => {
    const window = flat(around(approvalsRules(), phrase()));
    expect(window).toMatch(
      /continuous-delivery: yes[^.]{0,80}never authori[sz]es (it|an acknowledgement|acknowledging|a needs-validation)/i,
    );
  });

  for (const [name, doc] of [
    ["the conductor's ledger writes", () => CONDUCTOR_WRITES],
    ["the ledger page", () => LEDGER],
    ["the auto workflow", () => AUTO],
  ] as const) {
    test(`${name} says a worker never writes the phrase or reads the run ledger for this gate`, () => {
      const text = doc();
      expect(text).toContain(phrase());
      const window = flat(around(text, phrase(), 900));
      expect(window).toMatch(/worker/i);
      expect(window).toMatch(/never writes?|does not write|must not write/i);
      expect(window).toMatch(
        /(never|not|no)[^.]{0,60}reads?[^.]{0,60}(run )?ledger|reads? no (run )?ledger/i,
      );
      expect(window).toMatch(/coordinator/i);
    });
  }

  test("the coordinator is told never to copy a line with the phrase out of a worker journal", () => {
    const windows = [SKILL, LEDGER, AUTO].map((doc) => flat(around(doc, phrase(), 900))).join("\n");
    expect(windows).toMatch(/(never|not) cop(y|ies)|does not copy|must not copy/i);
    expect(windows).toMatch(/journal/i);
  });

  test("auto routes an open item to the operator and names the acknowledgement classification", () => {
    const row = section(AUTO, "### Next step by status")
      .split("\n")
      .find((line) => line.includes("`[no-go !N]`"));
    expect(row).toBeTruthy();
    expect(row).toMatch(/needs-validation/i);
    expect(row).toMatch(/acknowledg/i);
    expect(row).toMatch(/operator/i);
    expect(AUTO).toContain("`acknowledgement`");
  });

  test("auto takes the classification from exit 1 of the command, once no other blocker remains", () => {
    expect(namesCommand(AUTO, invocation())).toBe(true);
    const window = flat(around(AUTO, "`acknowledgement`", 900));
    expect(window).toMatch(/exit 1/i);
    expect(window).toMatch(/no other blocker|only reason|only blocker|nothing else/i);
    expect(window).toMatch(/address/i);
  });

  test("auto asks the operator and does not run address-comments for an open item", () => {
    const window = flat(around(AUTO, "`acknowledgement`", 900));
    expect(window).toMatch(
      /(never|not|no)[^.]{0,100}address-comments|address-comments[^.]{0,100}(never|not)/i,
    );
    expect(flat(AUTO)).toMatch(/acknowledg(e|ing) a fact to confirm/i);
  });

  test("auto says a needs-validation item is not cleared by risk acceptance or continuous delivery", () => {
    const window = flat(around(AUTO, "needs-validation", 900));
    expect(window).toMatch(/risk acceptance/i);
    expect(window).toMatch(/continuous-delivery: yes|continuous delivery/i);
  });
});

describe("review memory in the review skills", () => {
  const flat = (text: string) => text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");
  const adjudication = () => section(CODE_REVIEW_MAX, "## Adjudicate every candidate");
  const standardMode = () => {
    const start = CODE_REVIEW_MAX.indexOf("- `standard`");
    const end = CODE_REVIEW_MAX.indexOf("- `main`");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(CODE_REVIEW_MAX.slice(start, end)).toContain("reference/standard-adjudication.md");
    return flat(CODE_REVIEW_MAX_STANDARD);
  };

  test("every candidate gets an id, the ids go into the candidate file with the severities, and the filter never removes a candidate", () => {
    const text = adjudication();
    expect(flat(text)).toMatch(/(give|gives|assign|assigns)[^.]{0,40}every candidate an id/i);
    expect(text).toMatch(/\{"candidates":\[\{"id":"c1","severity":"Low"\}/);
    expect(flat(text)).toMatch(/(does not|do not|never|not)[^.]{0,30}remove a candidate/i);
    expect(flat(text)).toMatch(/filter/i);
  });

  test("a numbered step before any cited code is read compares a remembered rejection by behaviour and trigger", () => {
    const text = adjudication();
    const comparison = text.indexOf("\n0. ");
    const reading = text.indexOf("\n1. Read the cited code");
    expect(comparison).toBeGreaterThan(-1);
    expect(comparison).toBeLessThan(reading);
    expect(text.slice(comparison, reading)).toContain("reference/review-memory.md");
    const step = flat(
      section(CODE_REVIEW_MAX_MEMORY, "## Step 0: a candidate at a remembered rejection"),
    );
    expect(step).toContain("prior-rejection-at-location");
    expect(step).toMatch(/behaviou?r and (the )?trigger/i);
    expect(step).toMatch(/without re-investigating/i);
    expect(step).toContain("droppedAsPreviouslyDisproved");
    expect(step).toMatch(/\bfresh/i);
    expect(step).toMatch(/\bunsure\b|not sure|cannot tell/i);
  });

  test("the recording rule says what is recorded, what is not, and how guards bound it", () => {
    expect(CODE_REVIEW_MAX).toContain("reference/review-memory.md");
    const text = flat(CODE_REVIEW_MAX_MEMORY);
    const rule = text.match(/(?:never|do not|must not|does not) record[\s\S]{0,700}/i)?.[0] ?? "";
    expect(rule).not.toBe("");
    expect(rule).toMatch(/duplicate/i);
    expect(rule).toMatch(/already raised|discussions/i);
    expect(rule).toMatch(/downgrad/i);
    expect(rule).toMatch(/name,? (or )?comment|rests only on a name/i);
    expect(rule).toMatch(/style/i);
    expect(rule).toMatch(/previously disproved/i);
    expect(text).toMatch(/reproduction/i);
    expect(text).toMatch(
      /trigger[^.]{0,60}cannot (occur|happen)|cannot be triggered|impossible trigger/i,
    );
    expect(text).toMatch(/guards?/i);
    expect(text).toMatch(/(up to|at most) 3/i);
    expect(text).toMatch(/more than 3/i);
    expect(text).toMatch(/runtime configuration/i);
  });

  test("a reversal names the candidate and the remembered rejection, and a different claim reverses nothing", () => {
    const text = flat(CODE_REVIEW_MAX_MEMORY);
    const reversal = text.match(/reversed[\s\S]{0,700}/i)?.[0] ?? "";
    expect(reversal).toMatch(/same claim/i);
    expect(reversal).toMatch(/\bref/i);
    expect(text).toMatch(/revers(e|es) nothing/i);
  });

  test("the standard mode paragraph defines the subagent's return and who writes the outcome", () => {
    const paragraph = standardMode();
    expect(paragraph).toMatch(/JSON object/i);
    expect(paragraph).toContain("findings");
    expect(paragraph).toContain("outcome");
    expect(paragraph).toContain("memory-outcome.json");
    expect(paragraph).toMatch(/record/i);
    expect(paragraph).toMatch(/neither|(does|do) not (write|run)|never (write|run)/i);
    expect(paragraph).toMatch(/missing|refused|no such object/i);
    expect(paragraph).toMatch(/\bmain\b/i);
  });

  test("a refused outcome is recovered from in the review, except an unusable file or repository", () => {
    expect(flat(CODE_REVIEW_MAX)).toMatch(/exit (of )?1[^.]{0,80}stops? the review/i);
    expect(flat(CODE_REVIEW_MAX)).toMatch(/exit (of )?3[^.]{0,120}review-memory\.md/i);
    const text = flat(CODE_REVIEW_MAX_MEMORY);
    expect(text).toMatch(/exit (of )?3/i);
    expect(text).toMatch(/names every refused item/i);
    expect(text).toMatch(/correct/i);
    expect(text).toMatch(/still refused/i);
    expect(text).toMatch(/not remembered/i);
    expect(text).toMatch(/judged (afresh|fresh|again)/i);
    expect(text).toMatch(/how many items/i);
    expect(text).toMatch(/exit (of )?1[^.]{0,80}stops? the review/i);
  });

  test("the output template has the dropped list between the findings and the verification, and says when it is left out", () => {
    const output = section(CODE_REVIEW_MAX, "## Output");
    const findings = output.indexOf("### Findings");
    const dropped = output.indexOf("### Previously disproved");
    const verification = output.indexOf("### Verification");
    expect(findings).toBeGreaterThan(-1);
    expect(dropped).toBeGreaterThan(findings);
    expect(dropped).toBeLessThan(verification);
    expect(flat(output)).toMatch(
      /(omit|leave out|left out)[^.]{0,80}Previously disproved|Previously disproved[^.]{0,120}(omit|left out|empty|nothing)/i,
    );
  });

  test("a review whose every candidate was dropped still reports the list, and the none mode has no list", () => {
    expect(section(CODE_REVIEW_MAX, "## Output")).toContain("reference/review-memory.md");
    const text = flat(CODE_REVIEW_MAX_MEMORY);
    expect(text).toMatch(/every candidate[^.]{0,120}previously disproved/i);
    expect(text).toMatch(/No findings\.[^.]{0,200}PASS|PASS[^.]{0,200}No findings\./);
    expect(text).toMatch(
      /\bnone\b[^.]{0,200}(no (such )?list|no candidates)|no (such )?list[^.]{0,200}\bnone\b/i,
    );
  });

  test("the delta paragraph hides the dropped list from the lenses and does not carry it forward", () => {
    expect(section(CODE_REVIEW_MAX, "## Scope this round")).toContain("reference/later-rounds.md");
    const text = flat(section(CODE_REVIEW_MAX_LATER_ROUNDS, "## Delta scope"));
    expect(text).toContain("earlier-review.md");
    expect(text).toMatch(/without[^.]{0,40}### Previously disproved/i);
    expect(text).toMatch(/nothing[^.]{0,80}but[^.]{0,40}finding/i);
    expect(text).toMatch(/Earlier findings[^.]{0,80}findings only|findings only/i);
    expect(text).toMatch(/(not|never) (copied|carried)/i);
  });

  test("the second pass treats the dropped list as context and never publishes or counts it", () => {
    const text = flat(section(MR_REVIEW, "## Phase 5 — Consolidate both passes"));
    expect(text).toContain("Previously disproved");
    expect(text).toMatch(/context/i);
    expect(text).toMatch(/not a finding/i);
    expect(text).toMatch(/not carried|not be carried/i);
    expect(text).toMatch(/posted/i);
    expect(text).toMatch(/counted/i);
    expect(text).toContain("summary.md");
    expect(text).toMatch(/own (finding|evidence)/i);
  });
});
