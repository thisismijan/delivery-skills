export type FailureKind = "infrastructure" | "test" | "unknown";

export interface FailedJob {
	name: string;
	stage?: string;
	failureReason?: string;
	logTail?: string;
}

export interface FailureClassification {
	kind: FailureKind;
	reason: string;
}

// Forge-reported reasons that mean the job never got a fair run.
export const INFRASTRUCTURE_REASONS = new Set([
	"runner_system_failure",
	"api_failure",
	"scheduler_failure",
	"runner_unsupported",
	"data_integrity_failure",
	"image_pull_failure",
	"stale_schedule",
]);

// A test runner reporting a failed test. Checked before the infrastructure
// patterns, so a test that fails while logging a network error is a test.
export const TEST_FAILURE_PATTERNS: RegExp[] = [
	/^\(fail\) /m,
	// A runner's count, not an id: "smoke-1780 failed" is a job name.
	/(?:^|[\s(,=])[1-9]\d* (?:fail|failed|failures?)\b/im,
	/Tests run: \d+, Failures: [1-9]/,
	/^--- FAIL: /m,
	/AssertionError|expect\(received\)/,
	/timed out after \d+ ?ms/i,
];

export const INFRASTRUCTURE_PATTERNS: Array<{ pattern: RegExp; what: string }> =
	[
		{
			pattern: /toomanyrequests|reached your pull rate limit/i,
			what: "image registry rate limit",
		},
		{
			pattern:
				/registry[^\s"]*\.docker\.io[^\n]*Forbidden|failed to pull image[^\n]*Forbidden|error pulling image[^\n]*Forbidden/i,
			what: "image registry refused the pull",
		},
		{
			pattern:
				/failed to resolve source metadata for docker\.io|could not fetch content descriptor|httpReadSeeker: failed open/i,
			what: "image registry fetch failed",
		},
		{
			pattern:
				/curl: \(60\)|SSL certificate problem|x509: certificate|tls: failed to verify certificate/i,
			what: "TLS certificate failure fetching a dependency",
		},
		{
			pattern:
				/\b50[234] (?:Bad Gateway|Service Unavailable|Gateway Time-?out)\b|\b(?:answered|returned|responded with|status|HTTP)(?: error| code)?:? 50[234]\b/i,
			what: "upstream service unavailable",
		},
		{
			pattern:
				/connection reset by peer|TLS handshake timeout|i\/o timeout|Could not resolve host|Temporary failure in name resolution|network is unreachable|curl: \((?:35|56)\)|SSL_ERROR_SYSCALL|Proxy CONNECT aborted|ECONNRESET|ETIMEDOUT|socket hang up/i,
			what: "network failure",
		},
		{ pattern: /no space left on device/i, what: "runner out of disk" },
		{
			pattern: /Job failed \(system failure\)|runner system failure/i,
			what: "runner system failure",
		},
	];

const TEST_JOB = /(^|[:\s/_-])(test|tests|spec|e2e)([:\s/_-]|$)/i;

export function classifyFailure(job: FailedJob): FailureClassification {
	const reason = job.failureReason?.trim().toLowerCase();
	if (reason && INFRASTRUCTURE_REASONS.has(reason)) {
		return { kind: "infrastructure", reason: `the forge reports ${reason}` };
	}
	const log = job.logTail ?? "";
	const testHit = TEST_FAILURE_PATTERNS.find((pattern) => pattern.test(log));
	if (testHit) {
		return { kind: "test", reason: "the log shows a failing test" };
	}
	const infra = INFRASTRUCTURE_PATTERNS.find(({ pattern }) =>
		pattern.test(log),
	);
	if (infra) {
		return { kind: "infrastructure", reason: `the log shows ${infra.what}` };
	}
	if (TEST_JOB.test(job.name) || (job.stage && TEST_JOB.test(job.stage))) {
		return {
			kind: "test",
			reason: "a test job failed and its log shows no infrastructure cause",
		};
	}
	return {
		kind: "unknown",
		reason: "the log shows no known infrastructure cause",
	};
}
