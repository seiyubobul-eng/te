import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
const tmpDbPath = path.join(os.tmpdir(), 'dev.db');

if (isProd) {
  try {
    if (!fs.existsSync(tmpDbPath)) {
      // Look up schema file path to seed from
      const srcDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
      if (fs.existsSync(srcDbPath)) {
        fs.copyFileSync(srcDbPath, tmpDbPath);
      }
    }
  } catch (err) {
    console.error('Failed to copy SQLite database to tmp:', err);
  }
}

const prisma = new PrismaClient({
  datasources: isProd
    ? { db: { url: `file:${tmpDbPath}` } }
    : undefined
});

export default prisma;
