import { expect, test } from "@playwright/test";

/**
 * S97 Playwright e2e — the « domaines custom + TLS » Workbench panel.
 * mirror record: reflects=S97-custom-domain-binding, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /domain-bind route is action-capable (ui-completeness law, CLAUDE.md §7): the bind
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure twin (lib/domainbind, the twin of back/runtime/domainbind). The S97 done-criteria, reached
 * from the screen:
 *   - a domain belongs to EXACTLY ONE project — binding a domain already bound to ANOTHER project
 *     is REFUSED with DOMAIN_ALREADY_BOUND (the injectivity done-criteria, the fixture);
 *   - a custom domain SERVES the app in HTTPS — the emitted Traefik labels carry a websecure
 *     router + tls + an ACME certresolver on Host(`<domain>`) (the Godog done-criteria);
 *   - the binding domain→project is INJECTIVE (the property done-criteria, the badge);
 *   - the bind plan is reproducible (same input → same plan id).
 *
 * THE WALL (CLAUDE.md §2): the screen PLANS the binding + emits labels/DNS — it writes no truth,
 * makes no live DNS/ACME call. Binding = a pure function, never an LLM.
 */

test.describe("S97 — custom-domain binding + TLS", () => {
	test("the route renders the panel with the bind control", async ({ page }) => {
		await page.goto("/domain-bind");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Domaines custom|Custom domains/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("bind-button")).toBeVisible();
		await expect(page.getByTestId("domain-input")).toBeVisible();
		await expect(page.getByTestId("conflict-toggle")).toBeVisible();
	});

	test("binding a free custom domain serves the app over HTTPS", async ({
		page,
	}) => {
		await page.goto("/domain-bind");
		await page.getByTestId("bind-button").click();
		await expect(page.getByTestId("bind-result")).toBeVisible();

		// The URL is the custom domain over HTTPS.
		const url = await page.getByTestId("bind-url").innerText();
		expect(url.trim()).toBe("https://shop.acme.com");

		// The « serves the app over HTTPS » badge is green (judged by code over the labels).
		await expect(page.getByTestId("serves-https")).toHaveAttribute(
			"data-https",
			"true",
		);

		// The emitted Traefik labels carry the websecure router + tls + ACME certresolver.
		const labels = await page.getByTestId("traefik-labels").innerText();
		expect(labels).toContain("websecure");
		expect(labels).toContain(".tls = true");
		expect(labels).toContain(".tls.certresolver = letsencrypt");
		expect(labels).toContain("Host(`shop.acme.com`)");

		// The DNS CNAME points the custom domain at the deploy host.
		const dns = await page.getByTestId("dns-record").innerText();
		expect(dns).toContain("CNAME");
		expect(dns).toContain("shop.acme.com");
		expect(dns).toContain("deploy.aidos.app");
	});

	test("the binding domain→project is injective (the badge)", async ({
		page,
	}) => {
		await page.goto("/domain-bind");
		await page.getByTestId("bind-button").click();
		await expect(page.getByTestId("bind-result")).toBeVisible();
		await expect(page.getByTestId("injective")).toHaveAttribute(
			"data-injective",
			"true",
		);
	});

	test("a domain already bound to another project is refused DOMAIN_ALREADY_BOUND", async ({
		page,
	}) => {
		await page.goto("/domain-bind");
		await page.getByTestId("conflict-toggle").check();
		await expect(page.getByTestId("conflict-toggle")).toBeChecked();
		await page.getByTestId("bind-button").click();

		const block = page.getByTestId("block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "DOMAIN_ALREADY_BOUND");
		await expect(block).toContainText(/EXACTEMENT UN projet|other-tenant/);
	});

	test("a malformed domain is refused OUT_OF_SCOPE", async ({ page }) => {
		await page.goto("/domain-bind");
		await page.getByTestId("domain-input").fill("not a domain");
		await page.getByTestId("bind-button").click();

		const block = page.getByTestId("block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "OUT_OF_SCOPE");
	});

	test("the bind plan is reproducible (same input → same plan id)", async ({
		page,
	}) => {
		await page.goto("/domain-bind");
		await page.getByTestId("bind-button").click();
		await expect(page.getByTestId("bind-result")).toBeVisible();
		const id1 = await page.getByTestId("plan-id").innerText();

		await page.getByTestId("bind-button").click();
		await expect(page.getByTestId("bind-result")).toBeVisible();
		const id2 = await page.getByTestId("plan-id").innerText();

		expect(id1.trim()).toBe(id2.trim());
		expect(id1.trim().length).toBeGreaterThan(0);
	});
});
