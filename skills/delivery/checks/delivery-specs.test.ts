import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

setDefaultTimeout(60_000);

const ROOT = process.env.DELIVERY_SKILL_ROOT ?? join(import.meta.dir, "..");
const SKILLS_ROOT = process.env.DELIVERY_SKILLS_ROOT ?? join(import.meta.dir, "..", "..");
const HISTORICAL_INDEPENDENCE = process.env.DELIVERY_HISTORICAL_INDEPENDENCE === "1";
const SKILL_PATH = existsSync(join(ROOT, "SKILL.md")) ? join(ROOT, "SKILL.md") : join(ROOT, "delivery-SKILL.proposed.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");
const WORKFLOWS = join(ROOT, "workflows");
const LEDGER = readFileSync(join(WORKFLOWS, "delivery-ledger.md"), "utf8");
const AUTO = readFileSync(join(WORKFLOWS, "auto.md"), "utf8");
const CODE_REVIEW_MAX = readFileSync(join(SKILLS_ROOT, "code-review-max", "SKILL.md"), "utf8");
const MR_REVIEW = readFileSync(join(SKILLS_ROOT, "mr-review", "SKILL.md"), "utf8");
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
    ["MDF-1234", "Single ticket"],
    ["SMAI-740", "Single ticket"],
    ["740", "Review only"],
    ["740 MDF-12", "Review only with Jira key"],
    ["MDF-12 740", "Review only with Jira key"],
    ["discover a cost dashboard for job runs", "Discovery"],
    ["discover discover-2026-10-13-cost-dashboard", "Discovery"],
    ["triage MDF-2100", "Bug intake"],
    ["ship 740", "Release readiness"],
    ["verify 740", "Post-merge verify"],
    ["retro MDF-2000", "Retro (ticket or epic)"],
    ["improve", "Improvement"],
    ["improve MDF-2000", "Improvement"],
    ["improve all", "Improvement"],
    ["improve status", "Improvement"],
    ["improve apply improve-20261015-missing-rollback", "Improvement decision"],
    ["improve reject improve-20261015-missing-rollback", "Improvement decision"],
    ["improve rollback 20261015-abc123", "Improvement decision"],
    ["status", "Catch-up"],
    ["status MDF-2000", "Catch-up"],
    ["  MDF-1234  ", "Single ticket"],
    ["Add per-job cost limits to the factory", "Full epic"],
    ["status of the cost work", "Full epic"],
    ["docs/stories/F5-4-port-igspec-gates.md", "Full epic"],
    ["", "Help"],
    ["help", "Help"],
    ["auto", "Auto"],
    ["auto Add a spend-by-repository panel to the costs page", "Auto"],
    ["auto MDF-2000", "Auto"],
    ["auto 740", "Auto"],
    ["automate the cost alerts", "Full epic"],
    ["auto-scaling for job runners", "Full epic"],
    ["groom Add a spend-by-repository panel to the costs page", "Groom"],
    ["groom docs/stories/F5-4-port-igspec-gates.md", "Groom"],
    ["draft MDF-2101", "Draft"],
    ["draft a plan for the costs page", "Full epic"],
    ["execute MDF-2101", "Execute"],
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
    const bare = Math.min(entries.indexOf("Single ticket"), entries.indexOf("Review only"));
    const verbs = entries.slice(0, bare);
    expect(verbs).toContain("Auto");
    expect(verbs).toContain("Archive");
    expect(entries.slice(bare).every((e) => e.startsWith("Single ticket") || e.startsWith("Review only"))).toBe(true);
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
    "/code-review max !<iid>",
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
    expect(SKILL).toContain("\ndisable-model-invocation: true\n");
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

