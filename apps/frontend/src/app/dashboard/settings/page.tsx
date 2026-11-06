'use client';
export default function SettingsPage() {
  return (
    <div className="flex flex-1 overflow-hidden p-8 max-w-4xl mx-auto w-full">
      <div className="w-48 border-r border-border pr-8">
        <h2 className="font-semibold text-lg mb-4">Settings</h2>
        <div className="space-y-2 text-sm">
          <div className="p-2 bg-muted text-foreground font-medium rounded-md cursor-pointer">
            Profile
          </div>
          <div className="p-2 text-muted-foreground hover:text-foreground cursor-pointer rounded-md">
            API Keys
          </div>
          <div className="p-2 text-muted-foreground hover:text-foreground cursor-pointer rounded-md">
            Billing
          </div>
        </div>
      </div>
      <div className="flex-1 pl-8">
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
          <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
