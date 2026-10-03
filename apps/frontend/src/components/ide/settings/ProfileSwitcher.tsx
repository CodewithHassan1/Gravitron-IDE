import React from 'react';
import { ProfileRegistry } from '../../../lib/registries/ProfileRegistry';
import { useProfileStore } from '../../../stores/ide/profileStore';
import { ProfileManager } from '../../../services/config/ProfileManager';

export const ProfileSwitcher: React.FC = () => {
  const profiles = ProfileRegistry.getAllProfiles();
  const { activeProfileId } = useProfileStore();

  const handleSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // In a real implementation we would instantiate ProfileManager via DI
    const manager = new ProfileManager();
    manager.switchProfile(e.target.value);
  };

  return (
    <div className="flex items-center space-x-2">
      <label className="text-sm font-medium">Profile:</label>
      <select
        value={activeProfileId}
        onChange={handleSwitch}
        className="px-2 py-1 text-sm bg-ide-background border border-ide-border rounded focus:outline-none focus:border-ide-accent text-ide-foreground"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
};
