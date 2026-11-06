import { IPlatform } from './IPlatform';

let activePlatform: IPlatform | null = null;

export const PlatformFactory = {
  register(platform: IPlatform) {
    activePlatform = platform;
  },

  getPlatform(): IPlatform {
    if (!activePlatform) {
      throw new Error('No platform has been registered');
    }
    return activePlatform;
  },
};
