import { expect, test } from "bun:test";
import {
	type DoctorReport,
	formatDoctorReport,
	remoteProviderDoctorChecks,
	workItemDoctorCheck,
} from "./doctor";
import {
	defaultRuntimeManifest,
	overlayRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";

test("groups partial readiness without hiding the safe subset", () => {
	const report: DoctorReport = {
		coreReady: true,
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
	};
	const output = formatDoctorReport(report);
	for (const heading of [
		"READY NOW",
		"NEEDS SETUP",
		"HOST LIMITATION",
		"HUMAN-OWNED",
	]) {
		expect(output).toContain(heading);
	}
	expect(output).toContain("Core runtime is ready");
});

test("doctor output contains remedies but no supplied secret", () => {
	const secret = "glpat-never-print-this";
	const output = formatDoctorReport({
		coreReady: false,
		checks: [
			{
				category: "Needs setup",
				name: "GitLab credential",
				detail: "set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token",
				required: false,
				ok: false,
			},
		],
	});
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
	});	expect(
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
	const output = formatDoctorReport({ coreReady: true, checks });
	expect(output).toContain("github-forge");
	expect(output).toContain("jira-tracker");
	expect(output).toContain("GitHub credential");
	expect(output).toContain("Jira credential");
	expect(output).not.toContain("gitlab-forge");
	expect(output).not.toContain("secret-github");
	expect(output).not.toContain("secret-jira");
});
