"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemEventBus = exports.SystemEvents = exports.EventBus = void 0;
class EventBus {
    listeners = new Map();
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback); // Returns unsubscribe function
    }
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }
    emit(event, payload) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach((callback) => {
                try {
                    callback(payload);
                }
                catch (e) {
                    console.error(`Error in event listener for ${event}`, e);
                }
            });
        }
    }
}
exports.EventBus = EventBus;
exports.SystemEvents = {
    // Navigation & Search
    SearchStarted: 'search.started',
    SearchCompleted: 'search.completed',
    SearchCancelled: 'search.cancelled',
    IndexUpdated: 'search.indexUpdated',
    FileIndexed: 'search.fileIndexed',
    // Commands
    CommandRegistered: 'command.registered',
    CommandUnregistered: 'command.unregistered',
    CommandExecuted: 'command.executed',
    // Interaction
    NavigationChanged: 'navigation.changed',
    SymbolSelected: 'navigation.symbolSelected',
    FileOpened: 'navigation.fileOpened',
    // Context
    ContextChanged: 'context.changed',
};
exports.systemEventBus = new EventBus();
