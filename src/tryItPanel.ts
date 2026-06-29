import * as vscode from 'vscode';
import SwaggerParser from '@apidevtools/swagger-parser';

export class TryItPanel {
  static currentPanel: TryItPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _port: number;

  static createOrShow(context: vscode.ExtensionContext, port: number, specPath?: string) {
    const column = vscode.ViewColumn.Beside;

    if (TryItPanel.currentPanel) {
      TryItPanel.currentPanel._port = port;
      TryItPanel.currentPanel._panel.reveal(column);
      if (specPath) TryItPanel.currentPanel._loadSpec(specPath);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'specterTryIt',
      'Specter: Try It',
      column,
      { enableScripts: true }
    );

    TryItPanel.currentPanel = new TryItPanel(panel, port, specPath);
  }

  private constructor(panel: vscode.WebviewPanel, port: number, specPath?: string) {
    this._panel = panel;
    this._port = port;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'request') {
          try {
            const url = `http://localhost:${this._port}${message.path}`;
            const options: RequestInit = {
              method: message.method,
              headers: { 'Content-Type': 'application/json' },
            };
            if (message.body) {
              options.body = message.body;
            }
            const res = await fetch(url, options);
            const text = await res.text();
            this._panel.webview.postMessage({
              command: 'response',
              status: res.status,
              statusText: res.statusText,
              body: text,
            });
          } catch (err: any) {
            this._panel.webview.postMessage({
              command: 'response',
              status: 0,
              statusText: 'Connection refused',
              body: JSON.stringify({ error: 'Mock server not running. Start it first.' }),
            });
          }
        }
      },
      null,
      this._disposables
    );

    // Load the spec immediately using the path captured before the panel
    // stole focus — don't wait for a loadSpec round-trip from the webview.
    if (specPath) {
      this._loadSpec(specPath);
    }
  }

  private async _loadSpec(specPath: string) {
    try {
      const api = await SwaggerParser.dereference(specPath) as any;
      const endpoints: any[] = [];

      for (const [path, pathItem] of Object.entries(api.paths || {} as Record<string, any>)) {
        for (const method of ['get','post','put','delete','patch','head','options']) {
          const op = (pathItem as any)[method];
          if (!op) continue;

          let bodyExample = '';
          const rb = op.requestBody?.content?.['application/json'];
          if (rb?.example) bodyExample = JSON.stringify(rb.example, null, 2);
          else if (rb?.examples) {
            const first = Object.values(rb.examples as Record<string, any>)[0];
            bodyExample = JSON.stringify(first?.value ?? {}, null, 2);
          } else if (rb?.schema?.example) {
            bodyExample = JSON.stringify(rb.schema.example, null, 2);
          }

          endpoints.push({ method: method.toUpperCase(), path, summary: op.summary || '', bodyExample });
        }
      }

      this._panel.webview.postMessage({ command: 'spec', endpoints });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Specter: failed to parse spec — ${err.message}`);
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Specter Try It</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
  }
  h2 { margin-bottom: 12px; font-size: 14px; opacity: 0.7; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  .endpoint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 4px;
    user-select: none;
  }
  .endpoint:hover { background: var(--vscode-list-hoverBackground); }
  .endpoint.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    min-width: 52px;
    text-align: center;
    color: #fff;
  }
  .GET    { background: #4caf50; }
  .POST   { background: #2196f3; }
  .PUT    { background: #ff9800; }
  .DELETE { background: #f44336; }
  .PATCH  { background: #9c27b0; }
  .HEAD   { background: #607d8b; }
  .path { font-family: monospace; font-size: 13px; flex: 1; }
  .summary { opacity: 0.6; font-size: 12px; }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border, #444); margin: 16px 0; }
  .request-panel { margin-top: 12px; }
  .url-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .url-bar span { font-family: monospace; font-size: 13px; flex: 1; padding: 6px 8px; background: var(--vscode-input-background); border-radius: 3px; border: 1px solid var(--vscode-input-border, #555); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  textarea {
    width: 100%;
    min-height: 80px;
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 8px;
    font-family: monospace;
    font-size: 12px;
    resize: vertical;
    margin-bottom: 10px;
  }
  label { display: block; font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
  .response-box {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 10px;
    margin-top: 10px;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow: auto;
  }
  .status { font-weight: 700; margin-bottom: 6px; }
  .status.ok { color: #4caf50; }
  .status.err { color: #f44336; }
  .empty { opacity: 0.4; text-align: center; margin-top: 40px; font-size: 13px; }
</style>
</head>
<body>
<h2>Specter Try It</h2>
<div id="list"><p class="empty">Loading endpoints...</p></div>
<div id="detail" style="display:none">
  <hr>
  <div class="request-panel">
    <div class="url-bar">
      <span id="req-url"></span>
      <button onclick="sendRequest()">Send</button>
    </div>
    <div id="body-section" style="display:none">
      <label>Request Body (JSON)</label>
      <textarea id="req-body" placeholder='{"key": "value"}'></textarea>
    </div>
    <div id="response" style="display:none">
      <div class="status" id="res-status"></div>
      <div class="response-box" id="res-body"></div>
    </div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let selected = null;

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'spec') renderEndpoints(msg.endpoints);
    if (msg.command === 'response') renderResponse(msg);
  });

  function renderEndpoints(endpoints) {
    const list = document.getElementById('list');
    if (!endpoints.length) {
      list.innerHTML = '<p class="empty">No endpoints found in spec.</p>';
      return;
    }
    list.innerHTML = endpoints.map((ep, i) =>
      \`<div class="endpoint" onclick="selectEndpoint(\${i})" data-i="\${i}">
        <span class="badge \${ep.method}">\${ep.method}</span>
        <span class="path">\${ep.path}</span>
        <span class="summary">\${ep.summary}</span>
      </div>\`
    ).join('');
    window._endpoints = endpoints;
  }

  function selectEndpoint(i) {
    selected = window._endpoints[i];
    document.querySelectorAll('.endpoint').forEach(el => el.classList.remove('active'));
    document.querySelector(\`[data-i="\${i}"]\`).classList.add('active');

    document.getElementById('req-url').textContent = selected.method + ' localhost:4010' + selected.path;
    const needsBody = ['POST','PUT','PATCH'].includes(selected.method);
    document.getElementById('body-section').style.display = needsBody ? 'block' : 'none';
    if (needsBody && selected.bodyExample) {
      document.getElementById('req-body').value = selected.bodyExample;
    }
    document.getElementById('response').style.display = 'none';
    document.getElementById('detail').style.display = 'block';
  }

  function sendRequest() {
    if (!selected) return;
    const body = ['POST','PUT','PATCH'].includes(selected.method)
      ? document.getElementById('req-body').value
      : null;
    document.getElementById('res-status').textContent = 'Sending...';
    document.getElementById('res-body').textContent = '';
    document.getElementById('response').style.display = 'block';
    vscode.postMessage({ command: 'request', method: selected.method, path: selected.path, body });
  }

  function renderResponse(msg) {
    const statusEl = document.getElementById('res-status');
    const bodyEl = document.getElementById('res-body');
    const ok = msg.status >= 200 && msg.status < 300;
    statusEl.className = 'status ' + (ok ? 'ok' : 'err');
    statusEl.textContent = msg.status + ' ' + msg.statusText;
    try {
      bodyEl.textContent = JSON.stringify(JSON.parse(msg.body), null, 2);
    } catch {
      bodyEl.textContent = msg.body;
    }
  }
</script>
</body>
</html>`;
  }

  dispose() {
    TryItPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
