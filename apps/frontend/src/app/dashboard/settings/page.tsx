'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ArrowLeft, Clock } from 'lucide-react';
import { AgentSettingsView } from '../../../components/ide/ai/AgentSettingsView';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'profile' | 'agent' | 'billing'>('profile');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'agent' || tab === 'billing' || tab === 'profile') {
        setActiveTab(tab);
      }
    }
  }, []);

  return (
    <div className="flex flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
      <div className="w-52 border-r border-border pr-6 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center space-x-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Workspace</span>
        </button>

        <h2 className="font-semibold text-lg mb-4">Settings</h2>
        <div className="space-y-1.5 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'profile'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agent')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'agent'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            AI Agent & Timeouts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={cn(
              'w-full text-left p-2 rounded-md transition-colors',
              activeTab === 'billing'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Billing
          </button>
        </div>
      </div>

      <div className="flex-1 pl-8">
        {activeTab === 'profile' && (
          <div>
            <h3 className="text-xl font-medium mb-6">Profile Settings</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  disabled
                  value="admin@ag-ide.local"
                  className="w-full max-w-md h-9 bg-card border border-border rounded-md px-3 text-sm text-muted-foreground opacity-70"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Display Name</label>
                <input
                  type="text"
                  defaultValue="Admin User"
                  className="w-full max-w-md h-9 bg-card border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-medium">AI Agent Configuration</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure AI provider credentials, test connections, set command execution timeouts,
                and govern AgentRouter specialists.
              </p>
            </div>
            <AgentSettingsView />
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            <h3 className="text-xl font-medium mb-2">Billing</h3>
            <p className="text-sm text-muted-foreground">
              Manage your workspace subscription and usage limits from the web dashboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
