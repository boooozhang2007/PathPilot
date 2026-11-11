import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pinnedDnsDispatcher } from '../../src/agent/search/webSearch.js';

// 其它搜索测试都 mock 了 fetch，测不到连接层；这里用真实 fetch + 本机服务验证固定地址的连接确实能建立。
describe('固定 DNS 地址的连接', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => res.end(`host=${req.headers.host}`));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('域名请求连到已校验的固定地址（Node 20+ 以 all:true 调用 lookup）', async () => {
    const dispatcher = pinnedDnsDispatcher({ address: '127.0.0.1', family: 4 });
    try {
      const res = await fetch(`http://pinned-host.example:${port}/job`, { dispatcher } as RequestInit);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(`host=pinned-host.example:${port}`);
    } finally {
      await dispatcher.close();
    }
  });
});
