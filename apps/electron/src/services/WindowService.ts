import * as http from 'http';
import * as path from 'path';
import { BrowserWindow, app } from 'electron';
import { Channels } from '@ag/protocol';
import { ILifecycleService, IpcHandlerRegistration } from './IService';
import { NavigationPolicy } from '../security/NavigationPolicy';
import { ServiceId, ServiceIds } from './ServiceIds';

export interface IWindowService extends ILifecycleService {
  createMainWindow(): Promise<void>;
  broadcast(channel: string, payload: any): void;
}

export class WindowService implements IWindowService {
  public readonly id = ServiceIds.Window;
  public readonly dependencies: readonly ServiceId[] = [];
  private windows = new Map<string, BrowserWindow>();
  private devServerPort: number = 3000;

  public async initialize(): Promise<void> {
    await app.whenReady();
  }

  public async start(): Promise<void> {
    const isDev = !app.isPackaged;
    if (isDev) {
      this.devServerPort = await this.findDevServerPort();
    }

    await this.createMainWindow();

    app.on('activate', () => {
      if (this.windows.size === 0) {
        this.createMainWindow();
      }
    });
  }

  public async createMainWindow(): Promise<void> {
    const mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        webviewTag: false,
      }
    });

    // Remove the default native menu (VS Code style custom menu)
    mainWindow.removeMenu();

    // Environment-aware bootstrap
    const isDev = !app.isPackaged;
    NavigationPolicy.initialize(isDev, this.devServerPort);

    if (isDev) {
      await mainWindow.webContents.session.clearCache();
      await mainWindow.loadURL(`http://localhost:${this.devServerPort}`);
    } else {
      await mainWindow.loadURL('app://-/index.html');
    }

    // Navigation and Popup locks
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!NavigationPolicy.isNavigationAllowed(url)) {
        event.preventDefault();
        console.warn(`Blocked unauthorized navigation to: ${url}`);
      }
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[BROWSER CONSOLE] [${sourceId}:${line}] ${message}`);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!NavigationPolicy.isPopupAllowed(url)) {
        console.warn(`Blocked unauthorized popup window to: ${url}`);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Session CSP and Compression Fix
    const session = mainWindow.webContents.session;

    // Strip Accept-Encoding to prevent Brotli/Gzip truncation bugs in Electron
    session.webRequest.onBeforeSendHeaders((details, callback) => {
      const { requestHeaders } = details;
      delete requestHeaders['Accept-Encoding'];
      delete requestHeaders['accept-encoding'];
      callback({ requestHeaders });
    });

    this.windows.set('main', mainWindow);

    mainWindow.on('closed', () => {
      this.windows.delete('main');
    });
  }

  public async stop(): Promise<void> {
    for (const [, window] of this.windows) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
  }

  public async dispose(): Promise<void> {
    this.windows.clear();
  }

  public broadcast(channel: string, payload: any): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    }
  }

  private async findDevServerPort(): Promise<number> {
    const maxRetries = 60; // 60 attempts (60 seconds)
    let attempt = 0;

    console.log('[WindowService] Waiting for Next.js dev server to start...');

    while (attempt < maxRetries) {
      for (let port = 3000; port <= 3020; port++) {
        try {
          const isOurApp = await new Promise<boolean>((resolve) => {
            const req = http.get(`http://localhost:${port}/`, (res: any) => {
              // Consume data stream to prevent memory leak
              res.resume();
              res.on('end', () => {
                resolve(res.statusCode === 200);
              });
            });
            req.on('error', () => resolve(false));
            req.setTimeout(500, () => {
              req.destroy();
              resolve(false);
            });
          });

          if (isOurApp) {
            console.log(`[WindowService] Found dev server on port ${port} after ${attempt + 1} attempts`);
            return port;
          }
        } catch {
          // Continue scanning
        }
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.warn('[WindowService] Could not find dev server after 60 seconds, defaulting to 3000');
    return 3000;
  }

  public async health(): Promise<boolean> {
    return true;
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Window.CreateRequest,
        handler: async () => {
          console.log('[WindowService] CreateRequest');
          await this.createMainWindow();
        }
      },
      {
        channel: Channels.Window.CloseRequest,
        handler: async (_payload: void, ctx: any) => {
          console.log('[WindowService] CloseRequest');
          const window = BrowserWindow.fromWebContents(ctx.sender);
          if (window && !window.isDestroyed()) {
            window.close();
          }
        }
      },
      {
        channel: Channels.App.QuitRequest,
        handler: async () => {
          console.log('[WindowService] QuitRequest');
          app.quit();
        }
      }
    ];
  }
}