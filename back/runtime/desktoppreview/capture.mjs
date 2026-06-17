// capture.mjs — the CDP capture leg of the desktoppreview Runner (the gated I/O adapter, §6/§8).
// Reuses Electron's BUILT-IN Chrome DevTools Protocol (the "webVNC" of the GUI, no VNC server): it
// finds the running app's page target, connects to its devtools websocket, and captures the rendered
// window as a JPEG. Driven by the Go runner (runner.go) which owns the electron+xvfb lifecycle.
//
// Determinism note: this script is PURE TRANSPORT — it adds no logic, no clock, no guessing. Its
// output (a JPEG of a live window) is the inherently non-deterministic I/O the runner isolates here.
// Invoked as: node capture.mjs <cdpHttpBase> <outFile> [waitMs]
// Writes the JPEG bytes to <outFile> and prints "OK <byteLen> <width>x<height>" to stdout.

import { writeFileSync } from "node:fs";

const [cdpBase, outFile, waitMsArg] = process.argv.slice(2);
if (!cdpBase || !outFile) {
	console.error("usage: node capture.mjs <cdpHttpBase> <outFile> [waitMs]");
	process.exit(2);
}
const waitMs = Number(waitMsArg || "0");

function fail(msg) {
	console.error(msg);
	process.exit(1);
}

// Poll the CDP /json list until a page target with a webSocketDebuggerUrl appears (the renderer
// process is up). The runner already waited for the browser endpoint; this is the page-level wait.
async function findPageTarget(deadline) {
	for (;;) {
		try {
			const res = await fetch(`${cdpBase}/json`);
			const targets = await res.json();
			const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
			if (page) return page;
		} catch {
			// CDP not ready yet — keep polling until the deadline.
		}
		if (Date.now() > deadline) fail("no page target before deadline");
		await new Promise((r) => setTimeout(r, 200));
	}
}

const page = await findPageTarget(Date.now() + 15000);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) =>
	new Promise((res, rej) => {
		const mid = ++id;
		const onMsg = (e) => {
			const m = JSON.parse(e.data);
			if (m.id === mid) {
				ws.removeEventListener("message", onMsg);
				if (m.error) rej(new Error(`${method}: ${m.error.message}`));
				else res(m.result);
			}
		};
		ws.addEventListener("message", onMsg);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});

ws.addEventListener("error", (e) => fail(`ws error: ${e.message || e}`));
ws.addEventListener("open", async () => {
	try {
		await send("Page.enable");
		// Give the React renderer a beat to mount + Tailwind CDN to paint (the desktop shell renders
		// its panel grid + action bar off a deterministic seed, no backend needed).
		if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
		const metrics = await send("Page.getLayoutMetrics").catch(() => null);
		const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
		if (!shot || !shot.data) fail("captureScreenshot returned no data");
		const buf = Buffer.from(shot.data, "base64");
		writeFileSync(outFile, buf);
		const w = metrics?.cssVisualViewport?.clientWidth || metrics?.layoutViewport?.clientWidth || 0;
		const h = metrics?.cssVisualViewport?.clientHeight || metrics?.layoutViewport?.clientHeight || 0;
		console.log(`OK ${buf.length} ${Math.round(w)}x${Math.round(h)}`);
		process.exit(0);
	} catch (err) {
		fail(`capture failed: ${err.message}`);
	}
});
