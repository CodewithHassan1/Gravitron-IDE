export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING';

export interface CloudModelCatalogEntry {
  id: string;
  providerType: 'gemini' | 'openai' | 'anthropic';
  name: string;
  description: string;
  requiredPlan: SubscriptionTier;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

export const CLOUD_MODEL_CATALOG: CloudModelCatalogEntry[] = [
  {
    id: 'gemini-3.5-flash-lite',
    providerType: 'gemini',
    name: 'Gemini 3.5 Flash Lite',
    description: 'Fast, low-latency starter coding and general assistant model.',
    requiredPlan: 'FREE',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'gemini-3.5-flash',
    providerType: 'gemini',
    name: 'Gemini 3.5 Flash',
    description: 'Balanced speed and reasoning for repository tasks and multi-file edits.',
    requiredPlan: 'PRO',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'gemini-3.8-flash',
    providerType: 'gemini',
    name: 'Gemini 3.8 Flash',
    description: 'Enhanced agentic tool calling and long-context code analysis.',
    requiredPlan: 'PRO',
    contextWindow: 1000000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    providerType: 'gemini',
    name: 'Gemini 3.1 Pro',
    description: 'Deep frontier reasoning and complex architecture refactoring.',
    requiredPlan: 'ENTERPRISE',
    contextWindow: 2000000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'gpt-4o-mini',
    providerType: 'openai',
    name: 'GPT-4o Mini',
    description: 'Compact OpenAI model for quick edits and tool-assisted tasks.',
    requiredPlan: 'PRO',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'gpt-4o',
    providerType: 'openai',
    name: 'GPT-4o',
    description: 'Full-capability OpenAI flagship for coding and multimodal workflows.',
    requiredPlan: 'ENTERPRISE',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'o3-mini',
    providerType: 'openai',
    name: 'OpenAI o3-mini',
    description: 'Dedicated reasoning model for complex debugging and planning.',
    requiredPlan: 'ENTERPRISE',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    providerType: 'anthropic',
    name: 'Claude 3.5 Haiku',
    description: 'Fast Anthropic coding model with reliable tool calling.',
    requiredPlan: 'PRO',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    providerType: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'High-precision Anthropic coding and multi-file agent model.',
    requiredPlan: 'ENTERPRISE',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    providerType: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    description: 'Extended thinking Anthropic flagship for deep software engineering.',
    requiredPlan: 'ENTERPRISE',
    contextWindow: 200000,
    supportsTools: true,
    supportsVision: true,
  },
];

const PLAN_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

export function resolveCloudEntitlements(tierRaw?: string | null, statusRaw?: string | null) {
  const tierUpper = (tierRaw || 'FREE').trim().toUpperCase();
  const requestedTier: SubscriptionTier =
    tierUpper === 'ENTERPRISE' ? 'ENTERPRISE' : tierUpper === 'PRO' ? 'PRO' : 'FREE';

  const statusUpper = (statusRaw || 'INACTIVE').trim().toUpperCase();
  const status: SubscriptionStatus =
    statusUpper === 'ACTIVE' ||
    statusUpper === 'TRIALING' ||
    statusUpper === 'PAST_DUE' ||
    statusUpper === 'CANCELLED'
      ? (statusUpper as SubscriptionStatus)
      : 'INACTIVE';

  const effectivePlan: SubscriptionTier =
    status === 'ACTIVE' || status === 'TRIALING' ? requestedTier : 'FREE';

  const cloudModels = CLOUD_MODEL_CATALOG.map((entry) => {
    const accessible = PLAN_RANK[effectivePlan] >= PLAN_RANK[entry.requiredPlan];
    return {
      ...entry,
      accessibleViaSubscription: accessible,
      ...(accessible
        ? {}
        : {
            reason:
              status !== 'ACTIVE' && status !== 'TRIALING' && entry.requiredPlan !== 'FREE'
                ? `Requires an active ${entry.requiredPlan} subscription (current status: ${status}) or your own BYOK API key.`
                : `Requires ${entry.requiredPlan} plan (current plan: ${effectivePlan}) or your own BYOK API key.`,
          }),
    };
  });

  return {
    effectivePlan,
    status,
    permittedCloudModels: cloudModels
      .filter((m) => m.accessibleViaSubscription)
      .map((m) => m.id),
    cloudModels,
  };
}
