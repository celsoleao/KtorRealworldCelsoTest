import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './src/engine.js';
import { PumpPortalFeed, SimulatedFeed } from './src/feeds.js';
import { PaperExecutor } from './src/executor.js';
import { Blacklist } from './src/blacklist.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const FEED = process.env.FEED || 'sim'; // 'sim' or 'live'

const blacklist = new Blacklist(path.join(dir, 'data', FEED === 'live' ? 'blacklist.json' : 'blacklist-sim.json'));
const feed = FEED === 'live' ? new PumpPortalFeed() : new SimulatedFeed();
const engine = new Engine({ feed, executor: new PaperExecutor(), blacklist });

// Server-sent events, throttled to ~5 updates/sec.
const clients = new Set();
let pending = false;
engine.on('changed', () => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    const data = `data: ${JSON.stringify(engine.snapshot())}\n\n`;
    for (const res of clients) res.write(data);
  }, 200);
});

const routes = {
  'POST /api/start': () => engine.start(),
  'POST /api/stop': () => engine.stop(),
  'POST /api/reset': () => engine.reset(),
  'POST /api/resume': () => engine.resumeAfterGoal(),
  'POST /api/config': (body) => engine.setConfig(body),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(engine.snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    route(raw ? JSON.parse(raw) : {});
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(engine.snapshot()));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(dir, 'public', 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`pump.fun trader (${FEED} feed, paper trading) → http://localhost:${PORT}`));
