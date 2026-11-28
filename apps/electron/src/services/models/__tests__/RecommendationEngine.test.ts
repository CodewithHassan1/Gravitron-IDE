import { describe, expect, it } from 'vitest';
import { LOCAL_MODEL_CATALOG, type HardwareProfile } from '@ag/protocol';
import { evaluateCatalogRecommendations } from '../RecommendationEngine';

function makeHardware(ramGb: number, freeDiskGb: number, vramGb?: number): HardwareProfile {
  const GIB = 1024 ** 3;
  return {
    platform: 'win32',
    cpu: {
      model: 'Test CPU',
      architecture: 'x64',
      logicalCores: 8,
      instructionSets: ['AVX2'],
    },
    memory: {
      installedRamBytes: ramGb * GIB,
      availableRamBytes: Math.round(ramGb * 0.6 * GIB),
      usableForInferenceBytes: Math.round(Math.max(0, ramGb - 2) * GIB),
      osReserveBytes: 2 * GIB,
    },
    gpus: vramGb
      ? [
          {
            vendor: 'nvidia',
            model: 'Test GPU',
            dedicatedVramBytes: vramGb * GIB,
            sharedMemoryBytes: null,
            isIntegrated: false,
            vramDetectionMethod: 'nvidia-smi',
          },
        ]
      : [],
    accelerationBackend: vramGb ? 'cuda' : 'cpu',
    storage: {
      path: 'D:\\Models',
      totalBytes: 500 * GIB,
      availableBytes: freeDiskGb * GIB,
    },
    notes: [],
    detectedAt: Date.now(),
  };
}

describe('RecommendationEngine', () => {
  it('recommends compact 4B-7B models and marks 120B models as not_recommended on 16GB RAM / 8.9GB C:', () => {
    const hw = makeHardware(16, 400);
    const recs = evaluateCatalogRecommendations(LOCAL_MODEL_CATALOG, hw);
    const qwen4b = recs.find((r) => r.modelId === 'qwen3-4b-instruct-2507');
    const gpt120b = recs.find((r) => r.modelId === 'gpt-oss-120b');
    const sharded = recs.find((r) => {
      const entry = LOCAL_MODEL_CATALOG.find((e) => e.id === r.modelId);
      return Boolean(entry?.sharded);
    });

    expect(qwen4b?.tier).toBe('recommended');
    expect(gpt120b?.tier).toBe('not_recommended');
    expect(sharded?.tier).toBe('unavailable');
  });

  it('marks models exceeding available storage as not_recommended or flags disk bottleneck', () => {
    const hw = makeHardware(16, 2);
    const recs = evaluateCatalogRecommendations(LOCAL_MODEL_CATALOG, hw);
    const qwen4b = recs.find((r) => r.modelId === 'qwen3-4b-instruct-2507');
    expect(qwen4b?.tier).toBe('not_recommended');
    expect(qwen4b?.reason.toLowerCase()).toContain('disk');
  });
});
