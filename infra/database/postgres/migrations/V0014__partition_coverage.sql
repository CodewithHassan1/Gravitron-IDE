-- V0014__partition_coverage.sql
-- Ensures continuous partition coverage for agent_events and audit_logs
-- covering 2026-09 through 2027-12, and adds a safety DEFAULT partition.
--
-- Migration Safety Guarantee:
-- If DEFAULT partitions already exist in a database and contain rows
-- in the [2026-09-01, 2028-01-01) range, PostgreSQL would reject the creation
-- of new range partitions with:
-- "ERROR: updated partition constraint for default partition ... would be violated by some row".
-- This script safely pre-flights, detaches the default partition if overlapping
-- rows are present, creates the monthly partitions, re-routes the data into the
-- appropriate new monthly partitions, and re-attaches the DEFAULT partition.

-- ==============================================================================
-- 1. agent_events monthly partitions (2026-09 through 2027-12)
-- ==============================================================================

-- Pre-flight: If agent_events_default exists and contains data in [2026-09-01, 2028-01-01),
-- temporarily detach it so the range partitions can be safely attached without constraint violations.
DO $$
DECLARE
    v_has_overlap boolean := false;
BEGIN
    IF to_regclass('agent_events_default') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM pg_inherits
            WHERE inhrelid = to_regclass('agent_events_default')
              AND inhparent = 'agent_events'::regclass
        ) THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM agent_events_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00'')' INTO v_has_overlap;
            IF v_has_overlap THEN
                EXECUTE 'ALTER TABLE agent_events DETACH PARTITION agent_events_default';
            END IF;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_events_y2026m09 PARTITION OF agent_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS agent_events_y2026m10 PARTITION OF agent_events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS agent_events_y2026m11 PARTITION OF agent_events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS agent_events_y2026m12 PARTITION OF agent_events
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m01 PARTITION OF agent_events
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m02 PARTITION OF agent_events
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m03 PARTITION OF agent_events
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m04 PARTITION OF agent_events
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m05 PARTITION OF agent_events
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m06 PARTITION OF agent_events
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m07 PARTITION OF agent_events
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m08 PARTITION OF agent_events
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m09 PARTITION OF agent_events
    FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m10 PARTITION OF agent_events
    FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m11 PARTITION OF agent_events
    FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS agent_events_y2027m12 PARTITION OF agent_events
    FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Data Reconciliation: If agent_events_default was detached, migrate overlapping rows back into
-- agent_events (which routes them to the new monthly partitions) and re-attach as DEFAULT.
DO $$
BEGIN
    IF to_regclass('agent_events_default') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_inherits
            WHERE inhrelid = to_regclass('agent_events_default')
              AND inhparent = 'agent_events'::regclass
        ) THEN
            EXECUTE 'INSERT INTO agent_events SELECT * FROM agent_events_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00''';
            EXECUTE 'DELETE FROM agent_events_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00''';
            EXECUTE 'ALTER TABLE agent_events ATTACH PARTITION agent_events_default DEFAULT';
        END IF;
    END IF;
END $$;

-- Catch-all DEFAULT partition to prevent write failures for dates outside range
CREATE TABLE IF NOT EXISTS agent_events_default PARTITION OF agent_events DEFAULT;

-- ==============================================================================
-- 2. audit_logs monthly partitions (2026-09 through 2027-12)
-- ==============================================================================

-- Pre-flight: If audit_logs_default exists and contains data in [2026-09-01, 2028-01-01),
-- temporarily detach it so the range partitions can be safely attached without constraint violations.
DO $$
DECLARE
    v_has_overlap boolean := false;
BEGIN
    IF to_regclass('audit_logs_default') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM pg_inherits
            WHERE inhrelid = to_regclass('audit_logs_default')
              AND inhparent = 'audit_logs'::regclass
        ) THEN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM audit_logs_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00'')' INTO v_has_overlap;
            IF v_has_overlap THEN
                EXECUTE 'ALTER TABLE audit_logs DETACH PARTITION audit_logs_default';
            END IF;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs_y2026m09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2026m10 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2026m11 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2026m12 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m01 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m02 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m03 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m04 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m05 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m06 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m07 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m08 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m09 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m10 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m11 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS audit_logs_y2027m12 PARTITION OF audit_logs
    FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Data Reconciliation: If audit_logs_default was detached, migrate overlapping rows back into
-- audit_logs (which routes them to the new monthly partitions) and re-attach as DEFAULT.
DO $$
BEGIN
    IF to_regclass('audit_logs_default') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_inherits
            WHERE inhrelid = to_regclass('audit_logs_default')
              AND inhparent = 'audit_logs'::regclass
        ) THEN
            EXECUTE 'INSERT INTO audit_logs SELECT * FROM audit_logs_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00''';
            EXECUTE 'DELETE FROM audit_logs_default WHERE timestamp >= ''2026-09-01 00:00:00+00'' AND timestamp < ''2028-01-01 00:00:00+00''';
            EXECUTE 'ALTER TABLE audit_logs ATTACH PARTITION audit_logs_default DEFAULT';
        END IF;
    END IF;
END $$;

-- Catch-all DEFAULT partition to prevent write failures for dates outside range
CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;
