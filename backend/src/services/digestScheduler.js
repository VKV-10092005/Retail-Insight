import {Temporal} from '@js-temporal/polyfill';
import {pool} from '../db/pool.js';
import {businessTimezone} from '../config/business-calendar.js';
import {generateNotificationDigests,generatePlatformNotificationDigests} from './notificationDigests.js';

const schedulerStatus={active:false,running:false,started_at:null,last_run_at:null,last_success_at:null,last_error:null,run_count:0};
export function getDigestSchedulerStatus(){return {...schedulerStatus,next_window:'23:55 Asia/Ho_Chi_Minh'};}

export function startDigestScheduler({intervalMs=60_000}={}){
 let lastDaily='',lastMonthly='',running=false;
 schedulerStatus.active=true;schedulerStatus.started_at=new Date().toISOString();
 const timer=setInterval(async()=>{
  const now=Temporal.Now.zonedDateTimeISO(businessTimezone);
  if(now.hour!==23||now.minute<55||running)return;
  const day=now.toPlainDate().toString(),month=day.slice(0,7),isMonthEnd=now.day===now.daysInMonth;
  if(lastDaily===day&&(!isMonthEnd||lastMonthly===month))return;
  running=true;schedulerStatus.running=true;schedulerStatus.last_run_at=new Date().toISOString();schedulerStatus.run_count+=1;schedulerStatus.last_error=null;
  try{
   const [organizations]=await pool.execute("SELECT id FROM organizations WHERE status='ACTIVE' ORDER BY id");
   for(const organization of organizations){
    if(lastDaily!==day)await generateNotificationDigests({organizationId:organization.id,role:'OWNER',type:'DAILY',period:day});
    if(isMonthEnd&&lastMonthly!==month)await generateNotificationDigests({organizationId:organization.id,role:'OWNER',type:'MONTHLY',period:day});
   }
   if(lastDaily!==day)await generatePlatformNotificationDigests({type:'DAILY',period:day});
   if(isMonthEnd&&lastMonthly!==month)await generatePlatformNotificationDigests({type:'MONTHLY',period:day});
   lastDaily=day;if(isMonthEnd)lastMonthly=month;schedulerStatus.last_success_at=new Date().toISOString();
  }catch(error){schedulerStatus.last_error=error?.message||String(error);console.error('[Digest scheduler] Could not generate digests:',error?.message||error);}
  finally{running=false;schedulerStatus.running=false;}
 },intervalMs);
 timer.unref?.();return()=>{clearInterval(timer);schedulerStatus.active=false;};
}
