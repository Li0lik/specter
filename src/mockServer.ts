import * as vscode from 'vscode';
import * as http from 'http';
import SwaggerParser from '@apidevtools/swagger-parser';

let server: http.Server | null = null;

export async function startMock(specPath: string, port = 4010): Promise<void> {
  await stopMock();

  const api = await SwaggerParser.dereference(specPath) as any;

  server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toLowerCase();

    if (method === 'options') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const paths: Record<string, any> = api.paths || {};
    let matchedOperation: any = null;

    for (const [path, pathItem] of Object.entries(paths)) {
      const regexStr = path.replace(/\{[^}]+\}/g, '[^/]+');
      const regex = new RegExp(`^${regexStr}$`);
      if (regex.test(pathname) && pathItem[method]) {
        matchedOperation = pathItem[method];
        break;
      }
    }

    if (!matchedOperation) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Not found', path: pathname, method: method.toUpperCase() }));
      return;
    }

    const responses = matchedOperation.responses || {};
    const successCode = Object.keys(responses).find(c => c.startsWith('2')) || '200';
    const response = responses[successCode];
    const statusCode = parseInt(successCode, 10);

    let body: any = {};

    if (response?.content?.['application/json']) {
      const content = response.content['application/json'];
      if (content.examples) {
        const firstKey = Object.keys(content.examples)[0];
        body = content.examples[firstKey]?.value ?? {};
      } else if (content.example !== undefined) {
        body = content.example;
      } else if (content.schema?.example !== undefined) {
        body = content.schema.example;
      } else if (content.schema?.type === 'array') {
        const itemEx = content.schema?.items?.example;
        body = itemEx !== undefined ? [itemEx] : [];
      } else if (content.schema?.properties) {
        body = Object.fromEntries(
          Object.entries(content.schema.properties as Record<string, any>)
            .map(([k, v]) => [k, v.example ?? null])
        );
      }
    }

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(body, null, 2));
  });

  await new Promise<void>((resolve, reject) => {
    server!.listen(port, '127.0.0.1', () => resolve());
    server!.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        vscode.window.showErrorMessage(
          `Specter: port ${port} is already in use. Change specter.port in Settings.`
        );
      }
      reject(err);
    });
  });

  vscode.window.showInformationMessage(`Specter: mock running on localhost:${port}`);
}

export async function stopMock(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
}

export function isRunning(): boolean {
  return server !== null;
}
