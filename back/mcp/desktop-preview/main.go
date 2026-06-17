// Command desktop-preview is the AIDOS "voir Electron" MCP server (ADR 0009: every backend op is an
// MCP tool). It is the capability door over back/runtime/desktoppreview — the path to SEE the emitted
// Electron desktop child run, not just read its source.
//
// Two modes, one library (desktoppreviewsrv — reused in-process by the gateway dispatcher, no twin):
//
//	(default)        stdio MCP server: desktop_children · desktop_bundle (PURE) · desktop_frame (gated).
//	-capture <out>   one-shot: boot the demo desktop child headless (Xvfb) and write ONE CDP frame
//	                 (JPEG) to <out>, then exit. This is what the Workbench route handler spawns for
//	                 the live view — a robust, dependency-light transport for the heavy capture.
//
// THE WALL (§2): every path is a below-the-line projection; nothing writes truth. DETERMINISM-FIRST
// (§6/§8): the children/bundle are pure; only the live frame is the gated, isolated I/O exception.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/mcp/desktop-preview/desktoppreviewsrv"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

func main() {
	capture := flag.String("capture", "", "one-shot: capture a desktop frame to this JPEG path, then exit")
	children := flag.Bool("children", false, "one-shot: print the master's 3 emitted children (web/mobile/desktop) as JSON, then exit")
	flag.Parse()

	if *children {
		os.Exit(runChildren())
	}
	if *capture != "" {
		os.Exit(runCapture(*capture))
	}

	ctx := context.Background()
	srv := desktoppreviewsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("desktop-preview: run: %w", err))
	}
}

// runChildren prints the demo master's three emitted children (web/mobile/desktop) — their content
// addresses, targets and artifact paths — as JSON to stdout. The Workbench route handler spawns this
// to populate the "3 enfants" view from the engine (no twin), without a gateway edit. PURE.
func runChildren() int {
	out, err := desktoppreviewsrv.DemoChildrenJSON()
	if err != nil {
		fmt.Fprintf(os.Stderr, "children: %v\n", err)
		return 1
	}
	fmt.Println(out)
	return 0
}

// runCapture boots the demo desktop child and writes one frame to out. Exit 0 on a real frame, 3
// when the host has no preview toolchain/display (the caller renders the bundle's file tree instead),
// 1 on a hard failure.
func runCapture(out string) int {
	master, br := honoemit.EmitMasterView(honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	})
	if br != nil {
		fmt.Fprintf(os.Stderr, "emit master: %s\n", br.Explanation)
		return 1
	}
	child, br := honoemit.EmitDesktopChild(master)
	if br != nil {
		fmt.Fprintf(os.Stderr, "emit desktop child: %s\n", br.Explanation)
		return 1
	}
	res, available, reason := desktoppreviewsrv.CaptureDemoFrame(context.Background(), child)
	if !available {
		fmt.Fprintf(os.Stderr, "preview unavailable: %s\n", reason)
		return 3
	}
	if err := os.WriteFile(out, res.JPEG, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write frame: %v\n", err)
		return 1
	}
	fmt.Printf("OK %d %dx%d %s\n", len(res.JPEG), res.Width, res.Height, res.BundleHash)
	return 0
}
