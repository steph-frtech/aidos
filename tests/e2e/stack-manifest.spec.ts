import { expect, test } from "@playwright/test";

/**
 * DP02 Playwright e2e — the « StackManifest : la source de la stack » Workbench panel.
 * mirror record: reflects=DP02-stack-manifest, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /stack-manifest route renders the SEEDED manifest (the DP02 done-criterion:
 * read the manifest, themed + bilingual) with its content address, and that the one
 * control (« valider & hasher », ui-completeness CLAUDE.md §7) executes from the screen:
 * the pure validator + content-addressing re-measure the JSON — round-trip (same body →
 * same hash) and the three closed-set refusals UNKNOWN_SERVICE_ROLE /
 * DUPLICATE_INTERNAL_PORT / STACK_HAS_NO_SERVER.
 *
 * THE WALL (CLAUDE.md §2): the screen reads and measures — it writes no truth
 * (stack_manifest is above-the-line; engraving flows through idea → mirror → /goal).
 */

// The Go-authoritative content address of the seeded Example manifest (pinned by the
// vitest twin mirror lib/stack-manifest.test.ts).
const GO_MANIFEST_HASH =
	"8011728e4f9c01130c151d5c49b89b28afa1e3dc5e741fcc12c04c38062acdd2";

// React hydration races a plain fill() (the SSR textarea text + the typed value can
// merge); retry until the controlled value sticks — deterministic, no fixed sleep.
async function setManifestJson(
	textarea: import("@playwright/test").Locator,
	value: string,
): Promise<void> {
	await expect(async () => {
		await textarea.fill(value);
		expect(await textarea.inputValue()).toBe(value);
	}).toPass({ timeout: 10_000 });
}

test.describe("DP02 — StackManifest as a first-class Kernel source", () => {
	test("the route renders the seeded manifest, its content address and the closed sets", async ({
		page,
	}) => {
		await page.goto("/stack-manifest");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /StackManifest — la source de la stack|StackManifest — the stack's source/,
			}),
		).toBeVisible();

		// the seeded manifest: the alphashop-convention minimal stack.
		await expect(page.getByTestId("app-name")).toHaveText("alphashop");
		await expect(page.getByTestId("service-app")).toContainText("server");
		await expect(page.getByTestId("service-postgres")).toContainText(
			"datastore",
		);
		await expect(page.getByTestId("service-interpreter")).toContainText(
			"interpreter",
		);
		await expect(page.getByTestId("volumes")).toContainText("${APP_DATA_PATH}");
		await expect(page.getByTestId("network")).toContainText(
			"traefik_default (external)",
		);
		await expect(page.getByTestId("scopes")).toContainText(
			"postgres:read-only",
		);

		// the content address — id == version == Hash(Canonicalize(body)), Go-pinned.
		await expect(page.getByTestId("manifest-hash")).toHaveText(
			GO_MANIFEST_HASH,
		);

		// the two closed sets are rendered (enumerable, never guessed).
		await expect(page.getByTestId("roles")).toContainText("interpreter");
		await expect(page.getByTestId("profiles")).toContainText("non-prod");
	});

	test("« valider & hasher » executes: the seeded body round-trips to the SAME hash", async ({
		page,
	}) => {
		await page.goto("/stack-manifest");
		await page.getByTestId("measure").click();

		const result = page.getByTestId("measure-result");
		await expect(result).toHaveAttribute("data-outcome", "valid");
		await expect(page.getByTestId("measured-hash")).toHaveText(
			GO_MANIFEST_HASH,
		);
		await expect(page.getByTestId("hash-compare")).toContainText(
			/même body → même hash|same body → same hash/,
		);
	});

	test("a duplicate internal port is refused from the screen (DUPLICATE_INTERNAL_PORT)", async ({
		page,
	}) => {
		await page.goto("/stack-manifest");
		const textarea = page.getByTestId("manifest-json");
		const json = JSON.parse((await textarea.inputValue()) as string);
		json.services[1].internal_port = json.services[0].internal_port;
		await setManifestJson(textarea, JSON.stringify(json, null, 2));
		await page.getByTestId("measure").click();

		await expect(page.getByTestId("measure-result")).toHaveAttribute(
			"data-outcome",
			"refused",
		);
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"DUPLICATE_INTERNAL_PORT",
		);
	});

	test("an unknown role and a server-less stack are refused from the screen", async ({
		page,
	}) => {
		await page.goto("/stack-manifest");
		const textarea = page.getByTestId("manifest-json");

		// UNKNOWN_SERVICE_ROLE — a role outside the closed set, never guessed.
		const json = JSON.parse((await textarea.inputValue()) as string);
		json.services[1].role = "blockchain";
		await setManifestJson(textarea, JSON.stringify(json, null, 2));
		await page.getByTestId("measure").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"UNKNOWN_SERVICE_ROLE",
		);

		// STACK_HAS_NO_SERVER — no role=server service left.
		const json2 = JSON.parse(JSON.stringify(json));
		json2.services[1].role = "datastore";
		for (const s of json2.services) {
			if (s.role === "server") s.role = "cache";
		}
		// keep ports unique (they already are in the seeded manifest).
		await setManifestJson(textarea, JSON.stringify(json2, null, 2));
		await page.getByTestId("measure").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"STACK_HAS_NO_SERVER",
		);
	});
});
