import React, { useState } from 'react';
import { ISettingRendererProps } from '../../../lib/registries/SettingRendererRegistry';

export const KeybindingRenderer: React.FC<ISettingRendererProps> = ({ value, onChange }) => {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }

    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Meta');

    // Filter out modifier-only keypresses
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      keys.push(e.key.toUpperCase());
      onChange(keys.join('+'));
      setRecording(false);
    }
  };

  return (
    <button
      onClick={() => setRecording(true)}
      onKeyDown={handleKeyDown}
      className={`w-full px-2 py-1 text-sm text-left border rounded transition-colors ${
        recording
          ? 'bg-ide-accent/20 border-ide-accent text-ide-accent-foreground shadow-[0_0_0_2px_rgba(var(--ide-accent),0.3)]'
          : 'bg-ide-background border-ide-border text-ide-foreground hover:bg-ide-accent/10'
      }`}
    >
      {recording ? 'Press keys (Escape to cancel)...' : value || 'Unassigned'}
    </button>
  );
};
