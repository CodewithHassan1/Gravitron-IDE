import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface PartitionRange {
  table: string;
  partitionName: string;
  from: string;
  to: string;
}

function extractPartitions(sql: string): PartitionRange[] {
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+PARTITION\s+OF\s+(\w+)\s+FOR\s+VALUES\s+FROM\s+\('([^']+)'\)\s+TO\s+\('([^']+)'\);/gi;
  const partitions: PartitionRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql)) !== null) {
    partitions.push({
      partitionName: match[1],
      table: match[2],
      from: match[3],
      to: match[4]
    });
  }
  return partitions;
}

describe('Database Partition Coverage and Migration Safety', () => {
  const migrationsDir = path.resolve(__dirname, '../../../infra/database/postgres/migrations');

  it('proves V0010 had an unhandled gap for October 2026', () => {
    const v10Path = path.join(migrationsDir, 'V0010__partitioning.sql');
    expect(fs.existsSync(v10Path)).toBe(true);
    const v10Content = fs.readFileSync(v10Path, 'utf8');
    const v10Partitions = extractPartitions(v10Content);

    // V0010 only created July and August 2026
    const months = v10Partitions.map(p => p.partitionName);
    expect(months).toContain('agent_events_y2026m07');
    expect(months).toContain('agent_events_y2026m08');
    expect(months).not.toContain('agent_events_y2026m10');

    // V0010 lacked a DEFAULT partition
    expect(v10Content).not.toContain('PARTITION OF agent_events DEFAULT');
    expect(v10Content).not.toContain('PARTITION OF audit_logs DEFAULT');
  });

  it('proves V0014 covers the current month (October 2026) and rolling 2027 future months', () => {
    const v14Path = path.join(migrationsDir, 'V0014__partition_coverage.sql');
    expect(fs.existsSync(v14Path)).toBe(true);
    const v14Content = fs.readFileSync(v14Path, 'utf8');
    const partitions = extractPartitions(v14Content);

    const tables = ['agent_events', 'audit_logs'];

    for (const table of tables) {
      const tableParts = partitions.filter(p => p.table === table);

      // Check current month (October 2026)
      const oct2026 = tableParts.find(p => p.from === '2026-10-01' && p.to === '2026-11-01');
      expect(oct2026).toBeDefined();
      expect(oct2026!.partitionName).toBe(`${table}_y2026m10`);

      // Check future month (March 2027)
      const mar2027 = tableParts.find(p => p.from === '2027-03-01' && p.to === '2027-04-01');
      expect(mar2027).toBeDefined();
      expect(mar2027!.partitionName).toBe(`${table}_y2027m03`);

      // Check full 2027 coverage (12 months)
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const nextMm = m === 12 ? '01' : String(m + 1).padStart(2, '0');
        const nextYr = m === 12 ? '2028' : '2027';
        const fromStr = `2027-${mm}-01`;
        const toStr = `${nextYr}-${nextMm}-01`;

        const found = tableParts.find(p => p.from === fromStr && p.to === toStr);
        expect(found, `Expected partition for ${fromStr} to ${toStr} in ${table}`).toBeDefined();
      }

      // Check catch-all DEFAULT partition exists as safety net
      expect(v14Content).toContain(`CREATE TABLE IF NOT EXISTS ${table}_default PARTITION OF ${table} DEFAULT;`);
    }
  });

  it('proves continuous non-overlapping bounds between V0010 and V0014', () => {
    const v10Content = fs.readFileSync(path.join(migrationsDir, 'V0010__partitioning.sql'), 'utf8');
    const v14Content = fs.readFileSync(path.join(migrationsDir, 'V0014__partition_coverage.sql'), 'utf8');

    const allPartitions = [
      ...extractPartitions(v10Content),
      ...extractPartitions(v14Content)
    ];

    const agentParts = allPartitions.filter(p => p.table === 'agent_events')
      .sort((a, b) => a.from.localeCompare(b.from));

    // Verify continuous bounds from 2026-07-01 to 2028-01-01
    expect(agentParts[0].from).toBe('2026-07-01');
    for (let i = 0; i < agentParts.length - 1; i++) {
      expect(agentParts[i].to, `Gap or overlap between ${agentParts[i].partitionName} and ${agentParts[i+1].partitionName}`).toBe(agentParts[i + 1].from);
    }
    expect(agentParts[agentParts.length - 1].to).toBe('2028-01-01');
  });

  it('proves all 14 migrations are discovered in strict numerical sequence', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.startsWith('V') && f.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/^V(\d+).*/, '$1'), 10);
        const numB = parseInt(b.replace(/^V(\d+).*/, '$1'), 10);
        return numA - numB;
      });

    expect(files.length).toBe(14);
    expect(files[0]).toBe('V0001__initial_auth_schema.sql');
    expect(files[13]).toBe('V0014__partition_coverage.sql');

    // Verify strict sequential 1..14 with no skipped numbers
    for (let i = 0; i < files.length; i++) {
      const match = files[i].match(/^V(\d+)/);
      expect(match).not.toBeNull();
      const num = parseInt(match![1], 10);
      expect(num).toBe(i + 1);
    }
  });

  it('proves V0014 contains preflight overlap detection and safe reconciliation for existing DEFAULT partitions', () => {
    const v14Path = path.join(migrationsDir, 'V0014__partition_coverage.sql');
    const v14Content = fs.readFileSync(v14Path, 'utf8');

    // Asserts pre-flight overlap check and safe detach logic exist for both tables
    expect(v14Content).toContain("EXECUTE 'ALTER TABLE agent_events DETACH PARTITION agent_events_default'");
    expect(v14Content).toContain("EXECUTE 'ALTER TABLE audit_logs DETACH PARTITION audit_logs_default'");

    // Asserts data reconciliation (INSERT back into parent and DELETE from default)
    expect(v14Content).toContain("INSERT INTO agent_events SELECT * FROM agent_events_default");
    expect(v14Content).toContain("INSERT INTO audit_logs SELECT * FROM audit_logs_default");

    // Asserts safe re-attachment
    expect(v14Content).toContain("ALTER TABLE agent_events ATTACH PARTITION agent_events_default DEFAULT");
    expect(v14Content).toContain("ALTER TABLE audit_logs ATTACH PARTITION audit_logs_default DEFAULT");
  });
});
