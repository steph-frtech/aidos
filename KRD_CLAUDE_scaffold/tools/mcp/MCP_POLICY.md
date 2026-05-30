# MCP Policy

Every MCP capability must have:
- purpose
- input schema
- output schema
- permissions
- forbidden writes
- BDD scenario
- related hooks

MCP tools may propose or retrieve context.
They must not write directly to /kernel or above-the-line mirrors.
