-- V0007__materialized_views.sql

-- Materialized View for Billing Rollups
CREATE MATERIALIZED VIEW mv_organization_monthly_usage AS
SELECT 
    o.id AS organization_id,
    date_trunc('month', ae.timestamp) AS usage_month,
    COUNT(ae.id) AS total_events,
    -- Assume payload contains token count for LLM events
    SUM(COALESCE((ae.payload->>'tokens')::BIGINT, 0)) AS total_tokens
FROM 
    organizations o
LEFT JOIN workspaces w ON o.id = w.organization_id
LEFT JOIN agent_events ae ON w.id = ae.workspace_id
GROUP BY 
    o.id, date_trunc('month', ae.timestamp);

CREATE UNIQUE INDEX idx_mv_org_usage ON mv_organization_monthly_usage(organization_id, usage_month);
