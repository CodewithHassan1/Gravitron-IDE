export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING';
export type CredentialSource = 'subscription' | 'byok' | 'local';

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

export interface EntitledCloudModel extends CloudModelCatalogEntry {
  accessibleViaSubscription: boolean;
  reason?: string;
}

export interface AccountEntitlements {
  accountId: string;
  orgId: string;
  email?: string;
  plan: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  quotas: {
    maxWorkspaces: number;
    maxAgentTokens: number;
    tokensUsed: number;
    resetAt?: string;
  };
  byokAllowed: boolean;
  permittedCloudModels: string[];
  cloudModels: EntitledCloudModel[];
  fetchedAt: number;
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

export function normalizeSubscriptionTier(raw?: string | null): SubscriptionTier {
  const upper = (raw || 'FREE').trim().toUpperCase();
  if (upper === 'ENTERPRISE') return 'ENTERPRISE';
  if (upper === 'PRO') return 'PRO';
  return 'FREE';
}

export function normalizeSubscriptionStatus(raw?: string | null): SubscriptionStatus {
  const upper = (raw || 'INACTIVE').trim().toUpperCase();
  if (upper === 'ACTIVE') return 'ACTIVE';
  if (upper === 'TRIALING') return 'TRIALING';
  if (upper === 'PAST_DUE') return 'PAST_DUE';
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED';
  return 'INACTIVE';
}

export function resolveCloudEntitlements(
  tierRaw?: string | null,
  statusRaw?: string | null
): {
  effectivePlan: SubscriptionTier;
  status: SubscriptionStatus;
  permittedCloudModels: string[];
  cloudModels: EntitledCloudModel[];
} {
  const requestedTier = normalizeSubscriptionTier(tierRaw);
  const status = normalizeSubscriptionStatus(statusRaw);
  const isPaidActive = status === 'ACTIVE' || status === 'TRIALING';
  const effectivePlan: SubscriptionTier = isPaidActive ? requestedTier : 'FREE';

  const cloudModels: EntitledCloudModel[] = CLOUD_MODEL_CATALOG.map((entry) => {
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

export type LocalModelArchitecture = 'dense' | 'moe';
export type LocalModelCapability =
  | 'general_coding'
  | 'repo_understanding'
  | 'reasoning'
  | 'tool_calling'
  | 'agentic_coding'
  | 'vision'
  | 'long_context';

export interface LocalModelCatalogEntry {
  id: string;
  name: string;
  organization: string;
  family: string;
  description: string;
  parameterCount: string;
  activeParameterCount?: string;
  architecture: LocalModelArchitecture;
  quantization: string;
  hfRepo: string;
  ggufFilename: string;
  downloadUrl: string;
  modelCardUrl: string;
  downloadSizeBytes: number;
  sha256?: string;
  sharded?: boolean;
  shardCount?: number;
  contextWindow: number;
  recommendedContextWindow: number;
  capabilities: LocalModelCapability[];
  toolCallingTier: 'reliable' | 'experimental' | 'none';
  supportsVision: boolean;
  license: string;
  commercialUseAllowed: boolean;
  licenseNotes: string;
  provenance: 'official' | 'community_quant';
  provenanceDetails: string;
  runtimeCompatibility: 'llama.cpp';
  minimumRamGb: number;
  recommendedRamGb: number;
  comfortableRamGb: number;
  recommendedVramGb?: number;
}

export interface UnverifiedModelCandidate {
  name: string;
  organization: string;
  reason: string;
  sourceChecked: string;
}

export const UNVERIFIED_MODEL_CANDIDATES: UnverifiedModelCandidate[] = [
  {
    name: 'Kimi K3.1 Pro',
    organization: 'Moonshot AI',
    reason:
      '2.8T total (104B active) parameter cluster model under non-standard license:other; no verified public GGUF weights available (HTTP 401 on community GGUF probe) and unsuitable for local consumer desktop execution.',
    sourceChecked: 'https://huggingface.co/moonshotai/Kimi-K3.1-Pro',
  },
];

export const LOCAL_MODEL_CATALOG: LocalModelCatalogEntry[] = [
  {
    id: 'qwen3-4b-instruct-2507',
    name: 'Qwen3 4B Instruct (2507)',
    organization: 'Qwen / Unsloth',
    family: 'Qwen3',
    description:
      'Compact, fast coding and tool-calling model well suited for 8–16 GB laptops and CPU/integrated-GPU workstations.',
    parameterCount: '4B',
    architecture: 'dense',
    quantization: 'Q4_K_M',
    hfRepo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    ggufFilename: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF',
    downloadSizeBytes: 2497281120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    contextWindow: 262144,
    recommendedContextWindow: 16384,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Permissive Apache 2.0 license; commercial use and redistribution permitted.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth GGUF conversion from official Qwen3-4B-Instruct-2507 (Apache-2.0).',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 6,
    recommendedRamGb: 12,
    comfortableRamGb: 16,
    recommendedVramGb: 4,
  },
  {
    id: 'qwen2.5-coder-7b-instruct',
    name: 'Qwen2.5-Coder 7B Instruct',
    organization: 'Qwen',
    family: 'Qwen2.5-Coder',
    description:
      'Official Apache-2.0 7B coding model balancing code generation quality and tool-use on 16 GB machines.',
    parameterCount: '7.6B',
    architecture: 'dense',
    quantization: 'Q4_0',
    hfRepo: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
    ggufFilename: 'qwen2.5-coder-7b-instruct-q4_0.gguf',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_0.gguf',
    modelCardUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
    downloadSizeBytes: 4431390720,
    sha256: '8561411b4705cbf2d105cf8e2084c6d6f1bcaba415249ce65fc5f21230d4961b',
    contextWindow: 32768,
    recommendedContextWindow: 16384,
    capabilities: ['general_coding', 'repo_understanding', 'tool_calling', 'agentic_coding'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Official Apache 2.0 weights; commercial use permitted.',
    provenance: 'official',
    provenanceDetails: 'Official Qwen GGUF release.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 8,
    recommendedRamGb: 16,
    comfortableRamGb: 24,
    recommendedVramGb: 6,
  },
  {
    id: 'mellum2.1-12b-a2.5b-instruct',
    name: 'JetBrains Mellum 2.1 Instruct (12B-A2.5B)',
    organization: 'JetBrains',
    family: 'Mellum 2.1',
    description:
      'JetBrains MoE coding agent model (12B total, 2.5B active) engineered for IDE tool calls and repository edits.',
    parameterCount: '12B',
    activeParameterCount: '2.5B',
    architecture: 'moe',
    quantization: 'Q4_K_M',
    hfRepo: 'JetBrains/Mellum2.1-12B-A2.5B-Instruct-GGUF',
    ggufFilename: 'Mellum2.1-12B-A2.5B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/JetBrains/Mellum2.1-12B-A2.5B-Instruct-GGUF/resolve/main/Mellum2.1-12B-A2.5B-Instruct-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/JetBrains/Mellum2.1-12B-A2.5B-Instruct-GGUF',
    downloadSizeBytes: 8071294048,
    sha256: '38bddfb1d61e8a57cb2b8c6a5abd0b5ea01f0402c664f06925cdacbe0e1d6183',
    contextWindow: 131072,
    recommendedContextWindow: 16384,
    capabilities: ['general_coding', 'repo_understanding', 'tool_calling', 'agentic_coding'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Official JetBrains Apache 2.0 release.',
    provenance: 'official',
    provenanceDetails: 'Official JetBrains GGUF weights.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 14,
    recommendedRamGb: 16,
    comfortableRamGb: 24,
    recommendedVramGb: 10,
  },
  {
    id: 'mellum2.1-12b-a2.5b-thinking',
    name: 'JetBrains Mellum 2.1 Thinking (12B-A2.5B)',
    organization: 'JetBrains',
    family: 'Mellum 2.1',
    description:
      'Reasoning-focused JetBrains MoE coding model (12B total, 2.5B active) for multi-step debugging and planning.',
    parameterCount: '12B',
    activeParameterCount: '2.5B',
    architecture: 'moe',
    quantization: 'Q4_K_M',
    hfRepo: 'JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF',
    ggufFilename: 'Mellum2.1-12B-A2.5B-Thinking-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF/resolve/main/Mellum2.1-12B-A2.5B-Thinking-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF',
    downloadSizeBytes: 8071295264,
    sha256: 'ecc4d5b8107fc219e23c494b2d107552137637b6c6002ee713e0ba8af7fa2755',
    contextWindow: 131072,
    recommendedContextWindow: 16384,
    capabilities: ['general_coding', 'repo_understanding', 'reasoning', 'tool_calling', 'agentic_coding'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Official JetBrains Apache 2.0 release.',
    provenance: 'official',
    provenanceDetails: 'Official JetBrains GGUF weights.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 14,
    recommendedRamGb: 16,
    comfortableRamGb: 24,
    recommendedVramGb: 10,
  },
  {
    id: 'gpt-oss-20b',
    name: 'OpenAI gpt-oss-20b (MXFP4)',
    organization: 'OpenAI / ggml-org',
    family: 'gpt-oss',
    description:
      'OpenAI open-weight MoE reasoning model (21B total, 3.6B active) with native MXFP4 precision and tool calling.',
    parameterCount: '21B',
    activeParameterCount: '3.6B',
    architecture: 'moe',
    quantization: 'MXFP4',
    hfRepo: 'ggml-org/gpt-oss-20b-GGUF',
    ggufFilename: 'gpt-oss-20b-MXFP4.gguf',
    downloadUrl: 'https://huggingface.co/ggml-org/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-MXFP4.gguf',
    modelCardUrl: 'https://huggingface.co/ggml-org/gpt-oss-20b-GGUF',
    downloadSizeBytes: 12109566624,
    sha256: '27cd6c432c7672cb812a92f611cf3ba7bbc35928262bb1e1253ff4ee6ae35901',
    contextWindow: 131072,
    recommendedContextWindow: 16384,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license with OpenAI gpt-oss usage policy.',
    provenance: 'community_quant',
    provenanceDetails: 'Official ggml-org GGUF build from openai/gpt-oss-20b.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 16,
    recommendedRamGb: 24,
    comfortableRamGb: 32,
    recommendedVramGb: 16,
  },
  {
    id: 'devstral-small-2-24b',
    name: 'Mistral Devstral Small 2 (24B)',
    organization: 'Mistral AI / Bartowski',
    family: 'Devstral',
    description:
      '24B dense software-engineering agent model with strong multi-file editing, tool calling, and vision support.',
    parameterCount: '24B',
    architecture: 'dense',
    quantization: 'Q4_K_M',
    hfRepo: 'bartowski/mistralai_Devstral-Small-2-24B-Instruct-2512-GGUF',
    ggufFilename: 'mistralai_Devstral-Small-2-24B-Instruct-2512-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/bartowski/mistralai_Devstral-Small-2-24B-Instruct-2512-GGUF/resolve/main/mistralai_Devstral-Small-2-24B-Instruct-2512-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512',
    downloadSizeBytes: 14334438272,
    sha256: 'bfd11c8679c6b81eb43763505465d7dcfa72e460ab1c220ecc235a3efadd7f7f',
    contextWindow: 262144,
    recommendedContextWindow: 32768,
    capabilities: [
      'general_coding',
      'repo_understanding',
      'reasoning',
      'tool_calling',
      'agentic_coding',
      'vision',
      'long_context',
    ],
    toolCallingTier: 'reliable',
    supportsVision: true,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license.',
    provenance: 'community_quant',
    provenanceDetails: 'Bartowski imatrix Q4_K_M GGUF from mistralai/Devstral-Small-2-24B-Instruct-2512.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 20,
    recommendedRamGb: 28,
    comfortableRamGb: 32,
    recommendedVramGb: 18,
  },
  {
    id: 'qwen3.8-27b',
    name: 'Qwen3.8 27B',
    organization: 'Qwen / Unsloth',
    family: 'Qwen3.8',
    description:
      'Workstation 27B dense multimodal model with reasoning, vision, and long-context capabilities.',
    parameterCount: '27B',
    architecture: 'dense',
    quantization: 'UD-Q4_K_M',
    hfRepo: 'unsloth/Qwen3.8-27B-GGUF',
    ggufFilename: 'Qwen3.8-27B-UD-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/resolve/main/Qwen3.8-27B-UD-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
    downloadSizeBytes: 16564259744,
    sha256: '1bce504dfecd84153666928a41d8a66706f0158d3a317bc5196b72819d7dc529',
    contextWindow: 262144,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'vision', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: true,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license tag verified on Hugging Face.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth Dynamic UD-Q4_K_M GGUF from Qwen/Qwen3.8-27B.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 24,
    recommendedRamGb: 32,
    comfortableRamGb: 48,
    recommendedVramGb: 20,
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Google Gemma 4 31B Instruct',
    organization: 'Google / Unsloth',
    family: 'Gemma 4',
    description:
      'Workstation-class 31B Gemma 4 model with hybrid attention for reasoning, coding, and multimodal workflows.',
    parameterCount: '31B',
    architecture: 'dense',
    quantization: 'Q4_K_M',
    hfRepo: 'unsloth/gemma-4-31b-it-GGUF',
    ggufFilename: 'gemma-4-31B-it-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/gemma-4-31b-it-GGUF/resolve/main/gemma-4-31B-it-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/google/gemma-4-31b-it',
    downloadSizeBytes: 18323733440,
    sha256: '38bd64c852c4b460434cc7162fa9bdcf242faf86502581a754cb72956bb17f84',
    contextWindow: 131072,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'vision', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: true,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license verified on Hugging Face.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth Q4_K_M GGUF from google/gemma-4-31b-it.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 24,
    recommendedRamGb: 32,
    comfortableRamGb: 48,
    recommendedVramGb: 24,
  },
  {
    id: 'qwen3-coder-30b-a3b',
    name: 'Qwen3-Coder 30B-A3B Instruct',
    organization: 'Qwen / Unsloth',
    family: 'Qwen3-Coder',
    description:
      'High-speed MoE coding specialist (30.5B total, 3.3B active) tailored for repository-level agentic tasks.',
    parameterCount: '30.5B',
    activeParameterCount: '3.3B',
    architecture: 'moe',
    quantization: 'Q4_K_M',
    hfRepo: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF',
    ggufFilename: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF/resolve/main/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct',
    downloadSizeBytes: 18556689568,
    sha256: 'fadc3e5f8d42bf7e894a785b05082e47daee4df26680389817e2093056f088ad',
    contextWindow: 262144,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'repo_understanding', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth Q4_K_M GGUF from Qwen/Qwen3-Coder-30B-A3B-Instruct.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 24,
    recommendedRamGb: 32,
    comfortableRamGb: 48,
    recommendedVramGb: 24,
  },
  {
    id: 'qwen3-coder-next',
    name: 'Qwen3-Coder-Next',
    organization: 'Qwen / Unsloth',
    family: 'Qwen3-Coder',
    description:
      'High-memory workstation/server agentic coding model for deep multi-file engineering workflows.',
    parameterCount: '80B+',
    architecture: 'moe',
    quantization: 'Q4_K_M',
    hfRepo: 'unsloth/Qwen3-Coder-Next-GGUF',
    ggufFilename: 'Qwen3-Coder-Next-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF/resolve/main/Qwen3-Coder-Next-Q4_K_M.gguf',
    modelCardUrl: 'https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF',
    downloadSizeBytes: 48528320544,
    sha256: '9e6032d2f3b50a60f17ce8bf5a1d85c71af9b53b89c7978020ae7c660f29b090',
    contextWindow: 262144,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'repo_understanding', 'reasoning', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth Q4_K_M GGUF release.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 64,
    recommendedRamGb: 96,
    comfortableRamGb: 128,
    recommendedVramGb: 64,
  },
  {
    id: 'gpt-oss-120b',
    name: 'OpenAI gpt-oss-120b (MXFP4)',
    organization: 'OpenAI / ggml-org',
    family: 'gpt-oss',
    description:
      'Large OpenAI MoE reasoning model (117B total, 5.1B active) in native MXFP4 for high-memory workstations and servers.',
    parameterCount: '117B',
    activeParameterCount: '5.1B',
    architecture: 'moe',
    quantization: 'MXFP4',
    hfRepo: 'ggml-org/gpt-oss-120b-GGUF',
    ggufFilename: 'gpt-oss-120b-MXFP4.gguf',
    downloadUrl: 'https://huggingface.co/ggml-org/gpt-oss-120b-GGUF/resolve/main/gpt-oss-120b-MXFP4.gguf',
    modelCardUrl: 'https://huggingface.co/ggml-org/gpt-oss-120b-GGUF',
    downloadSizeBytes: 63387346208,
    sha256: '582bd40f6886200101f4c4ed9f25f3fe80cc14c86e9e2b37746cd8904a0c622d',
    contextWindow: 131072,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'reliable',
    supportsVision: false,
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    licenseNotes: 'Apache 2.0 license with OpenAI gpt-oss usage policy.',
    provenance: 'community_quant',
    provenanceDetails: 'Official ggml-org GGUF build from openai/gpt-oss-120b.',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 72,
    recommendedRamGb: 96,
    comfortableRamGb: 128,
    recommendedVramGb: 80,
  },
  {
    id: 'glm-5.3-flash',
    name: 'GLM-5.3-Flash (320B-A18B)',
    organization: 'Zhipu AI / Unsloth',
    family: 'GLM-5',
    description:
      'Large-server MoE multimodal model (320B total, 18B active); requires multi-part sharded GGUF download on enterprise servers.',
    parameterCount: '320B',
    activeParameterCount: '18B',
    architecture: 'moe',
    quantization: 'UD-IQ2_XXS (Sharded)',
    hfRepo: 'unsloth/GLM-5.3-Flash-GGUF',
    ggufFilename: 'UD-IQ2_XXS/GLM-5.3-Flash-UD-IQ2_XXS-00001-of-00003.gguf',
    downloadUrl: 'https://huggingface.co/unsloth/GLM-5.3-Flash-GGUF',
    modelCardUrl: 'https://huggingface.co/zai-org/GLM-5.3-Flash',
    downloadSizeBytes: 110000000000,
    sharded: true,
    shardCount: 3,
    contextWindow: 200000,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'vision', 'long_context'],
    toolCallingTier: 'experimental',
    supportsVision: true,
    license: 'MIT',
    commercialUseAllowed: true,
    licenseNotes: 'MIT license verified on zai-org/GLM-5.3-Flash.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth sharded GGUF collection (multi-file shard download required).',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 128,
    recommendedRamGb: 192,
    comfortableRamGb: 256,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek-V4-Flash',
    organization: 'DeepSeek / Unsloth',
    family: 'DeepSeek-V4',
    description:
      'Large-server DeepSeek MoE model with hybrid sparse attention; requires multi-part sharded GGUF on high-memory servers.',
    parameterCount: '150B+',
    architecture: 'moe',
    quantization: 'UD-IQ1_M (Sharded)',
    hfRepo: 'unsloth/DeepSeek-V4-Flash-GGUF',
    ggufFilename: 'UD-IQ1_M/DeepSeek-V4-Flash-UD-IQ1_M-00001-of-00003.gguf',
    downloadUrl: 'https://huggingface.co/unsloth/DeepSeek-V4-Flash-GGUF',
    modelCardUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
    downloadSizeBytes: 86900000000,
    sharded: true,
    shardCount: 3,
    contextWindow: 1000000,
    recommendedContextWindow: 32768,
    capabilities: ['general_coding', 'reasoning', 'tool_calling', 'agentic_coding', 'long_context'],
    toolCallingTier: 'experimental',
    supportsVision: false,
    license: 'MIT',
    commercialUseAllowed: true,
    licenseNotes: 'MIT license verified on deepseek-ai/DeepSeek-V4-Flash.',
    provenance: 'community_quant',
    provenanceDetails: 'Unsloth sharded GGUF collection (multi-file shard download required).',
    runtimeCompatibility: 'llama.cpp',
    minimumRamGb: 96,
    recommendedRamGb: 128,
    comfortableRamGb: 192,
  },
];

export interface HardwareGpuInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown';
  model: string;
  dedicatedVramBytes: number | null;
  sharedMemoryBytes: number | null;
  isIntegrated: boolean;
  vramDetectionMethod: 'nvidia-smi' | 'wmi-estimated' | 'unavailable';
}

export interface HardwareProfile {
  detectedAt: number;
  platform: string;
  cpu: {
    model: string;
    architecture: string;
    logicalCores: number;
    instructionSets: string[];
  };
  memory: {
    installedRamBytes: number;
    availableRamBytes: number;
    usableForInferenceBytes: number;
    osReserveBytes: number;
  };
  gpus: HardwareGpuInfo[];
  accelerationBackend: 'cuda' | 'vulkan' | 'cpu';
  storage: {
    path: string;
    availableBytes: number;
    totalBytes: number;
  };
  notes: string[];
}

export type ModelRecommendationTier = 'recommended' | 'possible' | 'not_recommended' | 'unavailable';

export interface ModelMemoryEstimate {
  weightsBytes: number;
  kvCacheBytes: number;
  runtimeOverheadBytes: number;
  minimumViableRamBytes: number;
  recommendedRamBytes: number;
  comfortableRamBytes: number;
}

export interface ModelRecommendation {
  modelId: string;
  tier: ModelRecommendationTier;
  score: number;
  reason: string;
  suggestedAlternativeId?: string;
  estimatedSpeedLabel: string;
  memoryEstimate: ModelMemoryEstimate;
  hasEnoughStorage: boolean;
}

export type ModelInstallState =
  | 'not_installed'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'installed'
  | 'error';

export interface InstalledModelRecord {
  modelId: string;
  filePath: string;
  fileSizeBytes: number;
  sha256?: string;
  verifiedAt?: number;
  installedAt: number;
  isDefault?: boolean;
}

export interface DownloadProgressInfo {
  modelId: string;
  state: ModelInstallState;
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  percent: number;
  error?: string;
}

export interface LocalModelWithStatus {
  entry: LocalModelCatalogEntry;
  recommendation: ModelRecommendation;
  installState: ModelInstallState;
  installedRecord?: InstalledModelRecord;
  downloadProgress?: DownloadProgressInfo;
  isLoaded: boolean;
}

export interface LocalRuntimeStatus {
  status: 'stopped' | 'starting' | 'running' | 'error';
  loadedModelId?: string;
  port?: number;
  pid?: number;
  backend: 'cuda' | 'vulkan' | 'cpu';
  binaryAvailable: boolean;
  error?: string;
}

export interface LocalModelsSnapshot {
  hardware: HardwareProfile;
  storageDir: string;
  defaultModelId?: string;
  runtime: LocalRuntimeStatus;
  models: LocalModelWithStatus[];
  unverifiedCandidates: UnverifiedModelCandidate[];
  setupCompleted: boolean;
}
