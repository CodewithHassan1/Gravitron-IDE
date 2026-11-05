export class CspPolicy {
  public static getCspHeaders(isDev: boolean, port: number = 3000): string {
    if (isDev) {
      // In dev, Vite requires 'unsafe-inline' for styles and 'unsafe-eval' or specific origins.
      return [
        `default-src 'self' 'unsafe-inline' http://localhost:${port} ws://localhost:${port};`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:${port};`,
        `connect-src 'self' http://localhost:${port} ws://localhost:${port};`,
        "img-src 'self' data:;",
        "font-src 'self' data:;",
        "object-src 'none';",
        "base-uri 'none';",
      ].join(' ');
    } else {
      // In production, we are highly locked down.
      return [
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self' 'unsafe-inline';", // React might need this depending on styling solution
        "img-src 'self' data:;",
        "font-src 'self' data:;",
        "object-src 'none';",
        "base-uri 'none';",
      ].join(' ');
    }
  }
}
