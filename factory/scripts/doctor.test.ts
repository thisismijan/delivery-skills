import { expect, test } from "bun:test";
import { type DoctorReport, formatDoctorReport } from "./doctor";

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
