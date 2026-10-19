import { expect, test } from "bun:test";
import {
	type DoctorReport,
	doctorReadiness,
	formatDoctorReport,
	formatDoctorVerdict,
	remoteProviderDoctorChecks,
	workItemDoctorCheck,
} from "./doctor";
import {
	defaultRuntimeManifest,
	overlayRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";

function report(partial: Pick<DoctorReport, "checks">): DoctorReport {
	return { checks: partial.checks, ...doctorReadiness(partial.checks) };
}

test("groups partial readiness without hiding the safe subset", () => {
	const output = formatDoctorReport(
		report({
			checks: [
				{
					category: "Ready now",
					name: "Runtime manifest",
					detail: "valid",
					required: true,
					ok: true,
				},
				{
					category: "Needs setup",
					name: "OpenSpec CLI",
					detail: "install OpenSpec before archive",
					required: false,
					ok: false,
				},
				{
					category: "Host limitation",
					name: "Mutation guard",
					detail: "mutating stages stay blocked",
					required: false,
					ok: false,
				},
				{
					category: "Human-owned",
					name: "Merge",
					detail: "requires explicit operator action",
					required: false,
					ok: true,
				},
			],
		}),
	);
	for (const heading of [
		"READY NOW",
		"NEEDS SETUP",
		"HOST LIMITATION",
		"HUMAN-OWNED",
	]) {
		expect(output).toContain(heading);
	}
	expect(output).toContain("Read-only lifecycle is available");
	expect(output).toContain("Mutating stages need a verified denial hook");
	expect(output).not.toContain("Read-only lifecycle is not ready");
});

test("doctor output contains remedies but no supplied secret", () => {
	const secret = "glpat-never-print-this";
	const output = formatDoctorReport(
		report({
			checks: [
				{
					category: "Needs setup",
					name: "GitLab credential",
					detail: "set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token",
					required: false,
					ok: false,
				},
			],
		}),
	);
	expect(output).toContain("GITLAB_TOKEN");
	expect(output).not.toContain(secret);
});

test("work-item diagnosis distinguishes confirmed and unavailable choices", () => {
	expect(
		workItemDoctorCheck({
			state: "ready",
			selection: {
				version: 1,
				provider: { id: "local-files", kind: "local-files" },
				confirmed: true,
			},
		}),
	).toMatchObject({
		category: "Ready now",
		detail: "local-files",
	});
	expect(
		workItemDoctorCheck({
			state: "unavailable",
			remedy: "configure jira or explicitly select another provider",
		}),
	).toMatchObject({
		category: "Needs setup",
		detail: "configure jira or explicitly select another provider",
	});
	expect(
		workItemDoctorCheck({
			state: "ready",
			selection: {
				version: 1,
				provider: { id: "jira", kind: "remote", settings: { project: "MDF" } },
				confirmed: true,
			},
		}),
	).toMatchObject({ category: "Ready now", detail: "jira (project=MDF)" });
});

test("generic runtime does not demand a GitLab tool", () => {
	const checks = remoteProviderDoctorChecks(
		defaultRuntimeManifest(true),
		{},
		() => null,
	);
	expect(checks.map((check) => check.name).join("\n")).not.toMatch(
		/gitlab-forge|GitLab credential/,
	);
	expect(checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "Forge and review", ok: false }),
			expect.objectContaining({ name: "Remote work items", ok: false }),
		]),
	);
});

test("GitHub runtime probes GitHub tools and credentials only", () => {
	const runtime = overlayRuntimeManifest(
		defaultRuntimeManifest(true),
		parseRuntimeManifest({
			version: 1,
			capabilities: {
				"forge.change": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/github-forge",
					provider: "github",
				},
				"review.publish": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/github-forge",
					provider: "github",
				},
				"tracker.item": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/github-tracker",
					provider: "github",
				},
			},
		}),
	);
	const names = remoteProviderDoctorChecks(
		runtime,
		{ GITHUB_TOKEN: "ghp-not-printed" },
		(name) => (name.startsWith("github-") ? `/bin/${name}` : null),
	).map((check) => `${check.ok ? "ok" : "need"} ${check.name}`);
	expect(names).toContain("ok github-forge");
	expect(names).toContain("ok github-tracker");
	expect(names).toContain("ok GitHub credential");
	expect(names.join("\n")).not.toMatch(/gitlab|jira/i);
});

test("mixed GitHub forge and Jira tracker probes both", () => {
	const runtime = overlayRuntimeManifest(
		defaultRuntimeManifest(true),
		parseRuntimeManifest({
			version: 1,
			capabilities: {
				"forge.change": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/github-forge",
					provider: "github",
				},
				"review.publish": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/github-forge",
					provider: "github",
				},
				"tracker.item": {
					available: true,
					mode: "adapter",
					invocation: "exec:/bin/jira-tracker",
					provider: "jira",
				},
			},
		}),
	);
	const checks = remoteProviderDoctorChecks(
		runtime,
		{
			GITHUB_TOKEN: "secret-github",
			JIRA_SITE: "https://example.atlassian.net",
			JIRA_EMAIL: "ops@example.com",
			JIRA_API_TOKEN: "secret-jira",
		},
		(name) => `/bin/${name}`,
	);
	const output = formatDoctorReport(report({ checks }));
	expect(output).toContain("github-forge");
	expect(output).toContain("jira-tracker");
	expect(output).toContain("GitHub credential");
	expect(output).toContain("Jira credential");
	expect(output).not.toContain("gitlab-forge");
	expect(output).not.toContain("secret-github");
	expect(output).not.toContain("secret-jira");
});

test("an unpinned bun does not fail read-only readiness", () => {
	const checks: DoctorReport["checks"] = [
		{
			category: "Needs setup",
			name: "Bun runtime",
			detail:
				'curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"; found 1.3.14',
			required: false,
			ok: false,
		},
		{
			category: "Ready now",
			name: "Runtime dependencies",
			detail: "installed",
			required: true,
			ok: true,
		},
		{
			category: "Host limitation",
			name: "Mutation guard",
			detail: "mutating stages stay blocked",
			required: false,
			ok: false,
		},
	];
	expect(doctorReadiness(checks)).toMatchObject({
		readOnlyReady: true,
		fullLifecycleReady: false,
	});
	expect(formatDoctorVerdict(report({ checks }))).toContain(
		"Read-only lifecycle is available",
	);
});

test("unresolved formatting hides ready and human-owned rows", () => {
	const output = formatDoctorReport(
		report({
			checks: [
				{
					category: "Ready now",
					name: "Runtime manifest",
					detail: "valid",
					required: true,
					ok: true,
				},
				{
					category: "Needs setup",
					name: "Bun runtime",
					detail: "install Bun 1.4.2",
					required: false,
					ok: false,
				},
				{
					category: "Human-owned",
					name: "Merge",
					detail: "requires explicit operator action",
					required: false,
					ok: true,
				},
			],
		}),
		{ onlyUnresolved: true },
	);
	expect(output).toContain("NEEDS SETUP");
	expect(output).toContain("Bun runtime");
	expect(output).not.toContain("READY NOW");
	expect(output).not.toContain("HUMAN-OWNED");
});
