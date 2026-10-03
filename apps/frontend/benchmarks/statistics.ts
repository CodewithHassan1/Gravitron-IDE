export interface BenchmarkStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
  stddev: number;
  samples: number;
}

export function calculateStatistics(durations: number[]): BenchmarkStats {
  if (durations.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, p95: 0, p99: 0, stddev: 0, samples: 0 };
  }

  durations.sort((a, b) => a - b);
  
  const sum = durations.reduce((a, b) => a + b, 0);
  const mean = sum / durations.length;
  
  const mid = Math.floor(durations.length / 2);
  const median = durations.length % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  
  const min = durations[0];
  const max = durations[durations.length - 1];
  
  const p95Index = Math.max(0, Math.floor(durations.length * 0.95) - 1);
  const p99Index = Math.max(0, Math.floor(durations.length * 0.99) - 1);
  
  const p95 = durations[p95Index];
  const p99 = durations[p99Index];
  
  const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
  const stddev = Math.sqrt(variance);

  return {
    mean,
    median,
    min,
    max,
    p95,
    p99,
    stddev,
    samples: durations.length
  };
}
