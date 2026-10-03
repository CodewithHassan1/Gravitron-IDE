export interface ITheme {
  id: string;
  label: string;
  type: 'dark' | 'light' | 'hc'; // hc = High Contrast
  colors: Record<string, string>;
  // Future Monaco/Workbench specific references
}

export class ThemeRegistry {
  private static themes: Map<string, ITheme> = new Map();

  static register(theme: ITheme): void {
    this.themes.set(theme.id, theme);
  }

  static getTheme(id: string): ITheme | undefined {
    return this.themes.get(id);
  }

  static getAllThemes(): ITheme[] {
    return Array.from(this.themes.values());
  }
}
