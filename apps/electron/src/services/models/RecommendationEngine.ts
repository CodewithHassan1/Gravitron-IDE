import type {
  HardwareProfile,
  LocalModelCatalogEntry,
  ModelMemoryEstimate,
  ModelRecommendation,
  ModelRecommendationTier,
} from '@ag/protocol';

const GIB = 1024 ** 3;

export function estimateModelMemory(entry: LocalModelCatalogEntry): ModelMemoryEstimate {
  const weightsBytes = Math.round(entry.downloadSizeBytes * 1.05);
  // Estimate KV cache for recommended coding context (16k–32k) scaled roughly by model parameter tier
  const paramNumeric = parseFloat(entry.parameterCount) || 7;
  const kvMultiplierGb = paramNumeric >= 70 ? 2.5 : paramNumeric >= 20 ? 1.5 : paramNumeric >= 10 ? 1.0 : 0.6;
  const kvCacheBytes = Math.round(kvMultiplierGb * GIB);
  const runtimeOverheadBytes = Math.round(1.0 * GIB);

  const minimumViableRamBytes = Math.max(
    Math.round(entry.minimumRamGb * GIB),
    weightsBytes + kvCacheBytes + runtimeOverheadBytes + Math.round(2.5 * GIB)
  );
  const recommendedRamBytes = Math.max(
    Math.round(entry.recommendedRamGb * GIB),
    weightsBytes + kvCacheBytes + runtimeOverheadBytes + Math.round(4.0 * GIB)
  );
  const comfortableRamBytes = Math.max(
    Math.round(entry.comfortableRamGb * GIB),
    Math.round(recommendedRamBytes * 1.25)
  );

  return {
    weightsBytes,
    kvCacheBytes,
    runtimeOverheadBytes,
    minimumViableRamBytes,
    recommendedRamBytes,
    comfortableRamBytes,
  };
}

export function evaluateCatalogRecommendations(
  catalog: LocalModelCatalogEntry[],
  hardware: HardwareProfile
): ModelRecommendation[] {
  const totalRam = hardware.memory.installedRamBytes;
  const freeStorage = hardware.storage.availableBytes;
  const maxDedicatedVram = hardware.gpus.reduce(
    (max, g) => Math.max(max, g.dedicatedVramBytes ?? 0),
    0
  );

  const preliminary = catalog.map((entry) => {
    const memoryEstimate = estimateModelMemory(entry);
    const hasEnoughStorage = freeStorage === 0 ? false : freeStorage >= entry.downloadSizeBytes + 512 * 1024 ** 2;

    if (entry.sharded) {
      return {
        entry,
        tier: 'unavailable' as ModelRecommendationTier,
        score: 0,
        reason: `Sharded ${entry.shardCount || 'multi'}-part enterprise server GGUF (${Math.round(
          entry.downloadSizeBytes / GIB
        )} GB) is outside single-file desktop inference.`,
        estimatedSpeedLabel: 'Server cluster required',
        memoryEstimate,
        hasEnoughStorage,
      };
    }

    const fitsGpu = maxDedicatedVram >= memoryEstimate.weightsBytes + memoryEstimate.kvCacheBytes;
    const fitsRecommendedRam = totalRam >= memoryEstimate.recommendedRamBytes;
    const fitsMinimumRam = totalRam >= memoryEstimate.minimumViableRamBytes;

    let tier: ModelRecommendationTier;
    let reason: string;
    let score = 0;

    if (!hasEnoughStorage) {
      tier = 'not_recommended';
      reason = `Insufficient free disk space at ${hardware.storage.path} (needs ${(
        entry.downloadSizeBytes / GIB
      ).toFixed(1)} GB + buffer).`;
    } else if (!fitsMinimumRam && !fitsGpu) {
      tier = 'not_recommended';
      reason = `Estimated memory requirement (${(memoryEstimate.minimumViableRamBytes / GIB).toFixed(
        1
      )} GB including KV cache & OS reserve) exceeds system RAM (${(totalRam / GIB).toFixed(1)} GB).`;
    } else if ((fitsRecommendedRam || fitsGpu) && entry.toolCallingTier === 'reliable') {
      tier = 'recommended';
      const activeParam = parseFloat(entry.activeParameterCount || entry.parameterCount) || 7;
      score = 100 - Math.min(40, activeParam * 2) + (entry.capabilities.includes('agentic_coding') ? 15 : 0);
      reason = fitsGpu
        ? `Fits comfortably with GPU acceleration and reliable ${entry.toolCallingTier} tool calling.`
        : `Well-matched to your ${(totalRam / GIB).toFixed(1)} GB RAM (${hardware.cpu.logicalCores} cores) with reliable coding & tool calling.`;
    } else {
      tier = 'possible';
      score = 50;
      reason =
        entry.toolCallingTier !== 'reliable'
          ? 'Fits memory bounds, but tool calling is experimental for autonomous coding.'
          : `Fits minimum RAM (${(memoryEstimate.minimumViableRamBytes / GIB).toFixed(
              1
            )} GB) but leaves limited headroom; expect slower CPU inference or reduced context.`;
    }

    const activeB = parseFloat(entry.activeParameterCount || entry.parameterCount) || 7;
    const estimatedSpeedLabel = fitsGpu
      ? 'Fast (GPU offloaded)'
      : activeB <= 4.5
        ? 'Responsive (CPU)'
        : activeB <= 8
          ? 'Moderate (CPU)'
          : 'Slow on CPU-only';

    return {
      entry,
      tier,
      score,
      reason,
      estimatedSpeedLabel,
      memoryEstimate,
      hasEnoughStorage,
    };
  });

  const bestRecommended = [...preliminary]
    .filter((r) => r.tier === 'recommended')
    .sort((a, b) => b.score - a.score)[0];

  return preliminary.map((item) => ({
    modelId: item.entry.id,
    tier: item.tier,
    score: item.score,
    reason: item.reason,
    suggestedAlternativeId:
      (item.tier === 'not_recommended' || item.tier === 'unavailable') && bestRecommended
        ? bestRecommended.entry.id
        : undefined,
    estimatedSpeedLabel: item.estimatedSpeedLabel,
    memoryEstimate: item.memoryEstimate,
    hasEnoughStorage: item.hasEnoughStorage,
  }));
}
