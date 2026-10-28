import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('browser API connectivity', () => {
  it('accepts authenticated-request preflights from the documented Web URL', async () => {
    const response = await app.inject({
      method: 'OPTIONS', url: '/api/profile',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
  });

  it('does not grant browser access to an unlisted origin', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/health', headers: { origin: 'https://untrusted.example.com' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
