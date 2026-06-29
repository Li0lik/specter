import * as vscode from 'vscode';
import { startMock as startMockServer, stopMock as stopMockServer, isRunning } from './mockServer';
import { StatusBar } from './statusBar';
import { DiffProvider } from './diffProvider';
import { TryItPanel } from './tryItPanel';

let statusBar: StatusBar;
let diffProvider: DiffProvider;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBar();
  const diagnostics = vscode.languages.createDiagnosticCollection('specter');
  diffProvider = new DiffProvider(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand('specter.startMock', () => startMock()),
    vscode.commands.registerCommand('specter.stopMock', () => stopMock()),
    vscode.commands.registerCommand('specter.toggleMock', () =>
      isRunning() ? stopMock() : startMock()
    ),
    vscode.commands.registerCommand('specter.openTryIt', () => openTryIt(context)),
    statusBar,
    diffProvider
  );

  // Diff on save for OpenAPI-looking documents.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (isOpenApiDocument(doc)) {
        try {
          await diffProvider.runDiff(doc);
        } catch {
          /* diff failures are non-fatal */
        }
      }
    })
  );

  // Optional auto-start.
  const cfg = vscode.workspace.getConfiguration('specter');
  if (cfg.get<boolean>('autoStart')) {
    const editor = vscode.window.activeTextEditor;
    if (editor && isOpenApiDocument(editor.document)) {
      void startMock();
    }
  }
}

export async function deactivate(): Promise<void> {
  await stopMockServer();
}

function currentPort(): number {
  return vscode.workspace.getConfiguration('specter').get<number>('port', 4010);
}

/** Resolve the spec path to operate on: active editor, else any open OpenAPI doc. */
function resolveSpecPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && isOpenApiDocument(editor.document)) {
    return editor.document.uri.fsPath;
  }
  const doc = vscode.workspace.textDocuments.find(isOpenApiDocument);
  return doc?.uri.fsPath;
}

async function startMock(): Promise<void> {
  const specPath = resolveSpecPath();
  if (!specPath) {
    vscode.window.showWarningMessage(
      'Specter: open an OpenAPI (.yaml/.json) document before starting the mock server.'
    );
    return;
  }

  const port = currentPort();
  statusBar.setStarting();
  try {
    await startMockServer(specPath, port);
    statusBar.setRunning(port);
  } catch (err) {
    statusBar.setStopped();
    // mockServer already surfaces the EADDRINUSE message; only report others.
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      vscode.window.showErrorMessage(`Specter: failed to start mock — ${(err as Error).message}`);
    }
  }
}

async function stopMock(): Promise<void> {
  await stopMockServer();
  statusBar.setStopped();
}

function openTryIt(context: vscode.ExtensionContext): void {
  const specPath = resolveSpecPath();
  if (!specPath) {
    vscode.window.showWarningMessage('Specter: open an OpenAPI document before opening Try It.');
    return;
  }
  TryItPanel.createOrShow(context, currentPort(), specPath);
}

/**
 * Heuristic: a YAML/JSON document whose text mentions an `openapi:`/`swagger:`
 * root key. Cheap enough to run on save without parsing.
 */
function isOpenApiDocument(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== 'yaml' && doc.languageId !== 'json') {
    return false;
  }
  const head = doc.getText().slice(0, 4000);
  return /(^|\n)\s*["']?(openapi|swagger)["']?\s*:/.test(head);
}
