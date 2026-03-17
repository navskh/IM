import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.idea-manager', 'data');

export function getDataDir(): string {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  return DATA_DIR;
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'im.db');
}

const SYNC_DIR = path.join(os.homedir(), '.idea-manager', 'sync');

export function getSyncDir(): string {
  if (!fs.existsSync(SYNC_DIR)) {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
  }
  return SYNC_DIR;
}
