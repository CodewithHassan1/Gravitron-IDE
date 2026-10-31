import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationPolicy } from '../../src/security/NavigationPolicy';

describe('NavigationPolicy', () => {
  describe('isDev = true', () => {
    beforeEach(() => {
      NavigationPolicy.initialize(true);
    });

    it('allows localhost:3000 navigation', () => {
      expect(NavigationPolicy.isNavigationAllowed('http://localhost:3000')).toBe(true);
      expect(NavigationPolicy.isNavigationAllowed('http://localhost:3000/some/path')).toBe(true);
    });

    it('allows file protocol navigation', () => {
      expect(NavigationPolicy.isNavigationAllowed('file:///path/to/local/file.html')).toBe(true);
    });

    it('allows app protocol navigation for packaged application', () => {
      expect(NavigationPolicy.isNavigationAllowed('app://-/index.html')).toBe(true);
      expect(NavigationPolicy.isNavigationAllowed('app://-/register.html')).toBe(true);
      expect(NavigationPolicy.isNavigationAllowed('app://-/login.html')).toBe(true);
    });

    it('blocks external navigation', () => {
      expect(NavigationPolicy.isNavigationAllowed('https://google.com')).toBe(false);
      expect(NavigationPolicy.isNavigationAllowed('http://evil.com')).toBe(false);
    });

    it('blocks malformed URLs', () => {
      expect(NavigationPolicy.isNavigationAllowed('not_a_url')).toBe(false);
    });

    it('blocks popups universally', () => {
      expect(NavigationPolicy.isPopupAllowed('http://localhost:3000')).toBe(false);
      expect(NavigationPolicy.isPopupAllowed('https://google.com')).toBe(false);
    });
  });

  describe('isDev = false (production packaged mode)', () => {
    beforeEach(() => {
      NavigationPolicy.initialize(false);
    });

    it('allows app protocol navigation in production', () => {
      expect(NavigationPolicy.isNavigationAllowed('app://-/index.html')).toBe(true);
      expect(NavigationPolicy.isNavigationAllowed('app://-/register.html')).toBe(true);
    });

    it('blocks external navigation in production', () => {
      expect(NavigationPolicy.isNavigationAllowed('https://google.com')).toBe(false);
      expect(NavigationPolicy.isNavigationAllowed('http://localhost:3000')).toBe(false);
    });
  });
});
