"use client";

import { useMemo, useState } from "react";
import {
	applyErasure,
	type Cell,
	erase,
	exportData,
	type Plan,
	phaseHash,
	piiVisible,
	type Scope,
} from "@/lib/erasure";

// S116 — the action-capable GDPR EXPORT & ERASURE panel. Every op the step develops has a
// control bound to it, reachable AND executable from the screen (ui-completeness, CLAUDE.md §7):
//   - export a person's data (Art. 20);
//   - erase a person's PII (Art. 17) by crypto-shredding + tombstone, recording the decision;
//   - read the structural phase hash before/after (the append-only / DAG-integrity proof);
//   - scan whether any query still returns the subject's PII (cross-project, cross-plan).
// All PURE — re-runs the lib/erasure twin. The wall (§2): the panel WRITES NOTHING; erasure
// returns a VALUE; landing the tombstoned rows is a below-the-line archive write.

type Locale = "fr" | "en";

const T = {
	fr: {
		heading: "GDPR — export & suppression (append-only réconcilié)",
		sub: "Les droits des personnes sur le truth-store append-only : EXPORT (tout est rendu) et SUPPRESSION (la PII rendue irrécupérable par crypto-shredding/tombstone — la clé détruite, la structure préservée, le hash de phase reste valide, la décision enregistrée). Deux plans : le compte AIDOS et les utilisateurs de l'app émise.",
		planLabel: "Plan",
		planAccount: "Compte AIDOS (suppression dure)",
		planApp: "App émise (droits des utilisateurs)",
		subject: "Personne (sujet)",
		app: "App émise",
		exportBtn: "Exporter toutes les données",
		exportHeading: "Export (Art. 20)",
		noExport: "Aucune donnée (sujet inconnu ou déjà shredé — irrécupérable)",
		eraseBtn: "Supprimer (crypto-shred + tombstone)",
		eraseHeading: "Suppression (Art. 17)",
		decision: "Décision enregistrée",
		keysShredded: "clé(s) shredée(s)",
		rowsTomb: "ligne(s) tombstone",
		hashBefore: "Hash de phase AVANT",
		hashAfter: "Hash de phase APRÈS",
		hashOk: "INVARIANT — append-only préservé",
		hashKo: "CHANGÉ — append-only cassé (ne doit jamais arriver)",
		visibleBtn: "Une requête renvoie-t-elle encore la PII ?",
		visibleYes: "PII ENCORE visible",
		visibleNo: "PII IRRÉCUPÉRABLE (aucune requête ne la renvoie)",
		store: "Truth-store (échantillon, cross-projet & cross-plan)",
		shredded: "shredé",
	},
	en: {
		heading: "GDPR — export & erasure (append-only reconciled)",
		sub: "Data-subject rights on the append-only truth-store: EXPORT (everything is rendered) and ERASURE (PII made irrecoverable by crypto-shredding/tombstone — the key destroyed, the structure preserved, the phase hash stays valid, the decision recorded). Two plans: the AIDOS account and the emitted app's users.",
		planLabel: "Plan",
		planAccount: "AIDOS account (hard delete)",
		planApp: "Emitted app (users' rights)",
		subject: "Person (subject)",
		app: "Emitted app",
		exportBtn: "Export all data",
		exportHeading: "Export (Art. 20)",
		noExport: "No data (unknown subject or already shredded — irrecoverable)",
		eraseBtn: "Erase (crypto-shred + tombstone)",
		eraseHeading: "Erasure (Art. 17)",
		decision: "Recorded decision",
		keysShredded: "key(s) shredded",
		rowsTomb: "row(s) tombstoned",
		hashBefore: "Phase hash BEFORE",
		hashAfter: "Phase hash AFTER",
		hashOk: "INVARIANT — append-only preserved",
		hashKo: "CHANGED — append-only broken (must never happen)",
		visibleBtn: "Does any query still return the PII?",
		visibleYes: "PII STILL visible",
		visibleNo: "PII IRRECOVERABLE (no query returns it)",
		store: "Truth-store (sample, cross-project & cross-plan)",
		shredded: "shredded",
	},
} as const;

// The canonical sample store (the same fixture as the Go/TS mirrors): an account with two
// projects + an emitted app with two end-users — a cross-project, cross-plan PII landscape.
function sampleStore(): Cell[] {
	return [
		{
			plan: "account",
			subject: "acct-1",
			project: "p1",
			rowId: "a-1",
			structure: "users/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "alice@ex.com",
				},
				{
					path: "name",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "Alice",
				},
			],
		},
		{
			plan: "account",
			subject: "acct-1",
			project: "p2",
			rowId: "a-2",
			structure: "profile/shape",
			pii: [
				{
					path: "phone",
					ciphertext: "enc",
					keyId: "k-acct-1",
					plaintext: "555-0100",
				},
			],
		},
		{
			plan: "account",
			subject: "acct-2",
			project: "p9",
			rowId: "a-9",
			structure: "users/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-acct-2",
					plaintext: "bob@ex.com",
				},
			],
		},
		{
			plan: "app",
			subject: "u-7",
			app: "shop",
			project: "p1",
			rowId: "s-7",
			structure: "customer/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-u-7",
					plaintext: "carol@ex.com",
				},
				{
					path: "address",
					ciphertext: "enc",
					keyId: "k-u-7",
					plaintext: "1 St",
				},
			],
		},
		{
			plan: "app",
			subject: "u-8",
			app: "shop",
			project: "p1",
			rowId: "s-8",
			structure: "customer/shape",
			pii: [
				{
					path: "email",
					ciphertext: "enc",
					keyId: "k-u-8",
					plaintext: "dave@ex.com",
				},
			],
		},
	];
}

