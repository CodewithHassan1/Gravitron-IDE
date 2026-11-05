import React from 'react';
import { useDiagnosticsStore } from '../../stores/ide/diagnosticsStore';
import { NavigationEngine } from '../../services/navigation/NavigationEngine';
import { AlertCircle, AlertTriangle, Info, MessageSquare } from 'lucide-react';

export function ProblemsPanel() {
  const diagnostics = useDiagnosticsStore((state) => state.diagnostics);

  if (diagnostics.length === 0) {
    return (
      <div className="text-muted-foreground p-2">
        No problems have been detected in the workspace.
      </div>
    );
  }

  const grouped = diagnostics.reduce(
    (acc, d) => {
      if (!acc[d.uri]) acc[d.uri] = [];
      acc[d.uri].push(d);
      return acc;
    },
    {} as Record<string, typeof diagnostics>
  );

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500 mr-2 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mr-2 shrink-0" />;
      case 'info':
        return <Info className="w-3.5 h-3.5 text-blue-500 mr-2 shrink-0" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mr-2 shrink-0" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {Object.entries(grouped).map(([uri, items]) => (
        <div key={uri} className="mb-4">
          <div className="font-semibold px-2 py-1 bg-muted/30 sticky top-0 flex items-center">
            <span className="text-foreground">{uri.split('/').pop()}</span>
            <span className="ml-2 text-muted-foreground opacity-60 font-normal">{uri}</span>
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-[10px]">
              {items.length}
            </span>
          </div>
          <div className="flex flex-col">
            {items.map((d) => (
              <div
                key={d.id}
                className="flex items-start px-4 py-1.5 hover:bg-muted/50 cursor-pointer"
                onClick={() => NavigationEngine.revealLine(uri, d.line, d.column)}
              >
                {getIcon(d.severity)}
                <div className="flex-1 flex flex-col">
                  <span className="text-foreground">{d.message}</span>
                  <div className="flex text-muted-foreground opacity-60 mt-0.5 space-x-2">
                    {d.source && <span>[{d.source}]</span>}
                    {d.code && <span>{d.code}</span>}
                    <span>
                      Ln {d.line}, Col {d.column}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
