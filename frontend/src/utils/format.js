import {currentSettings} from '../services/appSettings';
const locale=()=>currentSettings().general.numberFormat||'vi-VN';
export const vi = new Intl.NumberFormat(locale());
export const number = (v, digits=0) => new Intl.NumberFormat(locale(),{maximumFractionDigits:digits}).format(Number(v)||0);
export const currency = v => new Intl.NumberFormat(locale(),{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(v)||0);
export const compact = v => { const n=Number(v)||0; return Math.abs(n)>=1e9 ? `${number(n/1e9,2)} tỷ` : Math.abs(n)>=1e6 ? `${number(n/1e6,2)} tr` : number(n); };
export const shortSku = v => v?.length > 20 ? `${v.slice(0,10)}…${v.slice(-7)}` : v;
