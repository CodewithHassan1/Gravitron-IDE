import { systemEventBus } from '../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../lib/config/ConfigurationEvents';

export class ConfigurationWatcher {
  constructor() {
    // Listen to changes in the file system for `.vscode/settings.json` etc.
  }

  start() {
    // Watch logic
  }

  stop() {
    // Stop logic
  }
}
