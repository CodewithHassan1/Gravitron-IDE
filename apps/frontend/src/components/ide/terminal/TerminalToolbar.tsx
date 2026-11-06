import React, { useState, useEffect } from 'react';
import { Plus, Trash2, SplitSquareHorizontal, ChevronDown } from 'lucide-react';
import { TerminalManager } from '../../../services/terminal';
import { TerminalUIHelper } from './TerminalUIHelper';
import { useTerminalStore } from '../../../stores/ide/terminalStore';
import { TerminalProtocol } from '@ag/protocol';

interface TerminalToolbarProps {
  groupId: string;
}

export function TerminalToolbar({ groupId }: TerminalToolbarProps) {
  const activeTabId = useTerminalStore(
    (state) => state.groups.find((g) => g.id === groupId)?.activeTabId
  );
  const activeTab = useTerminalStore((state) =>
    state.groups.find((g) => g.id === groupId)?.tabs.find((t) => t.id === activeTabId)
  );
  const removeTab = useTerminalStore((state) => state.removeTab);
  const [profiles, setProfiles] = useState<TerminalProtocol.TerminalProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    TerminalManager.getProfiles()
      .then((profs) => {
        setProfiles(profs);
        const defaultProf = profs.find((p) => p.isDefault) || profs[0];
        if (defaultProf) {
          setSelectedProfileId(defaultProf.id);
        }
      })
      .catch(console.error);
  }, []);

  const handleProfileSelect = (id: string) => {
    setSelectedProfileId(id);
    setIsDropdownOpen(false);
  };

  return (
    <div className="flex items-center h-full border-b border-border shrink-0 bg-card pl-2 pr-4 space-x-3">
      <div className="flex items-center">
        <div className="flex items-center bg-muted/50 rounded mr-2 border border-border">
          <div
            className="w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-muted text-muted-foreground transition-colors"
            onClick={() => {
              TerminalUIHelper.createTerminal(groupId, undefined, selectedProfileId);
            }}
            title="New Terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </div>
          <div className="relative flex items-center h-6 border-l border-border bg-transparent">
            <div
              className="flex items-center px-1.5 h-full cursor-pointer hover:bg-muted text-muted-foreground transition-colors"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Select Terminal Profile"
            >
              <ChevronDown className="w-3 h-3" />
            </div>

            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded shadow-lg z-50 py-1">
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-muted flex items-center justify-between ${selectedProfileId === p.id ? 'text-primary' : 'text-foreground'}`}
                      onClick={() => handleProfileSelect(p.id)}
                    >
                      {p.name}
                      {selectedProfileId === p.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className="w-6 h-6 flex items-center justify-center rounded cursor-pointer hover:bg-muted text-muted-foreground transition-colors mr-1"
          onClick={() => TerminalUIHelper.splitTerminal(groupId, selectedProfileId)}
          title="Split Terminal"
        >
          <SplitSquareHorizontal className="w-3.5 h-3.5" />
        </div>

        <div
          className="w-6 h-6 flex items-center justify-center rounded cursor-pointer hover:bg-muted text-muted-foreground transition-colors"
          onClick={() => {
            if (activeTabId) {
              TerminalManager.destroyTerminal(activeTabId);
              removeTab(groupId, activeTabId);
            }
          }}
          title="Kill Terminal"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}
