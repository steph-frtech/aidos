"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
	ACTIVE_PROJECT_COOKIE,
	type SwitchableProject,
} from "@/lib/activeProject";
import { switcherContext } from "./projectSwitcherAction";

/**
 * ProjectSwitcher (S57) — pins the ACTIVE project in the `AIDOS_PROJECT` cookie,
 * exactly like LanguageSwitcher pins `NEXT_LOCALE` (ADR 0011): no URL change, then
 * a router.refresh() so every server-rendered panel re-reads its project scope.
 *
 * The WorkbenchHeader is a client component rendered by 48 routes, so the switcher
 * SELF-FETCHES its context (live projects + resolved active id) via a Server Action
 * rather than prop-threading through every page. The active-id resolution is the
 * DETERMINISTIC pure resolver (lib/activeProject) running server-side; the
 * `__system__` seed is never silently selected (isolation).
 *
 * It is action-capable (ui-completeness, CLAUDE.md §7): selecting a project executes
 * the switch (cookie write + refresh) — not a display-only badge. When no project is
 * selectable it links to /projects to create one. THE WALL: switching only changes
 * the read scope (S54), it writes no truth.
 */
export function ProjectSwitcher() {
	const t = useTranslations("projectSwitcher");
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [projects, setProjects] = useState<SwitchableProject[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let alive = true;
		switcherContext()
			.then((ctx) => {
				if (!alive) return;
				setProjects(ctx.projects);
				setActiveId(ctx.activeId);
				setLoaded(true);
			})
			.catch(() => {
				if (alive) setLoaded(true);
			});
		return () => {
			alive = false;
		};
	}, []);

	function select(id: string) {
		document.cookie = `${ACTIVE_PROJECT_COOKIE}=${id};path=/;max-age=31536000;samesite=lax`;
		setActiveId(id);
		startTransition(() => router.refresh());
	}

	if (!loaded) {
		return (
			<span
				data-testid="project-switcher-loading"
				className="inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground"
			>
				{t("label")}
			</span>
		);
	}

	if (projects.length === 0) {
		return (
			<Link
				href="/projects"
				data-testid="project-switcher-empty"
				className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				{t("empty")}
			</Link>
		);
	}

	return (
		<label
			className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs"
			data-testid="project-switcher"
		>
			<span className="font-medium text-muted-foreground">{t("label")}</span>
			<select
				value={activeId ?? ""}
				disabled={pending}
				aria-label={t("label")}
				data-testid="project-switcher-select"
				data-active={activeId ?? ""}
				onChange={(e) => select(e.target.value)}
				className="bg-transparent font-medium text-foreground outline-none"
			>
				{activeId === null ? (
					<option value="" disabled>
						{t("none")}
					</option>
				) : null}
				{projects.map((p) => (
					<option key={p.id} value={p.id} data-slug={p.slug}>
						{p.name}
					</option>
				))}
			</select>
		</label>
	);
}
