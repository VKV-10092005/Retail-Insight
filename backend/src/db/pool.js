import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

export const connectionOptions = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'retail_app',
  password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD,
  database: config.database,
  ...(String(process.env.MYSQL_SSL || '').toLowerCase() === 'true' ? {
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true, ...(process.env.MYSQL_SSL_CA ? { ca: process.env.MYSQL_SSL_CA } : {}) }
  } : {}),
  charset: 'utf8mb4',
  timezone: 'Z',
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 25,
  queueLimit: 200,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

export const pool = mysql.createPool(connectionOptions);

pool.on('connection', connection => {
  connection.query("SET time_zone='+00:00'");
});

// Bắt lỗi kết nối trên pool để không gây unhandled exception
pool.on('error', err => {
  console.error('[MySQL Pool Error]:', err?.message || err);
});

export async function verifyDatabase(connection = pool) {
  const [[row]] = await connection.query('SELECT DATABASE() AS name');
  if (row.name !== 'retail_app') throw new Error('Unexpected database target: ' + row.name);
}
