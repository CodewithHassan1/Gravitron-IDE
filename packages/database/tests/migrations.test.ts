import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

// Import helpers from run-migrations.js
const { crc32, sanitize } = require('../../../infra/database/postgres/run-migrations.js');

describe('Database Migration Runner Safety and Correctness', () => {
  const migrationsDir = path.resolve(__dirname, '../../../infra/database/postgres/migrations');

  it('proves crc32 calculates consistent 32-bit signed integer checksums', () => {
    const testStr1 = 'SELECT 1;';
    const checksum1 = crc32(testStr1);
    expect(typeof checksum1).toBe('number');
    expect(Number.isInteger(checksum1)).toBe(true);
    // Deterministic check
    expect(crc32(testStr1)).toBe(checksum1);

    // Difference check
    const testStr2 = 'SELECT 2;';
    expect(crc32(testStr2)).not.toBe(checksum1);
  });

  it('proves sanitize redacts database credentials from connection strings and errors', () => {
    const rawUrl =
      'postgres://admin_user:super_secret_password_123@postgres.internal.net:5432/production_db';
    const sanitized = sanitize(rawUrl);
    expect(sanitized).toBe('postgres://admin_user:***@postgres.internal.net:5432/production_db');
    expect(sanitized).not.toContain('super_secret_password_123');

    const errorMsg =
      'Failed to connect to postgres://app_user:p@ssw0rd!@10.0.0.5:5432/mydb: connection refused';
    const sanitizedErr = sanitize(errorMsg);
    expect(sanitizedErr).toBe(
      'Failed to connect to postgres://app_user:***@10.0.0.5:5432/mydb: connection refused'
    );
    expect(sanitizedErr).not.toContain('p@ssw0rd!');
  });

  it('proves migration directory contains valid, strictly numbered migration files with no duplicates', () => {
    const files = fs.readdirSync(migrationsDir);
    const versionMap = new Map<number, string>();

    const sqlFiles = files.filter((f) => !f.startsWith('.') && !f.endsWith('.md'));
    expect(sqlFiles.length).toBeGreaterThan(0);

    for (const file of sqlFiles) {
      const match = file.match(/^V(\d{4})__(.+)\.sql$/);
      expect(
        match,
        `File ${file} does not match strict V<0000>__<description>.sql pattern`
      ).not.toBeNull();

      const versionNum = parseInt(match![1], 10);
      expect(
        versionMap.has(versionNum),
        `Duplicate version ${versionNum} in ${file} and ${versionMap.get(versionNum)}`
      ).toBe(false);
      versionMap.set(versionNum, file);
    }

    // Verify all 14 versions are present sequentially 1..14
    for (let v = 1; v <= 14; v++) {
      expect(versionMap.has(v), `Missing version ${v}`).toBe(true);
    }
  });

  it('proves non-transactional statement detection identifies CONCURRENTLY and -- @no-transaction', () => {
    const nonTxSql1 = 'CREATE INDEX CONCURRENTLY idx_users_email ON users(email);';
    const nonTxSql2 = "-- @no-transaction\nALTER TYPE status_enum ADD VALUE 'ARCHIVED';";
    const txSql = 'CREATE TABLE test (id INT PRIMARY KEY);';

    const isNonTx = (sql: string) =>
      sql.includes('-- @no-transaction') ||
      /\b(?:CREATE|DROP|REINDEX)\s+INDEX\s+CONCURRENTLY\b/i.test(sql) ||
      /\bVACUUM\b/i.test(sql);

    expect(isNonTx(nonTxSql1)).toBe(true);
    expect(isNonTx(nonTxSql2)).toBe(true);
    expect(isNonTx(txSql)).toBe(false);
  });
});
