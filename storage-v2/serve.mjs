import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.STORAGE_LAB_PORT || 4191);
const appPreview=process.argv.includes('--app');
const server = http.createServer((req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/' && !appPreview) { res.writeHead(302, {Location:'/storage-v2/lab.html'}); res.end(); return; }
    if (name === '/') name='/index.html';
    const file = path.resolve(root, '.' + name);
    const permitted=appPreview ? file.startsWith(root)&&!name.split('/').some(part=>part.startsWith('.')) : file.startsWith(path.join(root,'storage-v2')+path.sep);
    if (!permitted || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const types = {'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.md':'text/plain'};
    res.setHeader('Content-Type', (types[path.extname(file)] || 'text/plain') + '; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.on('error', error => { console.error(error.message); process.exitCode=1; });
server.listen(port, '127.0.0.1', () => console.log('Storage lab: http://127.0.0.1:' + server.address().port + '/'));
