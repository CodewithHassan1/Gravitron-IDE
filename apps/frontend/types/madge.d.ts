declare module 'madge' {
  export interface MadgeInstance {
    obj(): Record<string, string[]>;
    circular(): string[][];
    depends(): string[];
    warnings(): any;
  }

  export default function madge(
    path: string | string[] | Record<string, any>,
    config?: any
  ): Promise<MadgeInstance>;
}
