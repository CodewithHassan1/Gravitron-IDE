import React from 'react';

interface ResetButtonProps {
  onReset: () => void;
}

export const ResetButton: React.FC<ResetButtonProps> = ({ onReset }) => {
  return (
    <button
      onClick={onReset}
      className="p-1 text-xs text-ide-muted hover:text-ide-foreground focus:outline-none"
      title="Reset to default"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.91 3.55a.75.75 0 0 1 .59 1.13c-1.39 1.83-3.64 2.94-6.05 2.94-2.87 0-5.32-1.72-6.52-4.14a.75.75 0 1 1 1.34-.67A5.95 5.95 0 0 0 7.45 6.1c1.9 0 3.65-.89 4.74-2.34a.75.75 0 0 1 .72-.21z"/>
      </svg>
    </button>
  );
};
