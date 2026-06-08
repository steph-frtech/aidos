import { expect, test } from "@playwright/test";

/**
 * S87 Playwright e2e — the « scaffold serveur de l'app émise (Hono/TS) + émetteur IaC Pulumi »
 * Workbench panel.
 * mirror record: reflects=S87-hono-emitter, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /hono-emitter route is action-capable (ui-completeness law, CLAUDE.md §7): TWO
 * controls reachable AND executable from the screen, each bound to a Server Action running the
 * REAL pure engine (lib/hono-emitter, the TS twin of back/runtime/honoemit). The S87
 * done-criteria, reached from the screen:
 *   - the emitted Hono/TS server carries GET /healthz and a POST handler per SYNC operation;
 *   - the emitted worker carries an async dispatcher (drains the outbox);
 *   - the Pulumi/TS program carries the shared network + a container per service + Traefik labels;
 *   - emission is deterministic (a stable source content address).
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS code as values — it writes no truth. Emission
 * is a pure function (never an LLM).
 */

test.describe("S87 — Hono/TS server scaffold + Pulumi emitter", () => {
	test("the route renders the panel with both emit controls", async ({
		page,
	}) => {
		await page.goto("/hono-emitter");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Scaffold serveur Hono\/TS|Hono\/TS server scaffold/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("emit-server")).toBeVisible();
		await expect(page.getByTestId("emit-pulumi")).toBeVisible();
		await expect(page.getByTestId("server-surface")).toBeVisible();
	});

	test("the emitted Hono server boots with /healthz + a handler per sync op", async ({
		page,
	}) => {
		await page.goto("/hono-emitter");
		await page.getByTestId("server-surface").selectOption("server");
		await page.getByTestId("emit-server").click();

		const result = page.getByTestId("emit-result").first();
		await expect(result).toHaveAttribute("data-verdict", "emitted");
		const out = page.getByTestId("emit-output").first();
		await expect(out).toContainText(
			"export function createApp(deps: Deps): Hono",
		);
		await expect(out).toContainText('app.get("/healthz"');
		await expect(out).toContainText('app.post("/createorder"');
		await expect(out).toContainText('app.post("/cancelorder"');
		// async op is NOT an HTTP route (it is a worker dispatcher).
		await expect(out).not.toContainText("/sendreceipt");
		// a stable source content address is shown (determinism).
		await expect(page.getByTestId("emit-hash").first()).toBeVisible();
	});

	test("the emitted worker drains the outbox (async dispatcher)", async ({
		page,
	}) => {
		await page.goto("/hono-emitter");
		await page.getByTestId("server-surface").selectOption("worker");
		await page.getByTestId("emit-server").click();
		const out = page.getByTestId("emit-output").first();
		await expect(out).toContainText("dispatchSendReceipt");
		await expect(out).toContainText("outbox.pending");
		await expect(out).toContainText("outbox.markDispatched");
	});

	test("the Pulumi/TS program is emitted with network + containers + Traefik", async ({
		page,
	}) => {
		await page.goto("/hono-emitter");
		await page.getByTestId("emit-pulumi").click();

		// the pulumi control is the second form; its result is the last emit-result.
		const result = page.getByTestId("emit-result").last();
		await expect(result).toHaveAttribute("data-verdict", "emitted");
		const out = page.getByTestId("emit-output").last();
		await expect(out).toContainText('import * as docker from "@pulumi/docker"');
		await expect(out).toContainText("export function program()");
		await expect(out).toContainText("new docker.Network");
		await expect(out).toContainText('new docker.Container("server"');
		await expect(out).toContainText('new docker.Container("postgres"');
		await expect(out).toContainText('"traefik.enable"');
	});
});
