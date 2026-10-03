import { IService, ILifecycleService, IIpcService } from './services/IService';
import { ServiceId } from './services/ServiceIds';

export class ServiceContainer {
  private services = new Map<ServiceId, IService>();

  public register<T extends IService>(service: T): void {
    if (this.services.has(service.id)) {
      throw new Error(`Service ${service.id.toString()} is already registered.`);
    }
    
    if (service.dependencies.includes(service.id)) {
      throw new Error(`Service ${service.id.toString()} has a self-dependency.`);
    }

    const uniqueDeps = new Set(service.dependencies);
    if (uniqueDeps.size !== service.dependencies.length) {
      throw new Error(`Service ${service.id.toString()} has duplicate dependencies declared.`);
    }

    this.services.set(service.id, service);
  }

  public get<T extends IService>(id: ServiceId): T {
    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Service ${id.toString()} not found.`);
    }
    return service as T;
  }

  public getAll(): IService[] {
    return Array.from(this.services.values());
  }

  public getSortedLifecycleServices(): ILifecycleService[] {
    const sortedIds = this.topologicalSort();
    const lifecycleServices: ILifecycleService[] = [];
    
    for (const id of sortedIds) {
      const service = this.get(id);
      if (this.isLifecycleService(service)) {
        lifecycleServices.push(service);
      }
    }
    return lifecycleServices;
  }

  public getIpcServices(): IIpcService[] {
    return Array.from(this.services.values()).filter(this.isIpcService);
  }

  private isLifecycleService(service: IService): service is ILifecycleService {
    return 'initialize' in service && 'start' in service && 'stop' in service && 'dispose' in service;
  }

  private isIpcService(service: IService): service is IIpcService {
    return 'registerHandlers' in service;
  }

  private topologicalSort(): ServiceId[] {
    const visited = new Set<ServiceId>();
    const visiting = new Set<ServiceId>();
    const sorted: ServiceId[] = [];

    const visit = (id: ServiceId, trace: ServiceId[]) => {
      if (visiting.has(id)) {
        const cycle = [...trace, id].map(s => s.toString()).join(' -> ');
        throw new Error(`Cyclic dependency detected: ${cycle}`);
      }
      if (visited.has(id)) {
        return;
      }

      const service = this.services.get(id);
      if (!service) {
        throw new Error(`Missing dependency ${id.toString()} required by ${trace[trace.length - 1]?.toString()}`);
      }

      visiting.add(id);
      trace.push(id);

      for (const depId of service.dependencies) {
        visit(depId, trace);
      }

      trace.pop();
      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of this.services.keys()) {
      if (!visited.has(id)) {
        visit(id, []);
      }
    }

    return sorted;
  }
}
