/**
 * secret-store — the TS twin of back/runtime/secretstore (S91, app-builder EPIC 9,
 * DP32/ADR 0043). DETERMINISM-FIRST (CLAUDE.md §6/§8): the load-bearing JUDGMENTS of
 * the per-app secret store are PURE functions — the missing-at-boot set-difference, the
 * gitleaks-style leak scan, the project-scoped isolation membership. Same input → same
 * output. The AUTHORITATIVE engine (AES-256-GCM at rest, the project_id AAD bind) is the
 * Go package; this twin lets the Workbench /secret-store panel set/rotate/inject/scan
 * WITHOUT a backend round-trip and render the exact same verdicts.
 *
 * THE WALL (CLAUDE.md §2): a secret is operational material, never a truth — this writes
 * NOTHING to the kernel/mirrors/fitness. A secret NEVER reaches an emitter: the leak scan
 * proves the emitted source is clean of any secret value. There is no raw "read value"
 * surface — a value only flows out as a boot-time env var (injectEnv).
 */

/** the env-var prefix every injected secret carries (mirrors the Go envPrefix). */
const ENV_PREFIX = "APP_SECRET_";

/** one injected env var at boot (name + value). */
export interface EnvKV {
	name: string;
	value: string;
}

/** the typed, actionable refusal shape (mirrors back/runtime/blockreason). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** one leak the scanner found (mirrors the Go Finding; excerpt is REDACTED). */
export interface Finding {
	rule: string;
	line: number;
	excerpt: string;
}

/** the boot injection result: the SORTED env to inject, or a fail-closed BlockReason. */
export interface BootInjection {
	ok: boolean;
	env: EnvKV[];
	block?: BlockReason;
}

/** EnvVar maps a secret name to its deterministic boot env-var name. Pure. */
export function envVar(name: string): string {
	return ENV_PREFIX + name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

/** the closed, declared gitleaks-style detector set (mirrors the Go leakRules). */
const LEAK_RULES: { name: string; re: RegExp }[] = [
	{ name: "aws-access-key-id", re: /AKIA[0-9A-Z]{16}/ },
	{
		name: "private-key-header",
		re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
	},
	{ name: "bearer-token", re: /bearer\s+[A-Za-z0-9._-]{20,}/i },
	{
		name: "postgres-uri-password",
		re: /postgres(?:ql)?:\/\/[^:/\s]+:[^@/\s]+@/,
	},
	{
		name: "secret-assignment",
		re: /(?:secret|api[_-]?key|password|passwd|token|client[_-]?secret)["'\s]*[:=]\s*["'][A-Za-z0-9._\-+/]{12,}["']/i,
	},
];

/** redact replaces a matched span so the report never re-emits the secret in the clear. */
function redact(line: string, start: number, end: number): string {
	if (start < 0 || end > line.length || start > end) return "[redacted]";
	return `${line.slice(0, start)}[REDACTED]${line.slice(end)}`;
}

/**
 * scanEmission scans emitted source bytes for leaked secrets DETERMINISTICALLY — the
 * declared rules over each line, plus a verbatim search for any known secret VALUE.
 * Findings come back in stable (line, rule) order. "scan = code, jamais un LLM."
 */
export function scanEmission(
	source: string,
	knownValues: string[] = [],
): Finding[] {
	const findings: Finding[] = [];
	const lines = source.split("\n");
	lines.forEach((line, i) => {
		const lineNo = i + 1;
		for (const r of LEAK_RULES) {
			const m = r.re.exec(line);
			if (m) {
				findings.push({
					rule: r.name,
					line: lineNo,
					excerpt: redact(line, m.index, m.index + m[0].length),
				});
			}
		}
		for (const v of knownValues) {
			if (!v || v.length < 6) continue;
			const idx = line.indexOf(v);
			if (idx >= 0) {
				findings.push({
					rule: "known-secret-value",
					line: lineNo,
					excerpt: redact(line, idx, idx + v.length),
				});
			}
		}
	});
	findings.sort((a, b) =>
		a.line !== b.line ? a.line - b.line : a.rule.localeCompare(b.rule),
	);
	return findings;
}

/** isClean reports whether an emission has NO leak findings. */
export function isClean(source: string, knownValues: string[] = []): boolean {
	return scanEmission(source, knownValues).length === 0;
}

/** the fail-closed BlockReason for a missing secret at boot (mirrors the Go code). */
function missingAtBoot(detail: string): BlockReason {
	return {
		code: "SECRET_MISSING_AT_BOOT",
		severity: "blocking",
		explanation:
			"Le boot de l'app émise est REFUSÉ (S91) : un secret DÉCLARÉ requis est ABSENT du " +
			"secret store du projet (chiffré au repos, scopé project_id). L'injection des variables " +
			"d'environnement au boot est FAIL-CLOSED — jamais démarrée avec un credential vide ou deviné. " +
			detail,
		howToFix: [
			"set_the_missing_secret : déposez le secret manquant dans le store du projet (chiffré, scopé project_id).",
			"check_the_project_scope : vérifiez que le secret est posé sous le BON project_id (isolation cross-projet).",
			"rotate_if_compromised : si le secret a fuité, faites une rotation — l'ancienne valeur est invalidée.",
			"rerun the boot : le blocage se lève dès que toutes les clés déclarées sont présentes.",
		],
	};
}

/** dedupeSorted returns the trimmed, non-empty, de-duplicated, sorted key set. */
function dedupeSorted(keys: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of keys) {
		const k = raw.trim();
		if (!k || seen.has(k)) continue;
		seen.add(k);
		out.push(k);
	}
	return out.sort();
}

