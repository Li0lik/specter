import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import SwaggerParser from '@apidevtools/swagger-parser';
import simpleGit from 'simple-git';

export class DiffProvider {
  private _diagnostics: vscode.DiagnosticCollection;

  constructor(diagnostics: vscode.DiagnosticCollection) {
    this._diagnostics = diagnostics;
  }

  async runDiff(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    const git = simpleGit(path.dirname(filePath));

    // Проверить что файл в git репозитории
    let isRepo = false;
    try {
      await git.status();
      isRepo = true;
    } catch {
      return; // не git репо — пропустить
    }

    // Получить предыдущую версию из HEAD
    let prevContent: string;
    try {
      const repoRoot = (await git.revparse(['--show-toplevel'])).trim();
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      prevContent = await git.show([`HEAD:${relPath}`]);
    } catch {
      // Файл новый, нет в HEAD — пропустить
      this._diagnostics.delete(document.uri);
      return;
    }

    // Записать предыдущую версию во временный файл
    const ext = filePath.endsWith('.json') ? '.json' : '.yaml';
    const tmpFile = path.join(os.tmpdir(), `specter-prev-${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, prevContent, 'utf8');

    try {
      const [prevApi, currApi] = await Promise.all([
        SwaggerParser.dereference(tmpFile) as Promise<any>,
        SwaggerParser.dereference(filePath) as Promise<any>,
      ]);

      const diagnostics: vscode.Diagnostic[] = [];
      const lines = document.getText().split('\n');

      const prevPaths: Record<string, any> = prevApi.paths || {};
      const currPaths: Record<string, any> = currApi.paths || {};

      for (const [p, pathItem] of Object.entries(prevPaths)) {
        for (const method of ['get','post','put','delete','patch','head','options']) {
          const prevOp = pathItem[method];
          if (!prevOp) continue;

          const currOp = currPaths[p]?.[method];

          // Удалён эндпоинт
          if (!currOp) {
            const line = findLine(lines, method, p);
            diagnostics.push(makeDiagnostic(
              document, line,
              `Breaking: ${method.toUpperCase()} ${p} removed`,
              vscode.DiagnosticSeverity.Error
            ));
            continue;
          }

          // Изменился успешный статус-код
          const prevSuccess = Object.keys(prevOp.responses || {}).find(c => c.startsWith('2'));
          const currSuccess = Object.keys(currOp.responses || {}).find(c => c.startsWith('2'));
          if (prevSuccess && currSuccess && prevSuccess !== currSuccess) {
            const line = findLine(lines, method, p);
            diagnostics.push(makeDiagnostic(
              document, line,
              `Breaking: ${method.toUpperCase()} ${p} success status changed ${prevSuccess} → ${currSuccess}`,
              vscode.DiagnosticSeverity.Error
            ));
          }

          // Удалён обязательный параметр или добавлен новый обязательный
          const prevParams: any[] = prevOp.parameters || [];
          const currParams: any[] = currOp.parameters || [];

          for (const pp of prevParams) {
            const cp = currParams.find((x: any) => x.name === pp.name && x.in === pp.in);
            if (!cp) {
              const line = findLine(lines, method, p);
              diagnostics.push(makeDiagnostic(
                document, line,
                `Breaking: ${method.toUpperCase()} ${p} — parameter '${pp.name}' (${pp.in}) removed`,
                vscode.DiagnosticSeverity.Error
              ));
            }
          }

          for (const cp of currParams) {
            const pp = prevParams.find((x: any) => x.name === cp.name && x.in === cp.in);
            if (!pp && cp.required) {
              const line = findLine(lines, method, p);
              diagnostics.push(makeDiagnostic(
                document, line,
                `Breaking: ${method.toUpperCase()} ${p} — new required parameter '${cp.name}' (${cp.in}) added`,
                vscode.DiagnosticSeverity.Warning
              ));
            }
          }

          // Изменения в response schema
          const prevRespCode = Object.keys(prevOp.responses || {}).find(c => c.startsWith('2'));
          if (prevRespCode) {
            const prevSchema = prevOp.responses[prevRespCode]?.content?.['application/json']?.schema;
            const currSchema = currOp.responses[prevRespCode]?.content?.['application/json']?.schema;
            if (prevSchema && currSchema) {
              const schemaIssues = diffSchema(prevSchema, currSchema, p, method.toUpperCase());
              for (const issue of schemaIssues) {
                const line = findLine(lines, method, p);
                diagnostics.push(makeDiagnostic(document, line, issue, vscode.DiagnosticSeverity.Error));
              }
            }
          }
        }
      }

      this._diagnostics.set(document.uri, diagnostics);
    } catch {
      // Невалидная спека (текущая или предыдущая) — не засоряем Problems старыми ошибками
      this._diagnostics.delete(document.uri);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  dispose() {
    this._diagnostics.dispose();
  }
}

function diffSchema(prev: any, curr: any, path: string, method: string): string[] {
  const issues: string[] = [];

  // Изменился тип
  if (prev.type && curr.type && prev.type !== curr.type) {
    issues.push(`Breaking: ${method} ${path} — response type changed '${prev.type}' → '${curr.type}'`);
  }

  // Удалено поле из объекта
  if (prev.type === 'object' && prev.properties) {
    for (const field of Object.keys(prev.properties)) {
      if (!curr.properties?.[field]) {
        issues.push(`Breaking: ${method} ${path} — response field '${field}' removed`);
      } else {
        const pt = prev.properties[field].type;
        const ct = curr.properties[field].type;
        if (pt && ct && pt !== ct) {
          issues.push(`Breaking: ${method} ${path} — response field '${field}' type changed '${pt}' → '${ct}'`);
        }
      }
    }
  }

  // Для array — проверить items
  if (prev.type === 'array' && prev.items && curr.items) {
    const subIssues = diffSchema(prev.items, curr.items, path, method);
    issues.push(...subIssues);
  }

  return issues;
}

function findLine(lines: string[], method: string, apiPath: string): number {
  // Ищем строку с методом рядом с путём
  const pathLine = lines.findIndex(l => l.includes(apiPath));
  if (pathLine === -1) return 0;
  for (let i = pathLine; i < Math.min(pathLine + 5, lines.length); i++) {
    if (lines[i].trim().startsWith(method + ':')) return i;
  }
  return pathLine;
}

function makeDiagnostic(
  document: vscode.TextDocument,
  line: number,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const safeLine = Math.min(Math.max(line, 0), Math.max(document.lineCount - 1, 0));
  const lineText = document.lineAt(safeLine).text;
  const range = new vscode.Range(safeLine, 0, safeLine, lineText.length);
  const diag = new vscode.Diagnostic(range, message, severity);
  diag.source = 'Specter';
  return diag;
}
