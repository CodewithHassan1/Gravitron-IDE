import { ProfileRegistry } from '../../lib/registries/ProfileRegistry';
import { systemEventBus } from '../../lib/events/SystemEvents';
import { ConfigurationEvents } from '../../lib/config/ConfigurationEvents';

export class ProfileManager {
  private activeProfileId: string = 'default';

  switchProfile(profileId: string) {
    const profile = ProfileRegistry.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    this.activeProfileId = profileId;
    systemEventBus.emit(ConfigurationEvents.ProfileChanged, { profileId });
  }

  getActiveProfile() {
    return ProfileRegistry.getProfile(this.activeProfileId);
  }
}
