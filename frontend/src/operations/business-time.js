import {currentSettings} from '../services/appSettings';
export function formatBusinessTime(value,calendar){
 if(value==null)return '—';
 let raw=value instanceof Date?value.toISOString():String(value);
 if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw))raw=raw.replace(' ','T')+'Z';
 const date=new Date(raw);if(!Number.isFinite(date.getTime()))return '—';
 const timezone=currentSettings().general.timezone||calendar?.timezone;
 if(!timezone)return date.toISOString()+' (UTC; chưa có metadata lịch)';
 return new Intl.DateTimeFormat(currentSettings().general.numberFormat||'vi-VN',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}
