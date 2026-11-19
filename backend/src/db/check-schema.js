import 'dotenv/config';
import {pool,verifyDatabase} from './pool.js';
await verifyDatabase();
const [[row]]=await pool.query("SELECT COUNT(*) AS missing FROM (SELECT '001_auth' version UNION ALL SELECT '002_operations' UNION ALL SELECT '003_platform_admin' UNION ALL SELECT '004_user_profile_and_otp' UNION ALL SELECT '005_registration_otps' UNION ALL SELECT '006_pos' UNION ALL SELECT '007_pos_backfill') expected LEFT JOIN schema_migrations applied ON applied.version=expected.version WHERE applied.version IS NULL");
console.log(JSON.stringify({database:'retail_app',missing_migrations:row.missing}));await pool.end();process.exitCode=row.missing?1:0;
