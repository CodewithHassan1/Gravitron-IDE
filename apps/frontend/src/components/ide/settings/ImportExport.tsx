import React from 'react';

export const ImportExport: React.FC = () => {
  const handleExport = () => {
    console.log('Exporting configuration...');
  };

  const handleImport = () => {
    console.log('Importing configuration...');
  };

  return (
    <div className="flex space-x-2 mt-4">
      <button
        onClick={handleImport}
        className="px-3 py-1 text-sm font-medium rounded border border-ide-border hover:bg-ide-accent/20"
      >
        Import
      </button>
      <button
        onClick={handleExport}
        className="px-3 py-1 text-sm font-medium rounded border border-ide-border hover:bg-ide-accent/20"
      >
        Export
      </button>
    </div>
  );
};
