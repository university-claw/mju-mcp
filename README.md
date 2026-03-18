# myongji-lms-mcp

TypeScript skeleton for a read-only MCP server that will wrap Myongji LMS.

## Why this stack

- MCP server runtime: `@modelcontextprotocol/sdk` v1.x
- Language: TypeScript
- Planned HTTP/session layer: `got` + `tough-cookie`
- Planned parsing layer: `cheerio`
- Planned schema validation: `zod`

The official MCP TypeScript SDK `main` branch is already on v2 pre-alpha, but v1.x is still the recommended production line right now. This repo is set up so we can build on stable v1 first and migrate later with smaller surface area.

## Current status

This commit only sets up the project skeleton:

- package scripts
- TypeScript compiler settings
- environment variable template
- source directory layout for future LMS and MCP modules

The LMS login/session port and actual MCP tools are intentionally not implemented yet.

SSO login is now available as a standalone TypeScript CLI while the MCP layer is still under construction.
The login flow prefers a saved session first and falls back to a fresh SSO login only when needed.
The MCP stdio server bootstrap is also in place, but the LMS read-only tools themselves are not implemented yet.

## Planned layout

- `src/index.ts`: top-level process entrypoint
- `src/lms/`: Myongji LMS HTTP, session, and parser modules
- `src/mcp/`: MCP server bootstrap and wiring
- `src/tools/`: tool registrations and tool-specific handlers

At the current milestone:

- `src/cli/login-sso.ts` is the standalone login verifier
- `src/mcp/server.ts` creates the MCP server and attaches stdio transport
- `src/tools/index.ts` is the future tool registration point and is currently a no-op

## Quick start

```bash
npm install
npm run check
npm run build
npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD
npm run login:sso -- --fresh-login --id YOUR_ID --password YOUR_PASSWORD
```

## Environment variables

- `MJU_LMS_USER_ID`
- `MJU_LMS_PASSWORD`
- `MJU_LMS_SESSION_FILE`
- `MJU_LMS_MAIN_HTML_FILE`
- `MJU_LMS_COURSES_FILE`