const STATUS_TAG = /`(\[(?:discovering|triage|groomed|drafted|executing|ready|go|no-go|merged|verified|regressed|retro|stopped|waiting)[^`]*\])`/g;

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

  test("the operator is asked for the merge and the archive", () => {
    const asks = (tag: string) => cells(rows.find((l) => l.startsWith(`| \`${tag}\``)) ?? "")[3];
    expect(asks("[go !N]")).toBe("The merge");
    expect(asks("[merged !N]")).toBe("The archive");
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
    expect(rows.map((r) => r[1])).toEqual(["Stage specs", "Factory", "Review commands", "GitLab", "Jira", "OpenSpec", "Deployed environment", "Skill evaluation"]);
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
    const jira = rows.find((r) => r[1] === "Jira") ?? [];
    expect(jira[2]).toContain("real ticket read");
    expect(jira[2].toLowerCase()).toMatch(/no ticket|failed/);
  });

  test("Cursor uses the stamped max skill and its lightweight review never stands in", () => {
    const review = rows.find((r) => r[1] === "Review commands") ?? [];
    expect(review[2]).toContain("`/code-review-max` and `/mr-review` are available");
    expect(review[2]).toContain("Cursor's lightweight `/code-review` does not count");
  });

  test("a merged-results pipeline counts for the head it merged", () => {
    const readiness = SPECS["release-readiness.md"];
    expect(readiness).toContain("`head_pipeline.sha` equals `sha`");
    expect(readiness).toContain("merged-results commit whose second parent is `sha`");
    expect(readiness).toContain("A pipeline that belongs to an older head does not count.");
  });

  test("the readiness workflow states the fail-closed rule", () => {
    const readiness = SPECS["release-readiness.md"];
    const lenses = section(readiness, "### 3. Run the lenses");
    const decide = section(readiness, "### 6. Decide");
    const brief = section(readiness, "### 7. Write the brief");
    expect(lenses).not.toMatch(/proof of concept or it is downgraded/i);
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
    expect(waiting).toMatch(/read\s+`head_pipeline` from `glab mr view <iid> --output json`, not the branch's\s+pipeline/);
    expect(waiting).not.toContain("glab ci status --branch <branch>");
  });

  test("a cloud run never opens a second merge request", () => {
    expect(section(SKILL, "## One merge request")).toContain("Never open a second one for the same change");
  });
});

