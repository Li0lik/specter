import * as vscode from 'vscode';

/**
 * Status bar entry that reflects mock-server state and toggles it on click.
 */
export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'specter.toggleMock';
    this.setStopped();
    this.item.show();
  }

  setRunning(port: number): void {
    this.item.text = `$(broadcast) 🟢 Mock :${port}`;
    this.item.tooltip = `Specter mock server running on http://localhost:${port} — click to stop`;
    this.item.backgroundColor = undefined;
  }

  setStopped(): void {
    this.item.text = `$(circle-slash) Specter Mock`;
    this.item.tooltip = 'Specter mock server is off — click to start';
    this.item.backgroundColor = undefined;
  }

  setStarting(): void {
    this.item.text = `$(loading~spin) Specter starting…`;
    this.item.tooltip = 'Starting Specter mock server…';
  }

  setError(message: string): void {
    this.item.text = `$(error) Specter`;
    this.item.tooltip = message;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  dispose(): void {
    this.item.dispose();
  }
}
