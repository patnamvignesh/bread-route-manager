import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
if (!databaseUrl.startsWith('file:')) {
  console.error('This backup script supports SQLite. Use pg_dump for PostgreSQL deployments.');
  process.exit(2);
}
const source = databaseUrl.replace(/^file:/, '');
const absoluteSource = path.resolve('prisma', source.replace(/^\.\//, ''));
const backupDir = path.resolve(process.env.BACKUP_DIR || 'backups');
await fs.mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDir, `bread-route-${stamp}.db`);
await fs.copyFile(absoluteSource, destination);
console.log(destination);
