import React, { useState } from 'react';
import { GitManager } from '../../../services/scm/GitManager';
import { useGitStore } from '../../../stores/ide/gitStore';

export function CommitInput() {
  const [message, setMessage] = useState('');
  const currentRepository = useGitStore((s) => s.currentRepository);

  const handleCommit = async () => {
    if (!message.trim() || !currentRepository) return;
    try {
      await GitManager.commit(currentRepository, message);
      setMessage('');
    } catch (err) {
      console.error('Commit failed', err);
    }
  };

  return (
    <div className="commit-input p-2 flex flex-col gap-2">
      <textarea
        className="w-full bg-input-bg text-text-primary text-sm p-2 rounded border border-border-color outline-none resize-none"
        placeholder="Message (Cmd+Enter to commit)"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleCommit();
          }
        }}
      />
      <button
        className="w-full py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
        onClick={handleCommit}
        disabled={!message.trim()}
      >
        Commit
      </button>
    </div>
  );
}
