"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
// src/lib/registries/CommandRegistry.ts
const SystemEvents_1 = require("../events/SystemEvents");
const ContextEngine_1 = require("../../services/quickInput/ContextEngine");
const core_1 = require("@ag/core");
class CommandRegistryImpl {
    commands = new Map();
    has(id) {
        return this.commands.has(id);
    }
    registerCommand(command, shortcutStr) {
        if (this.commands.has(command.id)) {
            this.unregisterCommand(command.id); // Safely overwrite
        }
        this.commands.set(command.id, command);
        let shortcutDisposable;
        if (shortcutStr) {
            shortcutDisposable = core_1.ShortcutRegistry.registerKeybinding(command.id, shortcutStr);
            SystemEvents_1.systemEventBus.emit(SystemEvents_1.SystemEvents.CommandRegistered, { id: command.id, shortcut: shortcutStr });
        }
        return {
            dispose: () => {
                this.unregisterCommand(command.id);
                if (shortcutDisposable)
                    shortcutDisposable.dispose();
            }
        };
    }
    unregisterCommand(id) {
        const command = this.commands.get(id);
        if (command) {
            SystemEvents_1.systemEventBus.emit(SystemEvents_1.SystemEvents.CommandUnregistered, { id });
        }
        return this.commands.delete(id);
    }
    getCommand(id) {
        return this.commands.get(id);
    }
    getCommands() {
        // Only return commands whose 'when' clause is satisfied if they have one
        return Array.from(this.commands.values()).filter(c => this.isVisible(c));
    }
    isVisible(c) {
        if (c.when && !ContextEngine_1.ContextEngine.evaluate(c.when))
            return false;
        return true;
    }
    isEnabled(c) {
        if (c.enablement && !ContextEngine_1.ContextEngine.evaluate(c.enablement))
            return false;
        if (c.precondition && !ContextEngine_1.ContextEngine.evaluate(c.precondition))
            return false;
        return true;
    }
    isToggled(c) {
        if (c.toggled && ContextEngine_1.ContextEngine.evaluate(c.toggled))
            return true;
        return false;
    }
    async executeCommand(id, ...args) {
        const command = this.commands.get(id);
        if (command) {
            if (!this.isEnabled(command)) {
                console.warn(`Command ${id} execution blocked by preconditions or enablement.`);
                return;
            }
            try {
                await command.handler(...args);
                SystemEvents_1.systemEventBus.emit(SystemEvents_1.SystemEvents.CommandExecuted, { commandId: id });
            }
            catch (e) {
                console.error(`Command ${id} failed:`, e);
            }
        }
        else {
            console.warn(`Command ${id} not found.`);
        }
    }
}
exports.CommandRegistry = new CommandRegistryImpl();
