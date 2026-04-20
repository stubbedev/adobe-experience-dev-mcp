# Adobe Experience Assets Dev MCP

An MCP server that helps you design, validate, and generate Adobe Experience Manager Assets API calls for integration work.

This server focuses on the practical integration flow you asked for:

- Upload assets (direct binary upload flow)
- Create and manage folders/directories
- Sync and update metadata in bulk-friendly patterns

The server constructs request plans. It does not execute HTTP calls.

## What it does

- Builds valid request blueprints for AEM Assets operations
- Returns HTTP method, endpoint, headers, and body payload templates
- Provides upload planning guidance (initiate, chunking, complete)
- Helps with metadata sync manifests for multiple assets
- Loads tool categories on demand so startup stays lean

## Tools

### Always available

- `list_categories`
- `aem_set_context`
- `aem_get_context`
- `aem_reset_context`
- `load_category`
- `search_aem_assets_api`
- `aem_list_operation_presets`
- `aem_get_operation_preset`
- `aem_validate_integration_plan`
- `aem_explain_auth`
- `aem_explain_pagination`
- `aem_explain_hierarchy_data_access`
- `aem_plan_efficient_upload_metadata_sync`
- `aem_explain_upload_flow`
- `aem_explain_metadata_sync`
- `aem_explain_error_handling`
- `aem_explain_implementation_playbook`

### Categories (loaded on demand)

- `uploads` - direct binary upload flow helpers
- `folders` - create/list/copy/move/delete folders
- `assets` - get/copy/move/delete assets
- `metadata` - get/update metadata and build sync manifests
- `search` - Query Builder discovery and delta-window retrieval
- `renditions` - create/update/delete rendition binaries

## Installation

Run with `npx`:

```bash
npx -y @stubbedev/adobe-experience-dev-mcp
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "adobe-experience-dev": {
      "command": "npx",
      "args": ["-y", "@stubbedev/adobe-experience-dev-mcp"]
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add adobe-experience-dev -- npx -y @stubbedev/adobe-experience-dev-mcp
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "adobe-experience-dev": {
      "command": "npx",
      "args": ["-y", "@stubbedev/adobe-experience-dev-mcp"]
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "adobe-experience-dev": {
      "command": "npx",
      "args": ["-y", "@stubbedev/adobe-experience-dev-mcp"]
    }
  }
}
```

### OpenCode

`~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "adobe-experience-dev": {
      "type": "local",
      "command": ["npx", "-y", "@stubbedev/adobe-experience-dev-mcp"]
    }
  }
}
```

## Development

```bash
git clone https://github.com/stubbedev/adobe-experience-dev-mcp.git
cd adobe-experience-dev-mcp
npm install
npm run build
npm start
```

For live development:

```bash
npm run dev
```

Smoke check:

```bash
npm run smoke
```

Run regression tests:

```bash
npm run test
```

Run routing/accuracy eval harness:

```bash
npm run eval:accuracy
```

## License

MIT
