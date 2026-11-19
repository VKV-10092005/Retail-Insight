import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, verifyDatabase } from '../src/db/pool.js';

const destination = resolve(process.cwd(), '..', 'deploy', 'retail_app_prod.sql');
const emptyOnExport = new Set([
  'audit_logs', 'auth_sessions', 'notification_digests', 'notification_reads', 'notifications',
  'password_otps', 'platform_notification_digests', 'registration_otps', 'security_notifications',
  'support_messages', 'support_threads', 'support_tickets'
]);
const quoteId = value => `\`${String(value).replaceAll('`', '``')}\``;
const sqlValue = value => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) value = value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  if (typeof value === 'object') value = JSON.stringify(value);
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll('\0', '\\0').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll("'", "\\'").replaceAll('\x1a', '\\Z')}'`;
};

try {
  await verifyDatabase();
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const [tables] = await pool.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\' ORDER BY TABLE_NAME');
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  let rowsExported = 0;
  const output = [
    '-- Retail Insight production import snapshot from the configured retail_app database.',
    '-- Personal identifiers, credentials, sessions, OTPs, support conversations, audit trails, and notifications are sanitized/omitted.',
    '-- Recreate live owner/staff credentials after import; no source password is carried into this dump.',
    'SET NAMES utf8mb4;',
    'USE retail_app;',
    'SET FOREIGN_KEY_CHECKS=0;',
    ''
  ];

  for (const { TABLE_NAME: table } of tables) {
    const [[definition]] = await pool.query(`SHOW CREATE TABLE ${quoteId(table)}`);
    output.push(`${definition['Create Table'].replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')};`, '');
  }

  for (const { TABLE_NAME: table } of tables) {
    if (emptyOnExport.has(table)) continue;
    const [rows] = await pool.query(`SELECT * FROM ${quoteId(table)}`);
    if (!rows.length) continue;
    rowsExported += rows.length;
    const columns = Object.keys(rows[0]);
    const inserts = rows.map(source => {
      const row = { ...source };
      if (table === 'users') {
        row.email = `user_${row.id}@example.invalid`;
        row.password_hash = passwordHash;
        row.full_name = `Sample User ${row.id}`;
        for (const field of ['phone', 'avatar_url', 'bio', 'last_login_at', 'locked_until', 'lock_reason', 'locked_at', 'unlock_request_note', 'unlock_requested_at']) if (field in row) row[field] = null;
      } else if (table === 'organizations') {
        row.name = `Sample Organization ${row.id}`;
        if ('address' in row) row.address = null;
        if ('slug' in row) row.slug = `sample-${row.id}`;
      } else if (table === 'branches') {
        row.name = `Sample Branch ${row.id}`;
        for (const field of ['address', 'phone', 'bank_bin', 'bank_code', 'bank_account_number', 'bank_account_name', 'static_qr_url']) if (field in row) row[field] = null;
      } else if (table === 'customers') {
        row.name = `Sample Customer ${row.id}`;
        for (const field of ['phone', 'email']) if (field in row) row[field] = null;
      } else if (table === 'app_settings') {
        row.settings = {};
      } else if (table === 'products') {
        if ('image_url' in row) row.image_url = null;
      } else if (table === 'stock_documents') {
        for (const field of ['note', 'return_reason']) if (field in row) row[field] = null;
      }
      return `(${columns.map(column => sqlValue(row[column])).join(',')})`;
    });
    output.push(`INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(',')}) VALUES\n${inserts.join(',\n')};`, '');
  }
  output.push('SET FOREIGN_KEY_CHECKS=1;', '');
  await writeFile(destination, output.join('\n'), 'utf8');
  console.log(JSON.stringify({ database: 'retail_app', tables: Number(count), rowsExported, output: destination }));
} finally {
  await pool.end();
}
