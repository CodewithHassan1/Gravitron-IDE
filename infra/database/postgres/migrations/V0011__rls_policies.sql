-- V0011__rls_policies.sql

-- Enable RLS on core tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can only select orgs where they are a member
CREATE POLICY org_select_policy ON organizations
    FOR SELECT
    USING (
        id IN (SELECT organization_id FROM organization_members WHERE user_id = current_setting('app.current_user_id')::UUID)
    );

-- Workspaces: Users can only see workspaces in their org, and they must be a workspace member or org OWNER
CREATE POLICY workspace_select_policy ON workspaces
    FOR SELECT
    USING (
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = current_setting('app.current_user_id')::UUID)
    );

-- Billing: Only accessible to org owners/admins
CREATE POLICY billing_select_policy ON billing_metadata
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = current_setting('app.current_user_id')::UUID AND role IN ('OWNER', 'ADMIN')
        )
    );

CREATE POLICY quota_select_policy ON quotas
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );
