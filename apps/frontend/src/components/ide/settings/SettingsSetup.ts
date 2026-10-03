import { SettingRendererRegistry } from '../../../lib/registries/SettingRendererRegistry';
import { BooleanRenderer } from './BooleanRenderer';
import { StringRenderer } from './StringRenderer';
import { NumberRenderer } from './NumberRenderer';
import { EnumRenderer } from './EnumRenderer';
import { ColorRenderer } from './ColorRenderer';
import { KeybindingRenderer } from './KeybindingRenderer';

export function registerDefaultSettingRenderers() {
  SettingRendererRegistry.register('boolean', BooleanRenderer);
  SettingRendererRegistry.register('string', StringRenderer);
  SettingRendererRegistry.register('number', NumberRenderer);
  SettingRendererRegistry.register('enum', EnumRenderer);
  SettingRendererRegistry.register('color', ColorRenderer);
  SettingRendererRegistry.register('keybinding', KeybindingRenderer);
}
