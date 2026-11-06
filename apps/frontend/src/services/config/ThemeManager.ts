import { ThemeRegistry } from '../../lib/registries/ThemeRegistry';
import { systemEventBus } from '../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../lib/config/ConfigurationEvents';

export class ThemeManager {
  private currentWorkbenchThemeId: string = 'default-dark';
  private currentMonacoThemeId: string = 'vs-dark';
  private currentTerminalThemeId: string = 'default';
  private currentIconThemeId: string = 'default-icons';

  async setTheme(themeId: string, type: 'workbench' | 'monaco' | 'terminal' | 'icon') {
    switch (type) {
      case 'workbench':
        this.currentWorkbenchThemeId = themeId;
        break;
      case 'monaco':
        this.currentMonacoThemeId = themeId;
        break;
      case 'terminal':
        this.currentTerminalThemeId = themeId;
        break;
      case 'icon':
        this.currentIconThemeId = themeId;
        break;
    }

    systemEventBus.emit(ConfigurationEvents.ThemeChanged, { themeId, type });
  }

  getTheme(type: 'workbench' | 'monaco' | 'terminal' | 'icon'): string {
    switch (type) {
      case 'workbench':
        return this.currentWorkbenchThemeId;
      case 'monaco':
        return this.currentMonacoThemeId;
      case 'terminal':
        return this.currentTerminalThemeId;
      case 'icon':
        return this.currentIconThemeId;
    }
  }
}
