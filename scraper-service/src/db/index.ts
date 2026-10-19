/*persistence layer for Watchtower’s scraper. 
It stores website “snapshots” (observations of a page at a point in time)
in a local JSON file instead of a database server.*/
import * as fs from 'fs';
import * as path from 'path';
import { snapshot } from '../types/snapshot.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSnapshots(): snapshot[] {
  if (!fs.existsSync(SNAPSHOTS_FILE)) return [];
  const raw = fs.readFileSync(SNAPSHOTS_FILE, 'utf-8');
  return JSON.parse(raw) as snapshot[];
}

function saveSnapshots(snapshots: snapshot[]): void {
  fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshots, null, 2));
}

export function getLatestSnapshot(url: string): snapshot | undefined {
  const snaps = loadSnapshots();
  return snaps
    .filter(s => s.url === url)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
}

export function addSnapshot(snapshot: snapshot): void {
  ensureDataDir();
  const snaps = loadSnapshots();
  snaps.push(snapshot);
  saveSnapshots(snaps);
}

export function updateLastChecked(url: string, checkedAt: Date): void {
  const snaps = loadSnapshots();
  let latestIdx = -1;
  let latestTime = 0;

  for (let i = 0; i < snaps.length; i++) {
    if (snaps[i].url !== url) continue;
    const t = new Date(snaps[i].capturedAt).getTime();
    if (t > latestTime) {
      latestTime = t;
      latestIdx = i;
    }
  }
  if (latestIdx === -1) return;

  snaps[latestIdx].lastUpdated = checkedAt;
  saveSnapshots(snaps);
}