# flowspec-mcp

MCP (Model Context Protocol) server for [FlowSpec](https://flowspec.app) — exposes project specifications to Claude Code and other MCP-compatible AI tools.

## Quick Start

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "flowspec": {
      "command": "npx",
      "args": ["-y", "flowspec-mcp"],
      "env": {
        "FLOWSPEC_MODE": "cloud",
        "DATABASE_URL": "your-neon-connection-string",
        "FLOWSPEC_USER_ID": "your-clerk-user-id"
      }
    }
  }
}
```

### Local Mode (with FlowSpec Desktop)

```json
{
  "mcpServers": {
    "flowspec": {
      "command": "npx",
      "args": ["-y", "flowspec-mcp"],
      "env": {
        "FLOWSPEC_MODE": "local"
      }
    }
  }
}
```

Local mode connects to the FlowSpec desktop server at `http://localhost:3456`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FLOWSPEC_MODE` | No | `cloud` | `cloud` for direct Neon SQL, `local` for desktop server HTTP |
| `DATABASE_URL` | Cloud mode | — | Neon Postgres connection string |
| `FLOWSPEC_USER_ID` | Cloud mode | — | Clerk user ID — find yours at [flowspec.app/account](https://flowspec.app/account) |
| `FLOWSPEC_LOCAL_URL` | No | `http://localhost:3456` | Desktop server URL (local mode) |

## Available Tools

### Read Tools
- **`flowspec_list_projects`** — List all projects with names and dates
- **`flowspec_get_json`** — Get full JSON spec for a project (optimised for Claude Code)
- **`flowspec_get_project`** — Get raw canvas_state JSON
- **`flowspec_search_nodes`** — Search nodes by label across all projects
- **`flowspec_get_screen_context`** — Get screen/region/element structure

### Write Tools
- **`flowspec_create_project`** — Create a new project
- **`flowspec_update_project`** — Update project name or canvas state
- **`flowspec_delete_project`** — Delete a project
- **`flowspec_create_node`** — Add a node (datapoint, component, transform, table)
- **`flowspec_update_node`** — Update node data or position
- **`flowspec_delete_node`** — Remove a node and connected edges
- **`flowspec_create_edge`** — Connect two nodes with an edge type
- **`flowspec_delete_edge`** — Remove an edge
- **`flowspec_analyse_project`** — Run orphan node and duplicate label analysis

## Development

```bash
npm install
npm run build
node dist/index.js
```

## Notes

- MCP SDK pinned to `1.12.1` due to zod v4 compatibility constraints in later versions
- Node.js >= 18.0.0 required

## License

MIT
