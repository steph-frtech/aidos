"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { StoreSnapshot } from "@/lib/store-data";

function shortHash(h: string): string {
	return h.slice(0, 12);
}

/**
 * StorePanel renders the read-only Archive content store: a left list of objects
 * by hash and a right detail showing the selected head's current body + history.
 * It never writes truth; it projects a StoreSnapshot resolved on the server.
 * Themed on the ADR 0010 design tokens; labels via next-intl (ADR 0011, the
 * provider is mounted in the root layout).
 */
export function StorePanel({ snapshot }: { snapshot: StoreSnapshot }) {
	const t = useTranslations("store");
	const firstHead = snapshot.heads[0]?.key ?? null;
	const [selectedHead, setSelectedHead] = useState<string | null>(firstHead);

	const bodyByHash = new Map(snapshot.objects.map((o) => [o.hash, o.body]));
	const headByKey = new Map(snapshot.heads.map((h) => [h.key, h.hash]));

	const currentHash = selectedHead
		? (headByKey.get(selectedHead) ?? null)
		: null;
	const currentBody = currentHash ? (bodyByHash.get(currentHash) ?? "") : "";
	const moves = selectedHead ? (snapshot.history[selectedHead] ?? []) : [];

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Left: object list by hash */}
			<section
				aria-label={t("objectsHeading", { count: snapshot.objects.length })}
			>
				<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("objectsHeading", { count: snapshot.objects.length })}
				</h2>
				<ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
					{snapshot.objects.map((obj) => {
						const headKey = snapshot.heads.find(
							(h) => h.hash === obj.hash,
						)?.key;
						return (
							<li
								key={obj.hash}
								data-testid={`object-${obj.hash}`}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<code
									data-testid={`object-hash-${shortHash(obj.hash)}`}
									className="font-mono text-xs text-card-foreground"
								>
									{shortHash(obj.hash)}…
								</code>
								<span className="flex items-center gap-3 text-xs text-muted-foreground">
									<span className="tabular-nums">
										{t("byteUnit", { count: obj.byteSize })}
									</span>
									{headKey && (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
											{t("headBadge", { key: headKey })}
										</span>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Right: selected head body + history */}
			<section aria-label={t("headsHeading", { count: snapshot.heads.length })}>
				<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("headsHeading", { count: snapshot.heads.length })}
				</h2>
				<div className="mb-4 flex flex-wrap gap-2">
					{snapshot.heads.map((h) => (
						<button
							key={h.key}
							type="button"
							data-testid={`head-${h.key}`}
							onClick={() => setSelectedHead(h.key)}
							className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
								selectedHead === h.key
									? "border-primary bg-primary/10 font-medium text-primary"
									: "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`}
						>
							{h.key}
						</button>
					))}
				</div>

				{selectedHead && (
					<div className="space-y-4">
						<div className="rounded-xl border border-border bg-card p-4">
							<div className="mb-2 text-xs text-muted-foreground">
								{t("currentBodyLabel")}{" "}
								<code className="font-mono text-card-foreground">
									{selectedHead}
								</code>{" "}
								({t("hashLabel")}{" "}
								<code data-testid="current-hash" className="font-mono">
									{currentHash ? shortHash(currentHash) : "—"}
								</code>
								)
							</div>
							<pre
								data-testid="current-body"
								className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm text-foreground"
							>
								{currentBody}
							</pre>
						</div>

						<div>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{t("historyHeading")}
							</h3>
							<ol
								data-testid="history-list"
								className="space-y-px overflow-hidden rounded-xl border border-border bg-border"
							>
								{moves.map((m, idx) => (
									<li
										key={`${m.parentHash ?? "root"}->${m.hash}`}
										data-testid={`history-move-${idx}`}
										className="flex items-center justify-between gap-3 bg-card px-4 py-2 text-xs"
									>
										<span className="tabular-nums text-muted-foreground">
											#{idx + 1}
										</span>
										<code
											data-testid={`history-hash-${idx}`}
											className="font-mono text-card-foreground"
										>
											{shortHash(m.hash)}…
										</code>
										<span className="text-muted-foreground">
											{t("parentLabel")}{" "}
											<code className="font-mono">
												{m.parentHash ? shortHash(m.parentHash) : "∅"}
											</code>
										</span>
									</li>
								))}
							</ol>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
