import { IGitProvider } from '../../platform/scm/GitProvider';
import { NullGitProvider } from '../../platform/scm/NullGitProvider';

class GitProviderRegistryImpl {
  private providers = new Map<string, IGitProvider>();
  private defaultProviderId: string = 'browser';
  private nullProvider = new NullGitProvider();

  register(id: string, provider: IGitProvider) {
    this.providers.set(id, provider);
  }

  get(id: string): IGitProvider {
    return this.providers.get(id) || this.nullProvider;
  }

  getDefault(): IGitProvider {
    return this.providers.get(this.defaultProviderId) || this.nullProvider;
  }

  setDefaultProviderId(id: string) {
    this.defaultProviderId = id;
  }
}

export const GitProviderRegistry = new GitProviderRegistryImpl();
