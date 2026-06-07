"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	buildScopedSelect,
	type ScopedSelectResult,
	type ScopeSnapshot,
} from "./actions";

/**
 * ProjectScopePanel — the action-capable client surface of /project-scope (S54).
 * It renders the __system__ seed and the nine project-scoped tables, and lets the
 * user EXECUTE the "build scoped read" control for any table: clicking it calls the
 * Server Action which returns the deterministic `WHERE project_id = $1` SQL (or an
 * honest error for an off-set table). No truth is written — project_id is a scope
 * column (the wall is unchanged). Themed (ADR 0010) + bilingual (ADR 0011).
 */
export function ProjectScopePanel({ snapshot }: { snapshot: ScopeSnapshot }) {
	const t = useTranslations("projectScope");
	const [selected, setSelected] = useState<string>(
		snapshot.tables[0]?.qualified ?? "",
	);
	const [result, setResult] = useState<ScopedSelectResult | null>(null);
	const [pending, setPending] = useState(false);

	async function onBuild() {
		const tbl = snapshot.tables.find((x) => x.qualified === selected);
		if (!tbl) return;
		setPending(true);
		try {
			const r = await buildScopedSelect(tbl.schema, tbl.table);
			setResult(r);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-10">
			{/* The __system__ seed card */}
			<section
				aria-labelledby="seed-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="seed-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("seedHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("seedIntro")}</p>
				<dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
					<Row label={t("seedSlug")} value={snapshot.seed.slug} mono />
					<Row label={t("seedOwner")} value={snapshot.seed.ownerRef} mono />
					<Row label={t("seedName")} value={snapshot.seed.name} />
					<Row label={t("seedLifecycle")} value={snapshot.seed.lifecycle} />
					<Row
						label={t("seedGenesis")}
						value={snapshot.seed.genesisNode}
						mono
					/>
					<Row label={t("seedId")} value={snapshot.seed.id} mono wide />
				</dl>
			</section>

			{/* The scoped tables + the build-scoped-read control */}
			<section aria-labelledby="tables-heading" className="space-y-4">
				<div>
					<h2
						id="tables-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("tablesHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("tablesIntro")}
					</p>
				</div>

				<div className="overflow-x-auto rounded-lg border border-border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="px-4 py-2 font-medium">{t("colTable")}</th>
								<th className="px-4 py-2 font-medium">{t("colFk")}</th>
								<th className="px-4 py-2 font-medium">{t("colIndex")}</th>
							</tr>
						</thead>
						<tbody>
							{snapshot.tables.map((tbl) => (
								<tr
									key={tbl.qualified}
									data-testid={`scoped-row-${tbl.qualified}`}
									className="border-t border-border"
								>
									<td className="px-4 py-2 font-mono text-foreground">
										{tbl.qualified}
									</td>
									<td className="px-4 py-2 font-mono text-muted-foreground">
										{tbl.fkName}
									</td>
									<td className="px-4 py-2 font-mono text-muted-foreground">
										{tbl.indexName}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Action: build a scoped read SQL — executable, not display-only. */}
				<div className="rounded-lg border border-border bg-card p-6">
					<h3 className="text-sm font-semibold text-foreground">
						{t("buildHeading")}
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("buildIntro")}
					</p>
					<div className="mt-4 flex flex-wrap items-center gap-3">
						<label htmlFor="scope-table" className="sr-only">
							{t("buildSelectLabel")}
						</label>
						<select
							id="scope-table"
							data-testid="scope-table-select"
							value={selected}
							onChange={(e) => {
								setSelected(e.target.value);
								setResult(null);
							}}
							className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							{snapshot.tables.map((tbl) => (
								<option key={tbl.qualified} value={tbl.qualified}>
									{tbl.qualified}
								</option>
							))}
						</select>
						<button
							type="button"
							data-testid="build-scoped-select"
							onClick={onBuild}
							disabled={pending}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{pending ? t("building") : t("buildButton")}
						</button>
					</div>

					{result && (
						<div className="mt-4" data-testid="scoped-select-result">
							{result.ok ? (
								<pre className="overflow-x-auto rounded-md bg-muted p-4 font-mono text-xs text-foreground">
									{result.sql}
								</pre>
							) : (
								<p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
									{result.error}
								</p>
							)}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}

function Row({
	label,
	value,
	mono,
	wide,
}: {
	label: string;
	value: string;
	mono?: boolean;
	wide?: boolean;
}) {
	return (
		<div className={wide ? "sm:col-span-2" : undefined}>
			<dt className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd
				className={
					mono
						? "mt-0.5 break-all font-mono text-sm text-foreground"
						: "mt-0.5 text-sm text-foreground"
				}
			>
				{value}
			</dd>
		</div>
	);
}
