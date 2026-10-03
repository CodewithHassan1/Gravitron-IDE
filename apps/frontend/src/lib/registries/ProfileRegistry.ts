export interface IProfile {
  id: string;
  name: string;
  description?: string;
  isBuiltIn?: boolean;
}

export class ProfileRegistry {
  private static profiles: Map<string, IProfile> = new Map();

  static register(profile: IProfile): void {
    this.profiles.set(profile.id, profile);
  }

  static getProfile(id: string): IProfile | undefined {
    return this.profiles.get(id);
  }

  static getAllProfiles(): IProfile[] {
    return Array.from(this.profiles.values());
  }
}
