import { allowedOrigins } from './origins.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const __envDir = dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: join(__envDir, '..', '..', '.env') });
export function assertDatabase(name) {
  if (name !== 'retail_app') throw new Error('Only retail_app is permitted for application connections');
}
const dbTarget = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'retail_app';
assertDatabase(dbTarget);
if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
if (process.env.AI_SERVICE_TOKEN && Buffer.byteLength(process.env.AI_SERVICE_TOKEN) < 32) throw new Error('AI_SERVICE_TOKEN must contain at least 32 bytes');
if (process.env.NODE_ENV === 'production' && (!process.env.AI_SERVICE_TOKEN || Buffer.byteLength(process.env.AI_SERVICE_TOKEN) < 32)) throw new Error('Production requires AI_SERVICE_TOKEN with at least 32 bytes');
const rawAiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const aiServiceUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(rawAiServiceUrl) ? rawAiServiceUrl : `https://${rawAiServiceUrl}`;
if (aiServiceUrl) {
  const aiUrl = new URL(aiServiceUrl);
  if (!['http:', 'https:'].includes(aiUrl.protocol)) throw new Error('AI_SERVICE_URL must use http or https');
}
export const config = {
  database: dbTarget,
  secret: process.env.JWT_SECRET,
  origin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  origins: allowedOrigins([process.env.FRONTEND_URL,process.env.CORS_ORIGIN].filter(Boolean).join(',') || 'http://localhost:5173', process.env.NODE_ENV),
  production: process.env.NODE_ENV === 'production',
  aiServiceUrl: aiServiceUrl.replace(/\/$/, ''),
};
