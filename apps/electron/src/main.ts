import * as path from 'path';
import { pathToFileURL } from 'url';
import { app, protocol, net } from 'electron';
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

// Register custom protocol for loading Next.js static export files securely
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

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

const executionService = new WorkspaceExecutionService(contextResolver, policyPipeline, backendRegistry);

// Register services via constructor injection
const windowService = new WindowService();
const eventBroker = new WorkspaceEventBroker(windowService);
const fileWatcherService = new FileWatcherService(eventBroker);

host.getServiceContainer().register(windowService);
host.getServiceContainer().register(new ExternalLinkService(new ElectronShellLauncher()));
host.getServiceContainer().register(executionService);
host.getServiceContainer().register(new MenuService());

const workspaceService = new WorkspaceService(fileWatcherService, eventBroker);
workspaceService.onWorkspaceClosed((workspaceId) => {
  executionService.cleanupWorkspace(workspaceId).catch(err => {
    console.error(`[main] Failed to cleanup workspace terminals for ${workspaceId}:`, err);
  });
});

const intelligenceManager = new IntelligenceManager();

host.getServiceContainer().register(workspaceService);
host.getServiceContainer().register(intelligenceManager);

host.getServiceContainer().register(
  new AgentIpcService(
    windowService,
    workspaceService,
    executionService,
    intelligenceManager
  )
);

host.getServiceContainer().register(new TerminalService(
  () => host.getServiceContainer().get(ServiceIds.Window),
  () => host.getServiceContainer().get(ServiceIds.WorkspaceExecution)
));

host.getServiceContainer().register(new TaskService(
  () => host.getServiceContainer().get(ServiceIds.Window),
  () => host.getServiceContainer().get(ServiceIds.WorkspaceExecution)
));

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
    }

    const candidatePath = path.resolve(frontendRoot, targetRelativePath);

    const isInsideFrontend =
      candidatePath === frontendRoot ||
      candidatePath.startsWith(frontendRoot + path.sep);

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  host.stop();
});