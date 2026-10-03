import { ServiceContainer } from './ServiceContainer';
import { IpcDispatcher } from './ipc/IpcDispatcher';

export class ApplicationHost {
  private container = new ServiceContainer();
  private dispatcher = new IpcDispatcher(this);
  private isShuttingDown = false;

  public async start(): Promise<void> {
    try {
      console.log('ApplicationHost starting...');
      
      // Topological sort ensures correct boot order
      const lifecycleServices = this.container.getSortedLifecycleServices();

      // Initialize all lifecycle services
      for (const service of lifecycleServices) {
        await service.initialize();
      }

      // Register IPC handlers for services that expose them
      const ipcServices = this.container.getIpcServices();
      for (const service of ipcServices) {
        const handlers = service.registerHandlers();
        for (const { channel, handler } of handlers) {
          this.dispatcher.registerHandler(channel, handler);
        }
      }

      this.dispatcher.registerCancellationHandler();

      // Start all lifecycle services
      for (const service of lifecycleServices) {
        await service.start();
      }

      console.log('ApplicationHost started successfully.');
    } catch (e) {
      console.error('Failed to start ApplicationHost:', e);
      this.crash();
    }
  }

  public async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    console.log('ApplicationHost shutting down...');

    try {
      // Reverse order for shutdown
      const lifecycleServices = this.container.getSortedLifecycleServices().reverse();
      
      // Stop all services
      for (const service of lifecycleServices) {
        try {
          await service.stop();
        } catch (e) {
          console.error(`Error stopping service:`, e);
        }
      }

      // Dispose all services
      for (const service of lifecycleServices) {
        try {
          await service.dispose();
        } catch (e) {
          console.error(`Error disposing service:`, e);
        }
      }
    } catch (e) {
      console.error('Failed to resolve services during shutdown:', e);
    }
  }

  public getServiceContainer(): ServiceContainer {
    return this.container;
  }

  public getIpcDispatcher(): IpcDispatcher {
    return this.dispatcher;
  }

  private crash(): void {
    console.error('ApplicationHost crashed. Forcing exit.');
    process.exit(1);
  }
}
