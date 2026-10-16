import { describe, expect, test } from "bun:test";
import {
  checkCapabilities,
  type CapabilityProbes,
  type ProbeResult,
} from "./capabilities";

const CAPABILITIES = [
  "Stage specs",
  "Factory",
  "Review commands",
  "Forge",
  "Tracker",
  "OpenSpec",
  "Deployed environment",
  "Skill evaluation",
] as const;

const TRACKER_ITEM = { key: "MDF-2101" };

function passingResult(name: string): ProbeResult {
  if (name === "Tracker") return { ok: true, ticket: TRACKER_ITEM };
  return { ok: true };
}

function recordingProbes(
  overrides: Partial<Record<(typeof CAPABILITIES)[number], () => ProbeResult>> = {},
): { probes: CapabilityProbes; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const probes: CapabilityProbes = {};
  for (const name of CAPABILITIES) {
    probes[name] = () => {
      calls[name] = (calls[name] ?? 0) + 1;
      const override = overrides[name];
      return override ? override() : passingResult(name);
    };
  }
  return { probes, calls };
}

describe("checkCapabilities", () => {
  test("later-stage failures do not block draft and those probes do not run", () => {
    const { probes, calls } = recordingProbes({
      "Deployed environment": () => ({ ok: false }),
      "Skill evaluation": () => ({ ok: false }),
    });

    const result = checkCapabilities("draft", probes);

    expect(result.stop).toBeNull();
    expect(calls["Deployed environment"] ?? 0).toBe(0);
    expect(calls["Skill evaluation"] ?? 0).toBe(0);
    expect(result.results.map((row) => row.capability)).not.toContain(
      "Deployed environment",
    );
    expect(result.results.map((row) => row.capability)).not.toContain(
      "Skill evaluation",
    );
  });

  test("a failed capability the stage needs stops it and names capability, stages, and fix", () => {
    const { probes } = recordingProbes({
      Forge: () => ({ ok: false }),
    });

    const result = checkCapabilities("draft", probes);

    expect(result.stop).toEqual({
      capability: "Forge",
      blockedStages: [
        "draft",
        "execute",
        "address",
        "review",
        "ship",
        "archive",
        "verify",
        "auto",
      ],
      fix: "Configure the forge provider advertised by the runtime",
    });
  });

  test("a failed tracker read stops a stage that needs the tracker", () => {
    const { probes } = recordingProbes({
      Tracker: () => ({ ok: false }),
    });

    const result = checkCapabilities("draft", probes);

    expect(result.stop).not.toBeNull();
    expect(result.stop?.capability).toBe("Tracker");
    expect(result.stop?.blockedStages).toEqual([
      "triage",
      "draft",
      "discover",
      "retro",
    ]);
    expect(result.stop?.fix).toBe(
      "Configure the tracker provider advertised by the runtime",
    );
  });

  test("a tracker probe that returns no work item stops instead of reporting success", () => {
    const { probes, calls } = recordingProbes({
      Tracker: () => ({ ok: true }),
    });

    const result = checkCapabilities("draft", probes);

    expect(calls.Tracker).toBe(1);
    expect(result.stop).not.toBeNull();
    expect(result.stop?.capability).toBe("Tracker");
  });

  test("the tracker probe is called exactly once when the stage needs the tracker", () => {
    const { probes, calls } = recordingProbes();

    const result = checkCapabilities("draft", probes);

    expect(result.stop).toBeNull();
    expect(calls.Tracker).toBe(1);
  });

  test("a recording runner checks again at each stage boundary", () => {
    const { probes, calls } = recordingProbes();

    const draft = checkCapabilities("draft", probes);
    expect(draft.stop).toBeNull();
    expect(calls.Forge).toBe(1);
    expect(calls.Tracker).toBe(1);
    expect(calls["Deployed environment"] ?? 0).toBe(0);

    const verify = checkCapabilities("verify", probes);
    expect(verify.stop).toBeNull();
    expect(calls.Forge).toBe(2);
    expect(calls.Tracker).toBe(1);
    expect(calls["Deployed environment"]).toBe(1);
    expect(verify.results.map((row) => row.capability)).toContain(
      "Deployed environment",
    );
    expect(verify.results.map((row) => row.capability)).not.toContain("Tracker");
  });
});
