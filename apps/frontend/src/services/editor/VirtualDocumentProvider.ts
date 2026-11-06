import React from 'react';

export interface IVirtualDocument {
  uri: string;
  title: string;
  component: React.ComponentType<any>;
}

export class VirtualDocumentProvider {
  private static providers: Map<string, IVirtualDocument> = new Map();

  static register(provider: IVirtualDocument): void {
    this.providers.set(provider.uri, provider);
  }

  static getDocument(uri: string): IVirtualDocument | undefined {
    return this.providers.get(uri);
  }

  static isVirtualDocument(uri: string): boolean {
    return (
      this.providers.has(uri) || Array.from(this.providers.keys()).some((k) => uri.startsWith(k))
    );
  }
}
