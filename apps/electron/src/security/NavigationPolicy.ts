export class NavigationPolicy {
  // URLs that we explicitly trust for navigation and resource loading inside the app.
  private static readonly TRUSTED_ORIGINS = new Set<string>();

  public static initialize(isDev: boolean, port: number = 3000) {
    this.TRUSTED_ORIGINS.clear();
    if (isDev) {
      this.TRUSTED_ORIGINS.add(`http://localhost:${port}`);
      this.TRUSTED_ORIGINS.add(`ws://localhost:${port}`);
    }
    // file:// origins are typically allowed implicitly for loaded local files
  }

  public static isNavigationAllowed(urlStr: string): boolean {
    try {
      const url = new URL(urlStr);
      // We only allow navigation to our frontend
      if (url.protocol === 'file:' || url.protocol === 'app:') {
        return true; // Trusted local application schemas
      }
      return this.TRUSTED_ORIGINS.has(url.origin);
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public static isPopupAllowed(_urlStr: string): boolean {
    // Popups are never allowed directly inside the IDE window.
    // All external links should go through the ExternalLinkService.
    return false;
  }
}
