"use client";

import { useMemo, useState } from "react";
import {
	type Act,
	type Actor,
	authorize,
	type Canvas,
	type Comment,
	canAdvance,
	claimLock,
	comment,
	type FeedEntry,
	feed,
	type Invite,
	invite,
	join,
	newCanvas,
	type Role,
	record,
	releaseLock,
	stageFor,
	type TargetKind,
} from "@/lib/collab";

export interface CollabLabels {
	actorHeading: string;
	identityLabel: string;
	identityPlaceholder: string;
	projectLabel: string;
	roleLabel: string;
	nonMember: string;
	commentHeading: string;
	targetKindLabel: string;
	targetIdLabel: string;
	targetIdPlaceholder: string;
	bodyLabel: string;
	bodyPlaceholder: string;
	commentSubmit: string;
	approveHeading: string;
	approveHint: string;
	approveSubmit: string;
	inviteHeading: string;
	inviteeLabel: string;
	inviteePlaceholder: string;
	grantLabel: string;
	inviteSubmit: string;
	presenceHeading: string;
	presenceHint: string;
	joinSubmit: string;
	claimSubmit: string;
	releaseSubmit: string;
	presentLabel: string;
	lockHolderLabel: string;
	noLock: string;
	stageHeading: string;
	stageHint: string;
	currentLabel: string;
	nextLabel: string;
	canAdvanceYes: string;
	canAdvanceNo: string;
	gapsLabel: string;
	advanceSubmit: string;
	capabilitiesLabel: string;
	feedHeading: string;
	feedEmpty: string;
	allowed: string;
	denied: string;
}

const ROLE_OPTIONS: (Role | "none")[] = ["owner", "editor", "viewer", "none"];
const TARGET_KINDS: TargetKind[] = ["idea", "mirror", "changeset"];
const ALL_CAPS = [
	"tests",
	"mutation",
	"one-cell",
	"kernel",
	"mirror",
	"reality-mirror-live",
	"context-graph",
	"memory",
	"evolve",
	"quality-diversity",
	"evolution-sandbox",
] as const;

const card =
	"rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm";
const input =
	"w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const btn =
	"inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

