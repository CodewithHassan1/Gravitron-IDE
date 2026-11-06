import React from 'react';

export type ViewPlacement = 'primary' | 'secondary' | 'bottom';

export interface ViewDefinition {
  id: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  placement: ViewPlacement;
  component: React.ComponentType<any>;
  actions?: React.ComponentType<any>;
}

class ViewRegistryImpl {
  private views: Map<string, ViewDefinition> = new Map();

  has(id: string): boolean {
    return this.views.has(id);
  }

  register(view: ViewDefinition) {
    const existing = this.views.get(view.id);
    if (existing) {
      if (this.isEqual(existing, view)) {
        return; // Safely ignore identical registrations
      }
      throw new Error(`View with id ${view.id} is already registered with a different schema.`);
    }
    this.views.set(view.id, view);
  }

  replace(view: ViewDefinition) {
    this.views.set(view.id, view);
  }

  unregister(id: string): boolean {
    return this.views.delete(id);
  }

  reset(): void {
    if (process.env.NODE_ENV === 'development') {
      this.views.clear();
    }
  }

  private isEqual(a: ViewDefinition, b: ViewDefinition): boolean {
    // Only check structural identifiers
    return a.id === b.id && a.title === b.title && a.placement === b.placement;
  }

  get(id: string): ViewDefinition | undefined {
    return this.views.get(id);
  }

  getByPlacement(placement: ViewPlacement): ViewDefinition[] {
    return Array.from(this.views.values()).filter((view) => view.placement === placement);
  }

  getAll(): ViewDefinition[] {
    return Array.from(this.views.values());
  }
}

export const ViewRegistry = new ViewRegistryImpl();
