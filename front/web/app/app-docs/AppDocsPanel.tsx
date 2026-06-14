"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ENVIRONMENTS } from "@/lib/environments";
import {
	type AppDocsView,
	type DocsServiceFragmentView,
	emitAppDocs,
	searchAppDocs,
} from "./actions";

/**
 * AppDocsPanel renders the DP30 docs PROJECTION of the emitted app — the THREE docs profile
 * services (Fumadocs site + Scalar API reference + Pagefind static index), the Scalar
 * reference CONSUMING the S90-emitted OpenAPI (every sync endpoint present), the Fumadocs
 * concept pages of the domain, and the Pagefind search (a domain term → a result). It owns
 * the ENV selector gesture (ui-completeness, CLAUDE.md §7): switching env re-emits via the
 * AUTHORITATIVE Go (cmd/aidosdatafragments -docs). It also owns the Pagefind SEARCH gesture:
 * typing a domain term runs the deterministic token match over the emitted index.
 *
 * THE CAPITAL INDICATOR (`app-docs-not-aidos`): docs PER APP are a PROJECTION of the BUILT
 * app (its domain + its API), DISTINCT from the AIDOS Mintlify docs (the build journal) — and
 * nothing writes AIDOS truth (computed by the Go oracle: no fragment / not the projection
 * writes truth, no capability is a truth-write scope). THE WALL (§2): a below-the-line
 * projection — it WRITES NOTHING. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011,
 * FR first). DETERMINISM-FIRST: the Go is authoritative; the panel only displays its output.
 */
