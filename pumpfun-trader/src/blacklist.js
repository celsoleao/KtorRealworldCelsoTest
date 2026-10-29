import fs from 'node:fs';
import path from 'node:path';

// Dev wallets that rugged before. Persisted so "skip forever" survives restarts.
export class Blacklist {
  constructor(file) {
    this.file = file;
    this.map = new Map();
    if (file && fs.existsSync(file)) {
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) this.map.set(k, v);
    }
  }

  has(dev) {
    return this.map.has(dev);
  }

  reason(dev) {
    return this.map.get(dev)?.reason ?? '';
  }

  add(dev, reason) {
    if (!dev || this.map.has(dev)) return;
    this.map.set(dev, { reason, at: new Date().toISOString() });
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map), null, 2));
  }

  get size() {
    return this.map.size;
  }
}
