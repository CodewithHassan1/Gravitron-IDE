# Workspace Engine Benchmark Results

*Generated: Fri, 17 Jul 2026 10:03:10 GMT*

| Benchmark | Mean | Median | P95 | P99 | Min | Max | StdDev | Samples |
|-----------|------|--------|-----|-----|-----|-----|--------|---------|
| Warm Startup (Manager Instantiation) | 0.00ms | 0.00ms | 0.01ms | 0.02ms | 0.00ms | 0.72ms | 0.02ms | 1000 |
| Workspace Open | 0.03ms | 0.03ms | 0.04ms | 0.08ms | 0.03ms | 0.09ms | 0.01ms | 100 |
| 10k File Creation & Indexing | 9340.77ms | 9340.77ms | 9340.77ms | 9340.77ms | 9340.77ms | 9340.77ms | 0.00ms | 1 |
| Search Latency (Exact) | 0.00ms | 0.00ms | 0.00ms | 0.02ms | 0.00ms | 0.05ms | 0.00ms | 1000 |
| Rename Latency | 3.50ms | 3.14ms | 5.32ms | 12.17ms | 1.61ms | 18.03ms | 1.66ms | 1000 |
| Move Latency | 0.66ms | 0.64ms | 0.84ms | 1.14ms | 0.48ms | 2.90ms | 0.14ms | 1000 |
| Delete Latency | 0.67ms | 0.62ms | 0.96ms | 1.41ms | 0.55ms | 2.00ms | 0.15ms | 1000 |
| Sync Queue Throughput (1000 items) | 410.64ms | 385.90ms | 387.51ms | 387.51ms | 353.55ms | 558.30ms | 74.88ms | 5 |
