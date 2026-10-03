-- V0008__functions.sql

-- Trigger function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger function for refreshing materialized views (can be called by pg_cron)
CREATE OR REPLACE FUNCTION refresh_billing_mv()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organization_monthly_usage;
END;
$$ language 'plpgsql';
