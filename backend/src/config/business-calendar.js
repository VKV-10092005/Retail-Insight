import {Temporal} from '@js-temporal/polyfill';
export const businessTimezone=process.env.BUSINESS_TIME_ZONE||'Asia/Ho_Chi_Minh';
if(/^[+-]/.test(businessTimezone))throw Error('BUSINESS_TIME_ZONE must be an IANA timezone');
Temporal.Instant.from('2000-01-01T00:00:00Z').toZonedDateTimeISO(businessTimezone);
export const calendarPolicy=Object.freeze({timezone:businessTimezone,policy_version:'business-calendar-v1',timestamp_basis:'UTC'});