export function CollabPanel({ labels }: { labels: CollabLabels }) {
	const PROJECT = "proj-alpha";
	const [identity, setIdentity] = useState("vic");
	const [role, setRole] = useState<Role | "none">("viewer");

	const actor: Actor = useMemo(
		() => ({
			identity,
			projectId: PROJECT,
			role: role === "none" ? null : role,
		}),
		[identity, role],
	);

	// feed of activity (real actors).
	const [entries, setEntries] = useState<FeedEntry[]>([]);
	let seqRef = entries.length;
	function pushFeed(act: Act, target: string) {
		const r = record(actor, act, target, seqRef + 1);
		if (r.entry) setEntries((prev) => [...prev, r.entry as FeedEntry]);
		seqRef += 1;
	}

	// ── comment ──
	const [targetKind, setTargetKind] = useState<TargetKind>("idea");
	const [targetId, setTargetId] = useState("idea-7");
	const [body, setBody] = useState("needs a mirror first");
	const [lastComment, setLastComment] = useState<Comment | null>(null);
	const [commentMsg, setCommentMsg] = useState("");
	function doComment() {
		const r = comment(actor, targetKind, targetId, body);
		if (r.comment) {
			setLastComment(r.comment);
			setCommentMsg(
				`${labels.allowed} — ${r.comment.author} → ${r.comment.targetKind}:${r.comment.targetId} (${r.comment.id.slice(0, 8)})`,
			);
			pushFeed("comment", `${targetKind}:${targetId}`);
		} else {
			setLastComment(null);
			setCommentMsg(`${labels.denied} — ${r.decision.blockReason?.code}`);
		}
	}

	// ── approve ──
	const [approveMsg, setApproveMsg] = useState("");
	function doApprove() {
		const d = authorize(actor, "approve");
		if (d.verdict === "allow") {
			setApproveMsg(`${labels.allowed}`);
			pushFeed("approve", "changeset");
		} else {
			setApproveMsg(`${labels.denied} — ${d.blockReason?.code}`);
		}
	}

	// ── invite ──
	const [invitee, setInvitee] = useState("newbie");
	const [grant, setGrant] = useState<Role>("editor");
	const [inviteMsg, setInviteMsg] = useState("");
	const [lastInvite, setLastInvite] = useState<Invite | null>(null);
	function doInvite() {
		const r = invite(actor, invitee, grant);
		if (r.invite) {
			setLastInvite(r.invite);
			setInviteMsg(
				`${labels.allowed} — ${r.invite.inviter} → ${r.invite.invitee} (${r.invite.role})`,
			);
			pushFeed("invite", `${invitee}:${grant}`);
		} else {
			setLastInvite(null);
			setInviteMsg(`${labels.denied} — ${r.decision.blockReason?.code}`);
		}
	}

	// ── presence ──
	const [canvas, setCanvas] = useState<Canvas>(newCanvas("canvas-7", PROJECT));
	const [presenceMsg, setPresenceMsg] = useState("");
	function doJoin() {
		const r = join(canvas, actor);
		setCanvas(r.canvas);
		setPresenceMsg(
			r.decision.verdict === "allow"
				? `${labels.allowed} — ${identity}`
				: `${labels.denied} — ${r.decision.blockReason?.code}`,
		);
	}
	function doClaim() {
		const r = claimLock(canvas, actor);
		setCanvas(r.canvas);
		setPresenceMsg(
			r.decision.verdict === "allow"
				? `${labels.allowed} — ${identity}`
				: `${labels.denied} — ${r.decision.blockReason?.code}`,
		);
	}
	function doRelease() {
		setCanvas(releaseLock(canvas, actor));
		setPresenceMsg(`${labels.allowed} — release`);
	}

	// ── stage ──
	const [caps, setCaps] = useState<Set<string>>(new Set(["tests", "mutation"]));
	const stage = useMemo(() => stageFor(PROJECT, [...caps]), [caps]);
	const adv = useMemo(() => canAdvance(stage), [stage]);
	const [advanceMsg, setAdvanceMsg] = useState("");
	function toggleCap(c: string) {
		setCaps((prev) => {
			const next = new Set(prev);
			if (next.has(c)) next.delete(c);
			else next.add(c);
			return next;
		});
	}
	function doAdvance() {
		if (adv.ok) {
			setAdvanceMsg(`${labels.canAdvanceYes} → ${stage.next}`);
		} else {
			setAdvanceMsg(labels.canAdvanceNo);
		}
	}

	const orderedFeed = useMemo(() => feed(entries), [entries]);

	return (
		<div className="grid gap-4 md:grid-cols-2">
			{/* actor */}
			<section className={card} data-testid="collab-actor">
				<h2 className="mb-2 text-sm font-semibold">{labels.actorHeading}</h2>
				<label className={label} htmlFor="collab-identity">
					{labels.identityLabel}
				</label>
				<input
					id="collab-identity"
					data-testid="collab-identity"
					className={input}
					value={identity}
					onChange={(e) => setIdentity(e.target.value)}
					placeholder={labels.identityPlaceholder}
				/>
				<label className={`${label} mt-3`} htmlFor="collab-role">
					{labels.roleLabel}
				</label>
				<select
					id="collab-role"
					data-testid="collab-role"
					className={input}
					value={role}
					onChange={(e) => setRole(e.target.value as Role | "none")}
				>
					{ROLE_OPTIONS.map((r) => (
						<option key={r} value={r}>
							{r === "none" ? labels.nonMember : r}
						</option>
					))}
				</select>
				<p className="mt-2 text-xs text-muted-foreground">
					{labels.projectLabel}: {PROJECT}
				</p>
			</section>

			{/* approve (the S110 gate) */}
			<section className={card} data-testid="collab-approve">
				<h2 className="mb-2 text-sm font-semibold">{labels.approveHeading}</h2>
				<p className="mb-3 text-xs text-muted-foreground">
					{labels.approveHint}
				</p>
				<button
					type="button"
					data-testid="collab-approve-btn"
					className={btn}
					onClick={doApprove}
				>
					{labels.approveSubmit}
				</button>
				{approveMsg && (
					<p data-testid="collab-approve-msg" className="mt-3 text-sm">
						{approveMsg}
					</p>
				)}
			</section>

			{/* comment */}
			<section className={card} data-testid="collab-comment">
				<h2 className="mb-2 text-sm font-semibold">{labels.commentHeading}</h2>
				<label className={label} htmlFor="collab-target-kind">
					{labels.targetKindLabel}
				</label>
				<select
					id="collab-target-kind"
					data-testid="collab-target-kind"
					className={input}
					value={targetKind}
					onChange={(e) => setTargetKind(e.target.value as TargetKind)}
				>
					{TARGET_KINDS.map((k) => (
						<option key={k} value={k}>
							{k}
						</option>
					))}
				</select>
				<label className={`${label} mt-3`} htmlFor="collab-target-id">
					{labels.targetIdLabel}
				</label>
				<input
					id="collab-target-id"
					data-testid="collab-target-id"
					className={input}
					value={targetId}
					onChange={(e) => setTargetId(e.target.value)}
					placeholder={labels.targetIdPlaceholder}
				/>
				<label className={`${label} mt-3`} htmlFor="collab-body">
					{labels.bodyLabel}
				</label>
				<input
					id="collab-body"
					data-testid="collab-body"
					className={input}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder={labels.bodyPlaceholder}
				/>
				<button
					type="button"
					data-testid="collab-comment-btn"
					className={`${btn} mt-3`}
					onClick={doComment}
				>
					{labels.commentSubmit}
				</button>
				{commentMsg && (
					<p data-testid="collab-comment-msg" className="mt-3 text-sm">
						{commentMsg}
					</p>
				)}
				{lastComment && (
					<p
						data-testid="collab-comment-author"
						className="mt-1 text-xs text-muted-foreground"
					>
						author={lastComment.author}
					</p>
				)}
			</section>

			{/* invite */}
			<section className={card} data-testid="collab-invite">
				<h2 className="mb-2 text-sm font-semibold">{labels.inviteHeading}</h2>
				<label className={label} htmlFor="collab-invitee">
					{labels.inviteeLabel}
				</label>
				<input
					id="collab-invitee"
					data-testid="collab-invitee"
					className={input}
					value={invitee}
					onChange={(e) => setInvitee(e.target.value)}
					placeholder={labels.inviteePlaceholder}
				/>
				<label className={`${label} mt-3`} htmlFor="collab-grant">
					{labels.grantLabel}
				</label>
				<select
					id="collab-grant"
					data-testid="collab-grant"
					className={input}
					value={grant}
					onChange={(e) => setGrant(e.target.value as Role)}
				>
					{(["owner", "editor", "viewer"] as Role[]).map((r) => (
						<option key={r} value={r}>
							{r}
						</option>
					))}
				</select>
				<button
					type="button"
					data-testid="collab-invite-btn"
					className={`${btn} mt-3`}
					onClick={doInvite}
				>
					{labels.inviteSubmit}
				</button>
				{inviteMsg && (
					<p data-testid="collab-invite-msg" className="mt-3 text-sm">
						{inviteMsg}
					</p>
				)}
				{lastInvite && (
					<p className="mt-1 text-xs text-muted-foreground">
						inviter={lastInvite.inviter}
					</p>
				)}
			</section>

			{/* presence */}
			<section className={card} data-testid="collab-presence">
				<h2 className="mb-2 text-sm font-semibold">{labels.presenceHeading}</h2>
				<p className="mb-3 text-xs text-muted-foreground">
					{labels.presenceHint}
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						data-testid="collab-join-btn"
						className={btn}
						onClick={doJoin}
					>
						{labels.joinSubmit}
					</button>
					<button
						type="button"
						data-testid="collab-claim-btn"
						className={btn}
						onClick={doClaim}
					>
						{labels.claimSubmit}
					</button>
					<button
						type="button"
						data-testid="collab-release-btn"
						className={btn}
						onClick={doRelease}
					>
						{labels.releaseSubmit}
					</button>
				</div>
				<p className="mt-3 text-sm" data-testid="collab-present">
					{labels.presentLabel}:{" "}
					{canvas.present.map((p) => p.identity).join(", ") || "—"}
				</p>
				<p className="text-sm" data-testid="collab-lock">
					{labels.lockHolderLabel}: {canvas.lockHolder || labels.noLock}
				</p>
				{presenceMsg && (
					<p
						data-testid="collab-presence-msg"
						className="mt-1 text-xs text-muted-foreground"
					>
						{presenceMsg}
					</p>
				)}
			</section>

			{/* stage ladder */}
			<section className={card} data-testid="collab-stage">
				<h2 className="mb-2 text-sm font-semibold">{labels.stageHeading}</h2>
				<p className="mb-3 text-xs text-muted-foreground">{labels.stageHint}</p>
				<p className="text-sm" data-testid="collab-current">
					{labels.currentLabel}: <strong>{stage.current || "—"}</strong>
				</p>
				<p className="text-sm" data-testid="collab-next">
					{labels.nextLabel}: <strong>{stage.next || "—"}</strong>
				</p>
				<fieldset className="mt-3">
					<legend className={label}>{labels.capabilitiesLabel}</legend>
					<div className="grid grid-cols-2 gap-1">
						{ALL_CAPS.map((c) => (
							<label key={c} className="flex items-center gap-1 text-xs">
								<input
									type="checkbox"
									data-testid={`collab-cap-${c}`}
									checked={caps.has(c)}
									onChange={() => toggleCap(c)}
								/>
								{c}
							</label>
						))}
					</div>
				</fieldset>
				{stage.nextGaps.length > 0 && (
					<div
						className="mt-2 text-xs text-muted-foreground"
						data-testid="collab-gaps"
					>
						{labels.gapsLabel}:{" "}
						{stage.nextGaps.map((g) => g.missing).join(", ")}
					</div>
				)}
				<button
					type="button"
					data-testid="collab-advance-btn"
					className={`${btn} mt-3`}
					onClick={doAdvance}
				>
					{labels.advanceSubmit}
				</button>
				<p data-testid="collab-advance-msg" className="mt-3 text-sm">
					{advanceMsg || (adv.ok ? labels.canAdvanceYes : labels.canAdvanceNo)}
				</p>
			</section>

			{/* activity feed */}
			<section className={`${card} md:col-span-2`} data-testid="collab-feed">
				<h2 className="mb-2 text-sm font-semibold">{labels.feedHeading}</h2>
				{orderedFeed.length === 0 ? (
					<p className="text-sm text-muted-foreground">{labels.feedEmpty}</p>
				) : (
					<ul className="space-y-1 text-sm">
						{orderedFeed.map((e) => (
							<li key={e.id} data-testid="collab-feed-entry">
								#{e.seq} <strong>{e.actor}</strong> · {e.act} · {e.target}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
