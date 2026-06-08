// Command domainbind is the AIDOS S97 CUSTOM-DOMAIN binding MCP server (ADR 0009: every backend
// op is an MCP tool; app-builder EPIC 10, DP27 / ADR 0043).
//
// It is the capability door over runtime/domainbind: the DETERMINISTIC plan that binds a custom
// domain to a deployed app, serving it over HTTPS via Traefik + an ACME certresolver (like the
// Workbench behind Traefik, but for the emitted apps). A domain belongs to EXACTLY ONE project —
// the binding domain→project is INJECTIVE. Tools:
//
//	bind         — (registry, request) → content-addressed BindPlan (Traefik HTTPS labels + DNS
//	               CNAME + URL), ONLY when the domain is free (or already bound to the SAME
//	               project, idempotent). A domain owned by another project is refused
//	               DOMAIN_ALREADY_BOUND naming the owner. PURE.
//	serves_https — assert a bind plan actually serves the app over HTTPS (a websecure router +
//	               tls + ACME certresolver on Host(`<domain>`)). Code judges the labels.
//	injective    — assert a set of bindings maps every domain to AT MOST ONE project (the
//	               done-criteria injectivity property). Code judges, never an agent.
//
// THE WALL (CLAUDE.md §2): pure planning + pure comparisons over supplied facts — writes NOTHING
// to the kernel/mirrors/fitness, and makes NO live DNS/ACME call (it plans the CNAME + labels,
// the world is acted on by the emitted Pulumi program / Traefik). A domain already bound, a
// malformed domain — each is a typed BlockReason. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

type bindInput struct {
	Registry domainbind.Registry `json:"registry" jsonschema:"the existing domain→project bindings (already-projected facts, below the line) the injectivity check reads"`
	Request  domainbind.Request  `json:"request" jsonschema:"the bind request: the custom domain, the project, the deploy host (subdomain + root) the domain CNAMEs to, the emitted server service, an optional ACME certresolver"`
}

type bindOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *domainbind.BindPlan     `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func bindTool(_ context.Context, _ *mcp.CallToolRequest, in bindInput) (*mcp.CallToolResult, bindOutput, error) {
	p, br := domainbind.Bind(in.Registry, in.Request)
	if br != nil {
		return nil, bindOutput{OK: false, Block: br}, nil
	}
	return nil, bindOutput{OK: true, Plan: &p}, nil
}

type servesHTTPSInput struct {
	Plan domainbind.BindPlan `json:"plan" jsonschema:"the bind plan built by the bind tool"`
}

type servesHTTPSOutput struct {
	OK     bool `json:"ok"`
	Serves bool `json:"serves_https"`
}

func servesHTTPSTool(_ context.Context, _ *mcp.CallToolRequest, in servesHTTPSInput) (*mcp.CallToolResult, servesHTTPSOutput, error) {
	return nil, servesHTTPSOutput{OK: true, Serves: domainbind.ServesHTTPS(in.Plan)}, nil
}

type injectiveInput struct {
	Bindings []domainbind.Binding `json:"bindings" jsonschema:"the set of domain→project bindings to check for injectivity"`
}

type injectiveOutput struct {
	OK        bool `json:"ok"`
	Injective bool `json:"injective"`
}

func injectiveTool(_ context.Context, _ *mcp.CallToolRequest, in injectiveInput) (*mcp.CallToolResult, injectiveOutput, error) {
	return nil, injectiveOutput{OK: true, Injective: domainbind.IsInjective(in.Bindings)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-domainbind", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "bind", Description: "S97: bind a custom domain to a deployed app — Traefik HTTPS labels (websecure router + tls + ACME certresolver, DP27) + a DNS CNAME to the deploy host + the HTTPS URL. A domain owned by another project is refused DOMAIN_ALREADY_BOUND (injective binding); re-binding to the same project is idempotent. PURE, content-addressed, writes nothing (the wall)."}, bindTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "serves_https", Description: "S97: assert a bind plan serves the app over HTTPS — a websecure Traefik router with tls + an ACME certresolver on Host(`<domain>`). Code judges the labels, never an agent."}, servesHTTPSTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "injective", Description: "S97 done-criteria: assert a set of bindings maps every domain to AT MOST ONE project (the binding domain→project is injective). Code judges, never an agent."}, injectiveTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("domainbind: run: %w", err))
	}
}
