import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml']
]);

const server = http.createServer((request, response) => {
  const requestPath = request.url === '/' ? '/index.html' : request.url ?? '/index.html';
  const filePath = path.join(root, requestPath.replace(/^\/+/, ''));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  let resolvedPath = filePath;
  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    resolvedPath = path.join(root, 'index.html');
  }

  if (!fs.existsSync(resolvedPath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const extension = path.extname(resolvedPath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) ?? 'application/octet-stream'
  });
  fs.createReadStream(resolvedPath).pipe(response);
});

server.listen(port, () => {
  console.log(`Serving Snake Hamiltonian at http://localhost:${port}`);
});
