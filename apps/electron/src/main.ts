import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { app, protocol, net } from 'electron';

// Bootstrap development environment variables from root .env if available
try {
  const candidateEnvPaths = [
    path.resolve(__dirname, '..', '..', '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];
  for (const rootEnvPath of candidateEnvPaths) {
    if (fs.existsSync(rootEnvPath)) {
      const content = fs.readFileSync(rootEnvPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          val = val.replace(/\\n/g, '\n');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      break;
    }
  }
} catch {
  // Non-fatal in production or isolated environments
}

import { ApplicationHost } from './ApplicationHost';
import { ServiceIds } from './services/ServiceIds';
import { WindowService } from './services/WindowService';
import { ExternalLinkService } from './services/ExternalLinkService';
import { ElectronShellLauncher } from './services/ElectronShellLauncher';
import { TerminalService } from './services/TerminalService';
import { WorkspaceService } from './services/WorkspaceService';
import { WorkspaceEventBroker } from './services/WorkspaceEventBroker';
import { FileWatcherService } from './services/FileWatcherService';
import { TaskService } from './services/tasks/TaskService';
import { MenuService } from './services/MenuService';
import { WorkspaceExecutionService } from './services/execution/WorkspaceExecutionService';
import { ExecutionContextResolver } from './services/execution/ExecutionContextResolver';
import { DefaultProfileResolver } from './services/execution/resolvers/ProfileResolver';
import { DefaultEnvironmentResolver } from './services/execution/resolvers/EnvironmentResolver';
import { DefaultWorkingDirectoryResolver } from './services/execution/resolvers/WorkingDirectoryResolver';
import { DefaultShellResolver } from './services/execution/resolvers/ShellResolver';
import { RegistryCapabilityResolver } from './services/execution/resolvers/CapabilityResolver';
import { ExecutionPolicyPipeline } from './services/execution/policies/IExecutionPolicyPipeline';
import { ExecutionBackendRegistry } from './services/terminal/pty/types';
import { LocalBackend } from './services/terminal/pty/LocalBackend';
import { DockerBackend } from './services/terminal/pty/DockerBackend';
import { WebSocketTerminalServer } from './services/WebSocketTerminalServer';
import { IntelligenceManager } from './services/IntelligenceManager';
import { AgentIpcService } from './services/AgentIpcService';
import { ConfigService } from './services/ConfigService';

// Register custom protocol for loading Next.js static export files securely
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
    },
  },
]);

// Single instance lock for gravitron:// deep-linking support
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('gravitron', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('gravitron');
  }
}

// Set up the application host
const host = new ApplicationHost();

// Set up execution layer
const backendRegistry = new ExecutionBackendRegistry();
backendRegistry.register(new LocalBackend());
backendRegistry.register(new DockerBackend());

const contextResolver = new ExecutionContextResolver(
  new DefaultProfileResolver(),
  new DefaultEnvironmentResolver(),
  new DefaultWorkingDirectoryResolver(),
  new DefaultShellResolver(),
  new RegistryCapabilityResolver(backendRegistry)
);

const policyPipeline = new ExecutionPolicyPipeline();

const executionService = new WorkspaceExecutionService(
  contextResolver,
  policyPipeline,
  backendRegistry
);

// Register services via constructor injection
const windowService = new WindowService();
const eventBroker = new WorkspaceEventBroker(windowService);
const fileWatcherService = new FileWatcherService(eventBroker);

host.getServiceContainer().register(windowService);
host.getServiceContainer().register(new ExternalLinkService(new ElectronShellLauncher()));
host.getServiceContainer().register(executionService);
host.getServiceContainer().register(new MenuService());
host.getServiceContainer().register(new ConfigService());

const workspaceService = new WorkspaceService(fileWatcherService, eventBroker);
workspaceService.onWorkspaceClosed((workspaceId) => {
  executionService.cleanupWorkspace(workspaceId).catch((err) => {
    console.error(`[main] Failed to cleanup workspace terminals for ${workspaceId}:`, err);
  });
});

const intelligenceManager = new IntelligenceManager();

host.getServiceContainer().register(workspaceService);
host.getServiceContainer().register(intelligenceManager);

host
  .getServiceContainer()
  .register(
    new AgentIpcService(windowService, workspaceService, executionService, intelligenceManager)
  );

host.getServiceContainer().register(
  new TerminalService(
    () => host.getServiceContainer().get(ServiceIds.Window),
    () => host.getServiceContainer().get(ServiceIds.WorkspaceExecution)
  )
);

host.getServiceContainer().register(
  new TaskService(
    () => host.getServiceContainer().get(ServiceIds.Window),
    () => host.getServiceContainer().get(ServiceIds.WorkspaceExecution)
  )
);

const wsServer = new WebSocketTerminalServer(
  () => host.getServiceContainer().get(ServiceIds.WorkspaceExecution),
  8081
);
host.getServiceContainer().register(wsServer);
wsServer.start().catch(console.error);

// Boot
app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let decodedPathname: string;

    try {
      decodedPathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const frontendRoot = path.resolve(
      app.isPackaged
        ? path.join(process.resourcesPath, 'frontend', 'dist')
        : path.join(app.getAppPath(), '..', 'frontend', 'dist')
    );

    const cleanPathname = decodedPathname.replace(/^\//, '');
    let targetRelativePath = cleanPathname;

    if (!targetRelativePath || targetRelativePath === 'index.html') {
      targetRelativePath = 'index.html';
    } else if (targetRelativePath === 'dashboard') {
      targetRelativePath = 'dashboard.html';
    } else if (targetRelativePath === 'dashboard/ide') {
      targetRelativePath = 'dashboard/ide.html';
    } else if (targetRelativePath === 'dashboard/settings') {
      targetRelativePath = 'dashboard/settings.html';
    } else if (targetRelativePath === 'login') {
      targetRelativePath = 'login.html';
    } else if (targetRelativePath === 'register') {
      targetRelativePath = 'register.html';
    } else if (targetRelativePath === 'verify-email') {
      targetRelativePath = 'verify-email.html';
    } else if (targetRelativePath === 'forgot-password') {
      targetRelativePath = 'forgot-password.html';
    } else if (targetRelativePath === 'reset-password') {
      targetRelativePath = 'reset-password.html';
    }

    const candidatePath = path.resolve(frontendRoot, targetRelativePath);

    const isInsideFrontend =
      candidatePath === frontendRoot || candidatePath.startsWith(frontendRoot + path.sep);

    if (!isInsideFrontend) {
      return new Response('Bad Request', { status: 400 });
    }

    return net.fetch(pathToFileURL(candidatePath).toString()).catch(() => {
      // Fallback for any other .html route mapping Next.js might use
      return net.fetch(pathToFileURL(candidatePath + '.html').toString()).catch(() => {
        return new Response('Not Found', { status: 404 });
      });
    });
  });

  host.start();

  // Forward cold-start deep-link if launched via gravitron:// protocol
  const initialDeepLink = process.argv.find((arg) => arg.startsWith('gravitron://'));
  if (initialDeepLink) {
    setTimeout(() => {
      windowService.broadcast('ag:deep-link', initialDeepLink);
    }, 1500);
  }
});

app.on('second-instance', (_event, commandLine) => {
  const mainWindow = windowService.getMainWindow();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const deepLink = commandLine.find((arg) => arg.startsWith('gravitron://'));
    if (deepLink) {
      windowService.broadcast('ag:deep-link', deepLink);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  host.stop();
});
