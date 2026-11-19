import 'dotenv/config';
import app from './app.js';
import { pool, verifyDatabase } from './db/pool.js';
import {startDigestScheduler} from './services/digestScheduler.js';
import {startAiService, stopAiService} from './services/aiServiceManager.js';

// Bắt lỗi toàn cục để server tuyệt đối không bị sập ngang gây đứt kết nối (ECONNRESET)
process.once('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception:', err);
  process.exit(1);
});

process.once('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled promise rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

try {
  await verifyDatabase();
  console.log('Database retail_app verified successfully.');
} catch (err) {
  console.warn('Database verification warning (will retry on requests):', err.message);
}

startDigestScheduler();
startAiService();

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`Retail API running on http://127.0.0.1:${port} (listening on ${host})`);
});

// Giữ kết nối HTTP ổn định, tránh ngắt đột ngột giữa proxy và server
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAiService();
    server.close(async () => {
      try {
        await pool.end();
      } catch {}
      process.exit(0);
    });
  });
}
