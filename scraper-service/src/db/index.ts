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
  const snaps = loadSnapshots();
  snaps.push(snapshot);
  saveSnapshots(snaps);
}