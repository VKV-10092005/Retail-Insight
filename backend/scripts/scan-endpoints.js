import fs from 'fs';
import path from 'path';

const files = [
  { file: 'src/routes/auth.js', prefix: '/api/v1/auth' },
  { file: 'src/routes/platform.js', prefix: '/api/v1/platform' },
  { file: 'src/routes/support.js', prefix: '/api/v1/support' },
  { file: 'src/routes/assistant.js', prefix: '/api/v1/assistant' },
  { file: 'src/business/catalog.js', prefix: '/api/v1' },
  { file: 'src/business/ledger.js', prefix: '/api/v1' },
  { file: 'src/business/bi.js', prefix: '/api/v1' },
  { file: 'src/business/ai.js', prefix: '/api/v1' },
  { file: 'src/business/product-import.js', prefix: '/api/v1' },
  { file: 'src/business/receipt-import.js', prefix: '/api/v1' },
  { file: 'src/business/market.js', prefix: '/api/v1' },
  { file: 'src/business/notifications.js', prefix: '/api/v1' },
  { file: 'src/app.js', prefix: '' }
];

const results = [];

for (const { file, prefix } of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const match = line.match(/(router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`](.*)/);
    if (match) {
      const method = match[2].toUpperCase();
      const rawPath = match[3];
      const rest = match[4];
      const fullPath = prefix + (rawPath.startsWith('/') ? rawPath : '/' + rawPath);
      let role = 'ALL / AUTHENTICATED';
      const roleMatch = rest.match(/requireRoles\(([^)]+)\)/);
      if (roleMatch) {
        role = roleMatch[1].replace(/['"\s]/g, '');
      } else if (file === 'src/routes/platform.js') {
        role = 'PLATFORM_ADMIN';
      } else if (file === 'src/routes/auth.js') {
        if (['/me', '/change-password', '/profile', '/resend-verification'].includes(rawPath)) role = 'AUTHENTICATED';
        else role = 'PUBLIC';
      }
      results.push({ file, line: idx + 1, method, fullPath, role, raw: line.trim() });
    }
  });
}

console.log(JSON.stringify(results, null, 2));
console.log('Total endpoints scanned:', results.length);
