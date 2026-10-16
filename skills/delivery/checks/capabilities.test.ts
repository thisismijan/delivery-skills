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
  "GitLab",
  "Jira",
  "OpenSpec",
  "Deployed environment",
  "Skill evaluation",
] as const;

const JIRA_TICKET = { key: "MDF-2101" };

function passingResult(name: string): ProbeResult {
  if (name === "Jira") return { ok: true, ticket: JIRA_TICKET };
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
      GitLab: () => ({ ok: false }),
    });

    const result = checkCapabilities("draft", probes);

    expect(result.stop).toEqual({
      capability: "GitLab",
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
      fix: "Cloud: add a `GITLAB_TOKEN` secret. Mac: `glab auth login`",
    });
  });

  test("a failed Jira read stops a stage that needs Jira", () => {
    const { probes } = recordingProbes({
      Jira: () => ({ ok: false }),
    });

    const result = checkCapabilities("draft", probes);

    expect(result.stop).not.toBeNull();
    expect(result.stop?.capability).toBe("Jira");
    expect(result.stop?.blockedStages).toEqual([
      "triage",
      "draft",
      "discover",
      "retro",
    ]);
    expect(result.stop?.fix).toBe(
      "Reconnect Atlassian under Cursor's Integrations",
    );
  });

  test("a Jira probe that returns no ticket stops instead of reporting success", () => {
    const { probes, calls } = recordingProbes({
      Jira: () => ({ ok: true }),
    });

    const result = checkCapabilities("draft", probes);

    expect(calls.Jira).toBe(1);
    expect(result.stop).not.toBeNull();
    expect(result.stop?.capability).toBe("Jira");
  });

  test("the Jira probe is called exactly once when the stage needs Jira", () => {
    const { probes, calls } = recordingProbes();

    const result = checkCapabilities("draft", probes);

    expect(result.stop).toBeNull();
    expect(calls.Jira).toBe(1);
  });

  test("a recording runner checks again at each stage boundary", () => {
    const { probes, calls } = recordingProbes();

    const draft = checkCapabilities("draft", probes);
    expect(draft.stop).toBeNull();
    expect(calls.GitLab).toBe(1);
    expect(calls.Jira).toBe(1);
    expect(calls["Deployed environment"] ?? 0).toBe(0);

    const verify = checkCapabilities("verify", probes);
    expect(verify.stop).toBeNull();
    expect(calls.GitLab).toBe(2);
    expect(calls.Jira).toBe(1);
    expect(calls["Deployed environment"]).toBe(1);
    expect(verify.results.map((row) => row.capability)).toContain(
      "Deployed environment",
    );
    expect(verify.results.map((row) => row.capability)).not.toContain("Jira");
  });
});
