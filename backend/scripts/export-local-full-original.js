import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, verifyDatabase } from '../src/db/pool.js';

const destination = resolve(process.cwd(), '..', 'deploy', 'retail_app_full_original.sql');
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
  const [tables] = await pool.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const [columnMetadata] = await pool.query('SELECT TABLE_NAME,COLUMN_NAME,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  const generatedColumns = new Set(columnMetadata
    .filter(column => String(column.EXTRA || '').toUpperCase().includes('GENERATED'))
    .map(column => `${column.TABLE_NAME}.${column.COLUMN_NAME}`));
  let rowsExported = 0;
  const output = [
    '-- Full local retail_app database snapshot. Includes original user data and credentials.',
    '-- Generated columns are omitted from INSERT statements and recalculated by MySQL.',
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
    const [rows] = await pool.query(`SELECT * FROM ${quoteId(table)}`);
    if (!rows.length) continue;
    rowsExported += rows.length;
    const columns = Object.keys(rows[0]).filter(column => !generatedColumns.has(`${table}.${column}`));
    const inserts = rows.map(row => `(${columns.map(column => sqlValue(row[column])).join(',')})`);
    output.push(`INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(',')}) VALUES\n${inserts.join(',\n')};`, '');
  }
  output.push('SET FOREIGN_KEY_CHECKS=1;', '');
  await writeFile(destination, output.join('\n'), 'utf8');
  console.log(JSON.stringify({ database: 'retail_app', tables: Number(count), rowsExported, output: destination }));
} finally {
  await pool.end();
}
