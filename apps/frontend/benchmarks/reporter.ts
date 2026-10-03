import fs from 'fs';
import path from 'path';
import { BenchmarkStats } from './statistics';

export interface BenchmarkResult {
  name: string;
  stats: BenchmarkStats;
}

export class BenchmarkReporter {
  private baseDir: string;
  private historyDir: string;

  constructor(baseDir: string = __dirname) {
    this.baseDir = baseDir;
    this.historyDir = path.join(baseDir, 'history');
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  public report(results: BenchmarkResult[]) {
    const timestamp = new Date();
    const formattedDate = timestamp.toISOString().replace(/T/, '-').replace(/:/g, '-').slice(0, 16);
    
    const rawJson = JSON.stringify({ timestamp: timestamp.toISOString(), results }, null, 2);
    
    // Save historical result
    const historyFile = path.join(this.historyDir, `${formattedDate}.json`);
    fs.writeFileSync(historyFile, rawJson, 'utf-8');

    // Save latest raw json
    const latestFile = path.join(this.baseDir, 'raw-results.json');
    fs.writeFileSync(latestFile, rawJson, 'utf-8');

    // Generate Markdown
    let md = '# Workspace Engine Benchmark Results\n\n';
    md += `*Generated: ${timestamp.toUTCString()}*\n\n`;
    
    md += '| Benchmark | Mean | Median | P95 | P99 | Min | Max | StdDev | Samples |\n';
    md += '|-----------|------|--------|-----|-----|-----|-----|--------|---------|\n';
    
    for (const result of results) {
      const s = result.stats;
      md += `| ${result.name} | ${s.mean.toFixed(2)}ms | ${s.median.toFixed(2)}ms | ${s.p95.toFixed(2)}ms | ${s.p99.toFixed(2)}ms | ${s.min.toFixed(2)}ms | ${s.max.toFixed(2)}ms | ${s.stddev.toFixed(2)}ms | ${s.samples} |\n`;
    }

    const latestMdFile = path.join(this.baseDir, 'latest.md');
    fs.writeFileSync(latestMdFile, md, 'utf-8');
    
    console.log(`\n✅ Benchmarks complete! Results written to ${latestMdFile}`);
  }
}