describe("hard rules survive", () => {
  const rules = [
    "Never `glab mr merge`",
    "never create Jira issues",
    "never transition Jira status",
    "never auto-spawn worktrees or agents",
    "Never substitute another review skill",
    "Cursor's lightweight `/code-review` is **out of this chain**",
    "Fail closed with the stage's failure modes",
    "The delivery skill changes only through `improve.md`",
    "`/openspec-archive` runs only through `/delivery archive` or auto's archive\n  question, after the MR is merged, with the operator's yes for that change.",
  ];
  for (const rule of rules) {
    test(`the skill keeps: ${rule.split("\n")[0]}`, () => {
      expect(SKILL).toContain(rule);
    });
  }

  test("auto forbids what the conductor forbids", () => {
    const never = section(AUTO, "## Never");
    for (const phrase of ["Merge", "Create, transition", "Spawn worktrees or agents", "Archive without a yes", "Retry a failed stage", "Skip a stage's own gate", "Install or rollback"]) {
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
    expect(SPECS["NOTES.md"]).toContain(CANDIDATES);
    expect(SPECS["NOTES.md"]).toContain(VERSIONS);
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

  test("retro acceptance cannot install a candidate", () => {
    expect(retro).toContain("Accepting a proposal approves investigation, not a patch and not installation.");
    expect(improve).toContain("Retro acceptance is not installation approval.");
    expect(AUTO).toContain("`/delivery auto` never answers\nthat checkpoint.");
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
		expect(policy).toContain(".delivery/routing/");
		expect(policy).toContain("90 percent");
		expect(policy).toContain("never dispatched");
		expect(policy).toContain("select-model.ts");
		expect(policy).toContain("model-catalogue.ts");
		expect(policy).toContain("Muse Wonder");
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

  test("human gates split background runs", () => {
    expect(policy).toContain("Never put two sides of a human gate into one background");
    expect(policy).toContain("workflow agents cannot take mid-run operator input");
  });

  test("Claude workflows are optional and Cursor keeps a native path", () => {
    expect(policy).toContain("Cursor uses its native subagents.");
    expect(policy).toContain("must not depend on a Claude-only workflow");
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
    const installer = readFileSync(join(packRoot, "install.sh"), "utf8");
    expect(installer).toContain('hosts+=(cursor claude store)');
    expect(installer).toContain("Agent store skipped (not writable here)");
    expect(installer).toContain('elif [[ "$store" == /cursor/* ]]');
    expect(installer).toContain("store_probe=/cursor");
    expect(readme).toContain("On a Mac it skips `/cursor` instead of failing");
  });

  test("the README SDLC names every stage skill and every human gate", () => {
    expect(readme).toContain("```mermaid");
    expect(readme).toContain("flowchart TD");
    for (const node of [
      "groom",
      "draft",
      "Test-seam checkpoint",
      "execute",
      "Reconcile MR, tests, gates, dirty tree",
      "code-review-max or native code-review max",
      "mr-review",
      "address-comments",
      "Human merges",
      "archive",
      "improve",
      "Operator apply, reject, or rollback",
    ]) {
      expect(readme).toContain(node);
    }
    expect(readme).toContain("Typing `/delivery execute` is the approval to build.");
  });

  test("the README describes runtime model inventory and shadow routing", () => {
    expect(readme).toContain("model-inventory.json");
    expect(readme).toContain("Muse Wonder");
    expect(readme).toContain("evaluation-only");
    expect(readme).toContain("90 percent");
    expect(readme).toContain("recorded, never dispatched");
    expect(readme).toContain("factory/model-catalogue.json");
  });


  test("factory skills and runtime ship beside the conductor", () => {
    for (const name of ["groom", "draft", "execute", "address-comments", "openspec-archive"]) {
      expect(existsSync(join(packRoot, "skills", name, "SKILL.md"))).toBe(true);
    }
    expect(existsSync(join(packRoot, "factory", "RUNTIME.md"))).toBe(true);
    expect(existsSync(join(packRoot, "factory", "scripts", "find-change.ts"))).toBe(true);
  });

  test("the conductor invokes pack skills, not the ig-spec plugin", () => {
    expect(section(SKILL, "### Single steps")).not.toContain("/ig-spec:");
    expect(SKILL).toContain("never `/ig-spec:*`");
    expect(SKILL).toContain("Do not load the ig-spec Claude plugin in the same session");
  });
});

describe("Cursor max review contract", () => {
  test("the skill is manually invoked and pins both refs", () => {
    expect(CODE_REVIEW_MAX).toContain("name: code-review-max");
    expect(CODE_REVIEW_MAX).toContain("disable-model-invocation: true");
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

  test("the handoff marker binds findings to an MR head", () => {
    const marker = "<!-- code-review-max:mr=<iid> head=<full-head-sha> -->";
    expect(CODE_REVIEW_MAX).toContain(marker);
    expect(MR_REVIEW).toContain(marker);
    expect(MR_REVIEW).toContain("must exactly match `gl-mr <iid> meta`");
  });

  test("mr-review accepts both max passes but rejects lightweight Cursor review", () => {
    expect(MR_REVIEW).toContain("Cursor `/code-review-max !<iid>` output");
    expect(MR_REVIEW).toContain("Claude Code's native `/code-review max !<iid>` output");
    expect(MR_REVIEW).toContain("Reject Cursor's lightweight `/code-review` output");
  });

  test("the correctness pass cannot publish or change code", () => {
    expect(CODE_REVIEW_MAX).toContain("Do not publish findings to GitLab.");
    expect(CODE_REVIEW_MAX).toContain("- Make code changes.");
    expect(CODE_REVIEW_MAX).toContain("- Post notes, approve, merge, or change Jira.");
  });
});
