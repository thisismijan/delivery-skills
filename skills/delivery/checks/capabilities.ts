import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ProbeResult = {
  ok: boolean;
  ticket?: { key: string } | null;
};

export type CapabilityProbes = Record<string, () => ProbeResult>;

export type CapabilityStop = {
  capability: string;
  blockedStages: string[];
  fix: string;
};

export type CapabilityResult = {
  capability: string;
  ok: boolean;
};

export type CapabilityCheck = {
  stop: CapabilityStop | null;
  results: CapabilityResult[];
};

type CapabilityRow = {
  name: string;
  neededBy: string;
  fix: string;
};

const ROOT = process.env.DELIVERY_SKILL_ROOT ?? join(import.meta.dir, "..");
const SKILL_PATH = existsSync(join(ROOT, "SKILL.md"))
  ? join(ROOT, "SKILL.md")
  : join(ROOT, "delivery-SKILL.proposed.md");

const CURRENT_STAGE = "The stage that reads it";

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

function capabilityTable(skill = readFileSync(SKILL_PATH, "utf8")): CapabilityRow[] {
  return section(skill, "## Capabilities")
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("| ") &&
        !line.startsWith("| Capability") &&
        !line.startsWith("|---"),
    )
    .map(cells)
    .map((row) => ({
      name: row[1] ?? "",
      neededBy: row[3] ?? "",
      fix: row[4] ?? "",
    }))
    .filter((row) => row.name.length > 0);
}

function blockedStages(neededBy: string): string[] {
  if (neededBy === CURRENT_STAGE) return [CURRENT_STAGE];
  return neededBy
    .split(",")
    .map((stage) => stage.trim())
    .filter((stage) => stage.length > 0);
}

function neededForStage(neededBy: string, stage: string): boolean {
  if (neededBy === CURRENT_STAGE) return true;
  return blockedStages(neededBy).includes(stage);
}

function probeOk(name: string, result: ProbeResult | undefined, called: boolean): boolean {
  if (!called || result === undefined) return false;
  if (name === "Tracker") {
    const key = result.ticket?.key?.trim() ?? "";
    return result.ok === true && key.length > 0;
  }
  return result.ok === true;
}

export function checkCapabilities(
  stage: string,
  probes: CapabilityProbes,
): CapabilityCheck {
  const results: CapabilityResult[] = [];
  let stop: CapabilityStop | null = null;

  for (const row of capabilityTable()) {
    if (!neededForStage(row.neededBy, stage)) continue;
    const probe = probes[row.name];
    const called = typeof probe === "function";
    const outcome = called ? probe() : undefined;
    const ok = probeOk(row.name, outcome, called);
    results.push({ capability: row.name, ok });
    if (!ok && stop === null) {
      stop = {
        capability: row.name,
        blockedStages: blockedStages(row.neededBy),
        fix: row.fix,
      };
    }
  }

  return { stop, results };
}
