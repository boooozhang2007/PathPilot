// 本地预览:把 `npx expo export -p web` 的单页产物按 SPA 规则提供出来(缺失路径回退 index.html)
// 用法:node scripts/preview-web.cjs <导出目录> [端口]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || 'dist-view');
const port = Number(process.argv[3] || 8091);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? '/index.html' : url;
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root)) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      return fs.createReadStream(file).pipe(res);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return fs.createReadStream(path.join(root, 'index.html')).pipe(res);
  })
  .listen(port, () => console.log('preview on', port, root));
