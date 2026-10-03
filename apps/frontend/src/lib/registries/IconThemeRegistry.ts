export interface IIconTheme {
  id: string;
  label: string;
  description?: string;
  icons: Record<string, string>; // e.g., 'file.ts' -> '/icons/ts.svg'
}

export class IconThemeRegistry {
  private static iconThemes: Map<string, IIconTheme> = new Map();

  static register(iconTheme: IIconTheme): void {
    this.iconThemes.set(iconTheme.id, iconTheme);
  }

  static getIconTheme(id: string): IIconTheme | undefined {
    return this.iconThemes.get(id);
  }

  static getAllIconThemes(): IIconTheme[] {
    return Array.from(this.iconThemes.values());
  }
}
