// src/services/terminal/events/TerminalEvents.ts

import { TerminalEventBus } from './TerminalEventBus';

// Singleton instance for global terminal events
export const TerminalEvents = new TerminalEventBus();
