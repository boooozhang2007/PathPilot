import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('startup configuration', () => {
  it.each(['', '   '])('rejects blank JWT_SECRET %j before the server starts', async (secret) => {
    vi.stubEnv('JWT_SECRET', secret);
    vi.resetModules();
    await expect(import('../../src/config.js')).rejects.toThrow('JWT_SECRET');
  });

  it('allows the documented local Web ports by default', async () => {
    vi.stubEnv('CORS_ORIGINS', undefined);
    vi.resetModules();
    const { config } = await import('../../src/config.js');
    expect(config.corsOrigins).toContain('http://localhost:3001');
    expect(config.corsOrigins).toContain('http://127.0.0.1:3001');
  });

  it('an explicit deployment allowlist replaces development origins', async () => {
    vi.stubEnv('CORS_ORIGINS', ' https://web.example.com,https://other.example.com, ');
    vi.resetModules();
    const { config } = await import('../../src/config.js');
    expect(config.corsOrigins).toEqual(['https://web.example.com', 'https://other.example.com']);
  });
});
