import 'dotenv/config';
import {verifyResearchConnection,closeResearch} from './research.js';
try{console.log(JSON.stringify(await verifyResearchConnection()));}catch(e){console.error(e.status?e.message:(e.code||'RESEARCH_CONNECTION_FAILED'));process.exitCode=1;}finally{await closeResearch();}
