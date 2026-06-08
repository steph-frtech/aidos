"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type ActionResult,
	changeRoleAction,
	inviteMemberAction,
	type MembersSnapshot,
	removeMemberAction,
} from "./actions";

/**
 * ProjectMembersPanel makes the /project-members route action-capable
 * (ui-completeness law, CLAUDE.md §7): every membership op S62 develops has a
 * control bound to it, reachable AND executable from the screen.
 *
 *   - Invite — identity × role → content-addressed membership row.
 *   - Role   — change a member's role (revoke + new row, append-only).
 *   - Remove — soft delete (mark revoked; the hard GDPR delete is S116).
 *
 * Every admin control calls a Server Action (app/project-members/actions.ts) that
 * writes `accounts.project_members` BELOW the wall — gated by the role gradient:
 * only an OWNER acting in the project administers; a viewer/editor/non-member is
 * refused ROLE_FORBIDDEN / NOT_A_MEMBER (the membership authority). The acting
 * identity is chosen via the "actor" field (the demo cockpit; the gateway
 * propagates the real S61 identity in prod). No truth is ever written from the
 * screen (CLAUDE.md §2). Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: ActionResult = { ok: false, messageKey: "" };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("projectMembers");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

function RoleBadge({ role }: { role: string }) {
	const t = useTranslations("projectMembers");
	const tone =
		role === "owner"
			? "bg-primary/10 text-primary"
			: role === "editor"
				? "bg-muted text-foreground"
				: "bg-muted text-muted-foreground";
	return (
		<span
			data-testid="member-role"
			data-role={role}
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
		>
			{t(`role.${role}`)}
		</span>
	);
}

export function ProjectMembersPanel({
	snapshot,
}: {
	snapshot: MembersSnapshot;
}) {
	const t = useTranslations("projectMembers");
	const [inviteResult, inviteAction] = useActionState(
		inviteMemberAction,
		initial,
	);
	const [roleResult, roleAction] = useActionState(changeRoleAction, initial);
	const [removeResult, removeAction] = useActionState(
		removeMemberAction,
		initial,
	);

	const lastResult =
		[inviteResult, roleResult, removeResult].find((r) => r.messageKey) ??
		initial;
	const pid = snapshot.projectId;

	return (
		<section className="space-y-8">
			{/* Invite flow */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("inviteHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("inviteHint")}</p>
				<form
					action={inviteAction}
					className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
				>
					<input type="hidden" name="projectId" value={pid} />
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("actorLabel")}</span>
						<input
							name="actor"
							data-testid="member-actor"
							defaultValue="oz"
							placeholder={t("actorPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("identityLabel")}</span>
						<input
							name="identity"
							data-testid="member-identity"
							placeholder={t("identityPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("roleLabel")}</span>
						<select
							name="role"
							data-testid="member-role-select"
							defaultValue="viewer"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="owner">{t("role.owner")}</option>
							<option value="editor">{t("role.editor")}</option>
							<option value="viewer">{t("role.viewer")}</option>
						</select>
					</label>
					<div className="flex items-end">
						<Submit label={t("inviteSubmit")} testid="member-invite-submit" />
					</div>
				</form>
			</div>

			{/* Result line */}
			{lastResult.messageKey ? (
				<p
					data-testid="member-result"
					data-code={lastResult.code ?? ""}
					className={
						lastResult.ok
							? "text-sm font-medium text-primary"
							: "text-sm font-medium text-destructive"
					}
				>
					{t(`result.${lastResult.messageKey}`, { id: lastResult.id ?? "" })}
				</p>
			) : null}

			{/* Member list */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("listHeading", { project: pid, count: snapshot.members.length })}
				</h2>
				<ul className="mt-4 space-y-3" data-testid="member-list">
					{snapshot.members.map((m) => (
						<li
							key={m.id}
							data-testid="member-row"
							data-identity={m.identity}
							data-role={m.role}
							className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium text-foreground">
										{m.identity}
									</span>
									<RoleBadge role={m.role} />
								</div>
								<div className="mt-1 text-xs text-muted-foreground">
									<code className="font-mono">{m.id.slice(0, 16)}…</code>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{/* Change role — owner-gated */}
								<form action={roleAction} className="flex items-center gap-1">
									<input type="hidden" name="projectId" value={pid} />
									<input type="hidden" name="actor" value="oz" />
									<input type="hidden" name="identity" value={m.identity} />
									<select
										name="role"
										data-testid="member-row-role-select"
										defaultValue={m.role}
										className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<option value="owner">{t("role.owner")}</option>
										<option value="editor">{t("role.editor")}</option>
										<option value="viewer">{t("role.viewer")}</option>
									</select>
									<button
										type="submit"
										data-testid="member-role-apply"
										className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
									>
										{t("roleApply")}
									</button>
								</form>
								{/* Remove — owner-gated, soft delete */}
								<form action={removeAction}>
									<input type="hidden" name="projectId" value={pid} />
									<input type="hidden" name="actor" value="oz" />
									<input type="hidden" name="identity" value={m.identity} />
									<button
										type="submit"
										data-testid="member-remove"
										className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
									>
										{t("remove")}
									</button>
								</form>
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
