import { describe, expect, it } from 'vitest';
import { resolveCloudEntitlements } from '../entitlements';

describe('resolveCloudEntitlements', () => {
  it('grants only FREE tier models when plan is FREE or billing status is INACTIVE', () => {
    const freeRes = resolveCloudEntitlements('FREE', 'ACTIVE');
    expect(freeRes.effectivePlan).toBe('FREE');
    expect(freeRes.permittedCloudModels).toContain('gemini-3.5-flash-lite');
    expect(freeRes.permittedCloudModels).not.toContain('gemini-3.5-flash');
    expect(freeRes.permittedCloudModels).not.toContain('gemini-3.1-pro-preview');

    const pastDuePro = resolveCloudEntitlements('PRO', 'PAST_DUE');
    expect(pastDuePro.effectivePlan).toBe('FREE');
    expect(pastDuePro.permittedCloudModels).not.toContain('gemini-3.5-flash');
  });

  it('unlocks PRO models when PRO subscription is ACTIVE or TRIALING, and ENTERPRISE models on ENTERPRISE', () => {
    const proRes = resolveCloudEntitlements('PRO', 'ACTIVE');
    expect(proRes.effectivePlan).toBe('PRO');
    expect(proRes.permittedCloudModels).toContain('gemini-3.5-flash');
    expect(proRes.permittedCloudModels).not.toContain('gemini-3.1-pro-preview');

    const entRes = resolveCloudEntitlements('ENTERPRISE', 'TRIALING');
    expect(entRes.effectivePlan).toBe('ENTERPRISE');
    expect(entRes.permittedCloudModels).toContain('gemini-3.1-pro-preview');
    expect(entRes.permittedCloudModels).toContain('claude-3-7-sonnet-20250219');
  });
});