export function AppDocsPanel({
	activeProjectId,
	initial,
}: {
	activeProjectId: string | null;
	initial: AppDocsView;
}) {
	const t = useTranslations("appDocs");
	const [view, setView] = useState<AppDocsView>(initial);
	const [isPending, startTransition] = useTransition();

	// the Pagefind search state — seeded with the Go demo search (a domain term → a hit).
	const [query, setQuery] = useState<string>(initial.search_query);
	const [hits, setHits] = useState<string[]>(initial.search_hits);
	const [searched, setSearched] = useState<boolean>(
		initial.search_query.trim().length > 0,
	);
	const [isSearching, startSearch] = useTransition();

	const projection = view.projection;

	function onEnvChange(env: string) {
		startTransition(async () => {
			const v = await emitAppDocs(activeProjectId, env);
			setView(v);
			// re-seed the search off the freshly emitted projection's demo search.
			setQuery(v.search_query);
			setHits(v.search_hits);
			setSearched(v.search_query.trim().length > 0);
		});
	}

	function onSearch(e: React.FormEvent) {
		e.preventDefault();
		startSearch(async () => {
			const found = await searchAppDocs(view.projection, query);
			setHits(found);
			setSearched(true);
		});
	}

	return (
		<section data-testid="app-docs" data-env={view.env} className="space-y-12">
			{/* the env selector — the gesture (ui-completeness §7) */}
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-muted-foreground">
						{t("activeProjectLabel")}
					</span>
					<span
						data-testid="app-docs-project"
						className="font-mono text-foreground"
					>
						{activeProjectId?.trim() || t("noProject")}
					</span>
				</div>
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-muted-foreground">env</span>
					<select
						data-testid="app-docs-env"
						value={view.env}
						onChange={(e) => onEnvChange(e.target.value)}
						className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm text-foreground"
					>
						{ENVIRONMENTS.map((e) => (
							<option key={e} value={e}>
								{e}
							</option>
						))}
					</select>
				</label>
				{isPending ? (
					<span className="text-xs text-muted-foreground">{t("emitting")}</span>
				) : null}
			</div>

			{view.error ? (
				<div
					data-testid="app-docs-error"
					className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
				>
					{t("error")}
				</div>
			) : null}

			{/* ── 1. The three docs profile services ───────────────────────────── */}
			<div className="space-y-4">
				<header className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("servicesHeading")}
					</h2>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("servicesIntro")}
					</p>
				</header>
				<div
					data-testid="app-docs-services"
					data-count={view.docs.length}
					className="grid gap-4 sm:grid-cols-3"
				>
					{view.docs.map((f) => (
						<DocsServiceCard key={f.key} f={f} t={t} />
					))}
				</div>
			</div>

			{/* ── 2. The Scalar API reference — consuming the S90 OpenAPI ───────── */}
			<div data-testid="app-docs-scalar" className="space-y-4">
				<header className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("scalarHeading")}
					</h2>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("scalarIntro")}
					</p>
				</header>
				<div className="space-y-3 rounded-xl border border-border bg-card p-5">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
						<dt className="font-medium text-muted-foreground">
							{t("scalarOpenapiPath")}
						</dt>
						<dd
							data-testid="scalar-openapi-path"
							className="font-mono text-foreground"
						>
							{projection?.scalar.openapi_path ?? "—"}
						</dd>
						<dt className="font-medium text-muted-foreground">
							{t("scalarTheme")}
						</dt>
						<dd
							data-testid="scalar-theme"
							className="font-mono text-foreground"
						>
							{projection?.scalar.theme ?? "—"}
						</dd>
					</dl>

					<h3 className="text-xs font-semibold tracking-tight text-foreground">
						{t("scalarEndpoints")}
					</h3>
					{projection && projection.scalar.endpoints.length > 0 ? (
						<ul
							data-testid="scalar-endpoints"
							data-count={projection.scalar.endpoints.length}
							className="space-y-1.5"
						>
							{projection.scalar.endpoints.map((ep) => (
								<li
									key={ep.operation_id}
									data-testid="scalar-endpoint"
									data-operation={ep.operation_id}
									data-verb={ep.method}
									data-path={ep.path}
									data-authorize={ep.authorize}
									className="flex flex-wrap items-center gap-2 text-xs"
								>
									<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-wide text-primary">
										{ep.method}
									</span>
									<span className="font-mono text-foreground">{ep.path}</span>
									<span className="text-muted-foreground">
										({ep.operation_id})
									</span>
									{ep.authorize ? (
										<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
											{t("scalarAuthorize")}
										</span>
									) : null}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">{t("scalarEmpty")}</p>
					)}
				</div>
			</div>

			{/* ── 3. The Fumadocs concept site ──────────────────────────────────── */}
			<div data-testid="app-docs-fumadocs" className="space-y-4">
				<header className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("fumadocsHeading")}
					</h2>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("fumadocsIntro")}
					</p>
				</header>
				{projection && projection.fumadocs.pages.length > 0 ? (
					<div
						data-testid="fumadocs-pages"
						data-count={projection.fumadocs.pages.length}
						className="grid gap-4 sm:grid-cols-2"
					>
						{projection.fumadocs.pages.map((p) => (
							<article
								key={p.path}
								data-testid="fumadocs-page"
								data-path={p.path}
								data-title={p.title}
								data-locale={p.locale}
								className="space-y-2 rounded-xl border border-border bg-card p-5"
							>
								<header className="flex flex-wrap items-center gap-2">
									<h3 className="text-base font-semibold tracking-tight text-foreground">
										{p.title}
									</h3>
									<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
										{p.locale}
									</span>
								</header>
								<p className="font-mono text-xs text-muted-foreground">
									{p.path}
								</p>
								<div className="space-y-1">
									<span className="text-[0.7rem] font-medium text-muted-foreground">
										{t("fumadocsTerms")}
									</span>
									<div className="flex flex-wrap gap-1">
										{p.terms.map((term) => (
											<span
												key={term}
												className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground"
											>
												{term}
											</span>
										))}
									</div>
								</div>
							</article>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{t("fumadocsEmpty")}</p>
				)}
			</div>

			{/* ── 4. The Pagefind static search ─────────────────────────────────── */}
			<div data-testid="app-docs-pagefind" className="space-y-4">
				<header className="space-y-1">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("pagefindHeading")}
					</h2>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("pagefindIntro")}
					</p>
				</header>
				<form
					onSubmit={onSearch}
					className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5"
				>
					<label className="flex flex-1 flex-col gap-1 text-sm">
						<span className="font-medium text-muted-foreground">
							{t("pagefindSearchLabel")}
						</span>
						<input
							data-testid="pagefind-input"
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t("pagefindSearchPlaceholder")}
							className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
						/>
					</label>
					<button
						data-testid="pagefind-search"
						type="submit"
						disabled={isSearching}
						className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						{isSearching ? t("pagefindSearching") : t("pagefindSearch")}
					</button>
				</form>

				<div className="space-y-2">
					<h3 className="text-xs font-semibold tracking-tight text-foreground">
						{t("pagefindResultsHeading")}
					</h3>
					{hits.length > 0 ? (
						<ul
							data-testid="pagefind-results"
							data-count={hits.length}
							className="space-y-1.5"
						>
							{hits.map((h) => (
								<li
									key={h}
									data-testid="pagefind-result"
									data-page={h}
									className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground"
								>
									{h}
								</li>
							))}
						</ul>
					) : searched ? (
						<p
							data-testid="pagefind-no-results"
							className="text-sm text-muted-foreground"
						>
							{t("pagefindNoResults", { query })}
						</p>
					) : (
						<p className="text-sm text-muted-foreground">{t("pagefindHint")}</p>
					)}
				</div>
			</div>

			{/* ── The projection meta + the CAPITAL « docs par app ≠ docs AIDOS » indicator ── */}
			{projection ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-border bg-muted/40 p-5 text-xs">
					<dt className="font-medium text-muted-foreground">
						{t("themeLabel")}
					</dt>
					<dd className="font-mono text-foreground">{projection.theme}</dd>
					<dt className="font-medium text-muted-foreground">
						{t("defaultLocaleLabel")}
					</dt>
					<dd
						data-testid="app-docs-default-locale"
						className="font-mono text-foreground"
					>
						{projection.default_locale}
					</dd>
					<dt className="font-medium text-muted-foreground">
						{t("localesLabel")}
					</dt>
					<dd
						data-testid="app-docs-locales"
						className="font-mono text-foreground"
					>
						{projection.locales.join(", ")}
					</dd>
					<dt className="font-medium text-muted-foreground">
						{t("sourceHashLabel")}
					</dt>
					<dd
						className="truncate font-mono text-muted-foreground"
						title={projection.source_hash}
					>
						{projection.source_hash.slice(0, 12)}
					</dd>
					<dt className="font-medium text-muted-foreground">
						{t("docsIdLabel")}
					</dt>
					<dd
						data-testid="app-docs-id"
						className="truncate font-mono text-muted-foreground"
						title={projection.docs_id}
					>
						{projection.docs_id.slice(0, 12)}
					</dd>
				</dl>
			) : null}

			<div
				data-testid="app-docs-not-aidos"
				data-not-aidos={view.docs_not_aidos}
				data-is-projection={projection?.is_projection ?? false}
				data-wrote-kernel={projection?.wrote_kernel ?? false}
				className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span
						aria-hidden
						className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[0.7rem] font-bold text-emerald-600 dark:text-emerald-400"
					>
						{view.docs_not_aidos ? "✓" : "!"}
					</span>
					<h3 className="text-sm font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
						{t("notAidosHeading")}
					</h3>
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("notAidosBody")}
				</p>
			</div>
		</section>
	);
}

function DocsServiceCard({
	f,
	t,
}: {
	f: DocsServiceFragmentView;
	t: ReturnType<typeof useTranslations>;
}) {
	return (
		<article
			data-testid="app-docs-service"
			data-key={f.key}
			data-profile={f.service.profile}
			data-role={f.service.role}
			data-writes-truth={f.writes_truth}
			className="space-y-3 rounded-xl border border-border bg-card p-5"
		>
			<header className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{f.service.name}
				</h3>
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
					{t("role_docs")}
				</span>
				<span
					data-testid="service-profile"
					className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-medium text-primary"
				>
					{t("profileDocs")}
				</span>
			</header>

			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
				<dt className="font-medium text-muted-foreground">{t("image")}</dt>
				<dd data-testid="service-image" className="font-mono text-foreground">
					{f.service.image || t("imageEmitted")}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("port")}</dt>
				<dd data-testid="service-port" className="font-mono text-foreground">
					{f.service.internal_port}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("volume")}</dt>
				<dd data-testid="service-volume" className="font-mono text-foreground">
					{f.volumes.map((v) => v.name).join(", ") || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">
					{t("healthcheck")}
				</dt>
				<dd
					data-testid="service-healthcheck"
					className="font-mono text-foreground"
				>
					{f.service.healthcheck || "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("dependsOn")}</dt>
				<dd className="font-mono text-foreground">
					{f.service.depends_on?.length ? f.service.depends_on.join(", ") : "—"}
				</dd>

				<dt className="font-medium text-muted-foreground">
					{t("capabilities")}
				</dt>
				<dd data-testid="service-capabilities" className="flex flex-wrap gap-1">
					{f.capabilities.map((c) => (
						<span
							key={c}
							className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground"
						>
							{c}
						</span>
					))}
				</dd>

				<dt className="font-medium text-muted-foreground">{t("project")}</dt>
				<dd className="font-mono text-foreground">{f.project_id}</dd>

				<dt className="font-medium text-muted-foreground">{t("hash")}</dt>
				<dd className="truncate font-mono text-muted-foreground" title={f.hash}>
					{f.hash.slice(0, 12)}
				</dd>
			</dl>
		</article>
	);
}