export function ErasurePanel({ locale }: { locale: Locale }) {
	const t = T[locale];
	const [plan, setPlan] = useState<Plan>("account");
	const [subject, setSubject] = useState("acct-1");
	const [app, setApp] = useState("shop");
	const [store, setStore] = useState<Cell[]>(sampleStore());
	const [exported, setExported] = useState<ReturnType<
		typeof exportData
	> | null>(null);
	const [eraseRes, setEraseRes] = useState<ReturnType<typeof erase> | null>(
		null,
	);
	const [hashes, setHashes] = useState<{
		before: string;
		after: string;
	} | null>(null);
	const [visible, setVisible] = useState<boolean | null>(null);

	const scope: Scope = useMemo(
		() => (plan === "app" ? { plan, subject, app } : { plan, subject }),
		[plan, subject, app],
	);

	const onExport = () => {
		setExported(exportData(scope, store));
		setVisible(null);
	};

	const onErase = () => {
		const before = phaseHash(store);
		const res = erase(scope, store, "phase-ref");
		const post = applyErasure(scope, store);
		setStore(post);
		setEraseRes(res);
		setHashes({ before, after: phaseHash(post) });
		setExported(null);
		setVisible(null);
	};

	const onScan = () => setVisible(piiVisible(subject, store));

	return (
		<section className="space-y-6" aria-label={t.heading}>
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">{t.sub}</p>
			</header>

			<div className="rounded-lg border border-border bg-card p-5 space-y-4">
				<div className="flex flex-wrap items-end gap-4">
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t.planLabel}</span>
						<select
							data-testid="plan-select"
							value={plan}
							onChange={(e) => {
								const p = e.target.value as Plan;
								setPlan(p);
								setSubject(p === "app" ? "u-7" : "acct-1");
							}}
							className="rounded-md border border-input bg-background px-3 py-1.5"
						>
							<option value="account">{t.planAccount}</option>
							<option value="app">{t.planApp}</option>
						</select>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t.subject}</span>
						<input
							data-testid="subject-input"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							className="rounded-md border border-input bg-background px-3 py-1.5"
						/>
					</label>
					{plan === "app" && (
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">{t.app}</span>
							<input
								data-testid="app-input"
								value={app}
								onChange={(e) => setApp(e.target.value)}
								className="rounded-md border border-input bg-background px-3 py-1.5"
							/>
						</label>
					)}
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						data-testid="export-btn"
						onClick={onExport}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						{t.exportBtn}
					</button>
					<button
						type="button"
						data-testid="erase-btn"
						onClick={onErase}
						className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
					>
						{t.eraseBtn}
					</button>
					<button
						type="button"
						data-testid="scan-btn"
						onClick={onScan}
						className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
					>
						{t.visibleBtn}
					</button>
				</div>
			</div>

			{exported && (
				<div
					className="rounded-lg border border-border bg-card p-5 space-y-2"
					data-testid="export-result"
				>
					<h2 className="text-lg font-semibold">{t.exportHeading}</h2>
					{exported.flatMap((r) => r.fields).length === 0 ? (
						<p
							className="text-sm text-muted-foreground"
							data-testid="export-empty"
						>
							{t.noExport}
						</p>
					) : (
						<ul className="space-y-1 text-sm">
							{exported.map((r) => (
								<li key={r.rowId} className="font-mono">
									<span className="text-muted-foreground">
										{r.project ?? r.app}/{r.rowId}:{" "}
									</span>
									{r.fields.map((f) => `${f.path}=${f.value}`).join(", ")}
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{eraseRes && hashes && (
				<div
					className="rounded-lg border border-border bg-card p-5 space-y-3"
					data-testid="erase-result"
				>
					<h2 className="text-lg font-semibold">{t.eraseHeading}</h2>
					<p className="text-sm">
						<span className="text-muted-foreground">{t.decision}: </span>
						<span className="font-mono" data-testid="decision-id">
							{eraseRes.decision.id.slice(0, 16)}…
						</span>
						{" — "}
						{eraseRes.decision.keyIds.length} {t.keysShredded},{" "}
						{eraseRes.tombstoned.length} {t.rowsTomb}
					</p>
					<div className="grid gap-1 text-xs font-mono">
						<span className="text-muted-foreground">
							{t.hashBefore}: {hashes.before.slice(0, 24)}…
						</span>
						<span className="text-muted-foreground">
							{t.hashAfter}: {hashes.after.slice(0, 24)}…
						</span>
					</div>
					<p
						data-testid="hash-verdict"
						className={`text-sm font-medium ${hashes.before === hashes.after ? "text-emerald-600" : "text-destructive"}`}
					>
						{hashes.before === hashes.after ? t.hashOk : t.hashKo}
					</p>
				</div>
			)}

			{visible !== null && (
				<div
					className="rounded-lg border border-border bg-card p-5"
					data-testid="visible-result"
				>
					<p
						data-testid="visible-verdict"
						className={`text-sm font-medium ${visible ? "text-destructive" : "text-emerald-600"}`}
					>
						{visible ? t.visibleYes : t.visibleNo}
					</p>
				</div>
			)}

			<div className="rounded-lg border border-border bg-card p-5 space-y-2">
				<h2 className="text-lg font-semibold">{t.store}</h2>
				<ul className="space-y-1 text-xs font-mono" data-testid="store-list">
					{store.map((c) => (
						<li key={c.rowId}>
							[{c.plan}] {c.subject}
							{c.app ? `@${c.app}` : ""}/{c.project}/{c.rowId}:{" "}
							{c.pii
								.map((p) =>
									p.keyId === "" && p.ciphertext === "☠shredded☠"
										? `${p.path}=${t.shredded}`
										: `${p.path}=${p.plaintext}`,
								)
								.join(", ")}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
