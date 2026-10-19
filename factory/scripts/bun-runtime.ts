export function expectedBunVersion(packageJson: string): string {
	try {
		const pkg = JSON.parse(packageJson) as { packageManager?: string };
		return pkg.packageManager?.replace(/^bun@/, "") ?? "";
	} catch {
		return "";
	}
}

export function bunInstallCommand(version: string): string {
	const pinned = version || "from package.json";
	if (!version) {
		return `install Bun ${pinned} (see factory/package.json packageManager)`;
	}
	return `curl -fsSL https://bun.sh/install | bash -s "bun-v${version}"`;
}

export function bunRuntimeDetail(
	expected: string,
	found: string,
): { present: boolean; exact: boolean; detail: string } {
	if (!found) {
		return {
			present: false,
			exact: false,
			detail: `install Bun ${expected || "from package.json"}: ${bunInstallCommand(expected)}`,
		};
	}
	if (expected && found === expected) {
		return { present: true, exact: true, detail: found };
	}
	return {
		present: true,
		exact: false,
		detail: `${bunInstallCommand(expected)}; found ${found}. Restart the shell so the pinned bun is first on PATH`,
	};
}
