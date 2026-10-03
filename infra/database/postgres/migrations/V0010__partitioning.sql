-- V0010__partitioning.sql

-- To convert agent_events to partitioned without downtime, we theoretically recreate and migrate.
-- Since this is an initial script setup, we assume the table is created correctly initially, 
-- but Flyway requires us to do it progressively here if we didn't do it in V3. 
-- However, V0003 already defined the schema without PARTITION BY because we deferred it.
-- Let's migrate it here using standard native partitioning.

-- Rename old table
ALTER TABLE agent_events RENAME TO agent_events_old;
ALTER INDEX idx_agent_events_time RENAME TO idx_agent_events_time_old;
ALTER INDEX idx_agent_events_run RENAME TO idx_agent_events_run_old;

-- Create Partitioned Table
CREATE TABLE agent_events (
    id UUID NOT NULL,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE INDEX idx_agent_events_time ON agent_events USING BRIN (timestamp);
CREATE INDEX idx_agent_events_run ON agent_events(run_id);

-- Create initial partitions (Current and next month)
-- In production, a pg_cron job or pg_partman handles this automatically
CREATE TABLE agent_events_y2026m07 PARTITION OF agent_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE agent_events_y2026m08 PARTITION OF agent_events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Migrate data (Expand-Contract)
INSERT INTO agent_events SELECT * FROM agent_events_old;

-- Drop old table
DROP TABLE agent_events_old CASCADE;

-- Recreate Materialized View for Billing Rollups
CREATE MATERIALIZED VIEW mv_organization_monthly_usage AS
SELECT 
    o.id AS organization_id,
    date_trunc('month', ae.timestamp) AS usage_month,
    COUNT(ae.id) AS total_events,
    SUM(COALESCE((ae.payload->>'tokens')::BIGINT, 0)) AS total_tokens
FROM 
    organizations o
LEFT JOIN workspaces w ON o.id = w.organization_id
LEFT JOIN agent_events ae ON w.id = ae.workspace_id
GROUP BY 
    o.id, date_trunc('month', ae.timestamp);

CREATE UNIQUE INDEX idx_mv_org_usage ON mv_organization_monthly_usage(organization_id, usage_month);


-- Do the same for audit_logs
ALTER TABLE audit_logs RENAME TO audit_logs_old;
ALTER INDEX idx_audit_logs_org RENAME TO idx_audit_logs_org_old;
ALTER INDEX idx_audit_logs_time RENAME TO idx_audit_logs_time_old;

CREATE TABLE audit_logs (
    id UUID NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_time ON audit_logs USING BRIN (timestamp);

CREATE TABLE audit_logs_y2026m07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audit_logs_y2026m08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

INSERT INTO audit_logs SELECT * FROM audit_logs_old;
DROP TABLE audit_logs_old;
