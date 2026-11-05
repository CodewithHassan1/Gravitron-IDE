import { AIMessagePayload } from '../../platform/ai/AIProvider';

export interface PromptContributor {
  id: string;
  priority: number; // Lower number means it is processed earlier
  contribute(context: any): Promise<AIMessagePayload[]>;
}

class PromptContributorRegistryImpl {
  private contributors: PromptContributor[] = [];

  register(contributor: PromptContributor) {
    this.contributors.push(contributor);
    this.contributors.sort((a, b) => a.priority - b.priority);
  }

  getContributors(): PromptContributor[] {
    return this.contributors;
  }
}

export const PromptContributorRegistry = new PromptContributorRegistryImpl();

export class PromptBuilder {
  static async build(context: any): Promise<AIMessagePayload[]> {
    const messages: AIMessagePayload[] = [];
    const contributors = PromptContributorRegistry.getContributors();

    for (const contributor of contributors) {
      const msgs = await contributor.contribute(context);
      messages.push(...msgs);
    }

    return messages;
  }
}
