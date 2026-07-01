# Specter

**OpenAPI-first VS Code extension**: read your `openapi.yaml` → start a local mock server → see breaking changes — without leaving the IDE.

![Mock server running](https://raw.githubusercontent.com/Li0lik/specter/main/images/screenshot.png)

## Features

### 🟢 Mock Server
Start a local HTTP server on `localhost:4010` directly from your OpenAPI spec. No configuration needed — just open a spec file and click the status bar.

```bash
curl localhost:4010/pets
# → [{"id": 1, "name": "Rex"}, {"id": 2, "name": "Whiskers"}]
```

### 🔍 Try It Panel
Browse and test all endpoints directly inside VS Code. Click an endpoint → hit Send → see the response. No Postman, no browser, no context switching.

### ⚡ Breaking Change Diff
Every time you save your spec, Specter compares it against the last Git commit and flags breaking changes in the **Problems panel**:

- Removed endpoints
- Removed or newly required parameters  
- Changed response status codes
- Removed or type-changed response fields

## Usage

1. Open any OpenAPI `.yaml` or `.json` file
2. Click **Mock :4010** in the status bar to start the mock server
3. Open **Specter: Open Try It** from Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Edit and save your spec — breaking changes appear instantly in the Problems panel (`Cmd+Shift+M`)

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `specter.port` | `4010` | Mock server port |
| `specter.autoStart` | `false` | Auto-start mock when opening an OpenAPI file |

## Requirements

- VS Code 1.85+
- Node.js 18+ (bundled with VS Code)
- Git (for diff functionality)

No external tools, no Docker, no CLI setup.

## How it works

Specter reads examples defined in your OpenAPI spec and serves them as HTTP responses. The diff runs against `git HEAD` — so it catches breaking changes before you push.

## License

MIT
