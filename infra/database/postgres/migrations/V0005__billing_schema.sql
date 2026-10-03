-- V0005__billing_schema.sql

-- Quotas
CREATE TABLE quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL DEFAULT 'FREE',
    max_workspaces INT NOT NULL DEFAULT 3,
    max_agent_tokens BIGINT NOT NULL DEFAULT 100000,
    tokens_used BIGINT NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_tokens_positive CHECK (tokens_used >= 0)
);
CREATE UNIQUE INDEX idx_quotas_org ON quotas(organization_id);

-- Billing Metadata
CREATE TABLE billing_metadata (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) UNIQUE,
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'INACTIVE',
    billing_email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