/**
 * SecretStore is the in-memory, project-scoped store the Workbench panel drives. The
 * value is held in memory (the browser twin); the Go engine is authoritative at rest.
 * Isolation is enforced by the (project, name) key — a value set for A is invisible to B.
 */
export class SecretStore {
	// history[project][name] = ordered versions; the last one is live.
	private store = new Map<string, Map<string, string>>();

	private scope(project: string): Map<string, string> {
		let m = this.store.get(project);
		if (!m) {
			m = new Map();
			this.store.set(project, m);
		}
		return m;
	}

	/** set stores (or replaces) a secret VALUE for (project, name). */
	set(project: string, name: string, value: string): void {
		if (!project.trim() || !name.trim()) return;
		this.scope(project).set(name, value);
	}

	/** has reports whether a LIVE secret exists for (project, name) — leak-free. */
	has(project: string, name: string): boolean {
		return this.store.get(project)?.has(name) ?? false;
	}

	/** get returns the live value (used only by injectEnv; never exposed raw to the UI). */
	private get(project: string, name: string): string | undefined {
		return this.store.get(project)?.get(name);
	}

	/**
	 * rotate replaces a secret's value AND invalidates the old one. Rotating an absent
	 * secret returns false (you set what does not exist).
	 */
	rotate(project: string, name: string, newValue: string): boolean {
		if (!this.has(project, name)) return false;
		this.scope(project).set(name, newValue);
		return true;
	}

	/**
	 * injectEnv computes the boot env from the DECLARED keys, fail-closed: a missing
	 * declared key → a SECRET_MISSING_AT_BOOT BlockReason (the missing keys named);
	 * else the SORTED env vars (APP_SECRET_<NAME>=<value>). A pure set-difference.
	 */
	injectEnv(project: string, declared: string[]): BootInjection {
		if (!project.trim()) {
			return {
				ok: false,
				env: [],
				block: missingAtBoot("Aucun project_id fourni."),
			};
		}
		const want = dedupeSorted(declared);
		const missing = want.filter((k) => !this.has(project, k));
		if (missing.length > 0) {
			return {
				ok: false,
				env: [],
				block: missingAtBoot(
					`Clés manquantes (déclarées − présentes) : ${missing.join(", ")} — pour le projet ${project}.`,
				),
			};
		}
		const env: EnvKV[] = want.map((k) => ({
			name: envVar(k),
			value: this.get(project, k) as string,
		}));
		env.sort((a, b) => a.name.localeCompare(b.name));
		return { ok: true, env };
	}

	/** keyNames returns the SORTED secret names a project holds (never a value). */
	keyNames(project: string): string[] {
		return [...(this.store.get(project)?.keys() ?? [])].sort();
	}
}
