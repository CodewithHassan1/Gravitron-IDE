import { MenuContribution } from '@ag/protocol';
import { MenuRegistry } from '../menu/MenuRegistry';
import { ShortcutRegistry, Disposable } from '../shortcuts/ShortcutRegistry';
// wait, the Command handler is function so we need to accept commands

export interface KeybindingContribution {
  commandId: string;
  shortcut: string;
  when?: string;
}

export interface ExtensionContribution {
  id: string;
  commands?: any[]; // We will type this properly when integrating with CommandRegistry
  menus?: MenuContribution[];
  keybindings?: KeybindingContribution[];
}

class ContributionRegistryImpl {
  private commandRegistrar?: (command: any, shortcut?: string) => Disposable;

  setCommandRegistrar(registrar: (command: any, shortcut?: string) => Disposable) {
    this.commandRegistrar = registrar;
  }

  registerExtension(contribution: ExtensionContribution): Disposable {
    console.log(`[ContributionRegistry] Registering extension: ${contribution.id}`);
    const disposables: Disposable[] = [];

    // Register Keybindings
    if (contribution.keybindings) {
      for (const kb of contribution.keybindings) {
        disposables.push(ShortcutRegistry.registerKeybinding(kb.commandId, kb.shortcut, kb.when));
      }
    }

    // Register Commands
    if (contribution.commands && this.commandRegistrar) {
      for (const cmd of contribution.commands) {
        // If there's a keybinding for this command, we pass the shortcut to the registrar?
        // Or we let KeybindingContribution handle it. We can just register the command.
        disposables.push(this.commandRegistrar(cmd));
      }
    }

    // Register Menus
    if (contribution.menus) {
      for (const menu of contribution.menus) {
        // Inject contributorId if missing
        if (!menu.contributorId) {
          menu.contributorId = contribution.id;
        }
        console.log(`[ContributionRegistry] Registering menu: ${menu.title || menu.menuItemId}`);
        disposables.push(MenuRegistry.registerMenuContribution(menu));
      }
    }

    return {
      dispose: () => {
        for (const d of disposables) {
          d.dispose();
        }
      },
    };
  }
}

export const ContributionRegistry = new ContributionRegistryImpl();
