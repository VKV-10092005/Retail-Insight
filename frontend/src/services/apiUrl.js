const configuredBase=import.meta.env.VITE_API_URL||import.meta.env.VITE_API_BASE_URL||'/api/v1';

function normalizeApiBase(value=configuredBase){
 const base=String(value||'/api/v1').trim().replace(/\/+$/,'');
 const root=base.replace(/(?:\/api\/v1)+$/i,'');
 return `${root}/api/v1`;
}

export function apiUrl(path='',base=configuredBase){
 const value=String(path||'');
 if(/^https?:\/\//i.test(value))return value;
 const suffix=value.replace(/^(?:\/api\/v1)+(?:\/|$)/i,'').replace(/^\/+/, '');
 const prefix=normalizeApiBase(base);
 return suffix?`${prefix}/${suffix}`:prefix;
}

export function authApiUrl(path=''){
 const legacyBase=!import.meta.env.VITE_API_URL?import.meta.env.VITE_AUTH_BASE_URL:null;
 const apiBase=legacyBase?String(legacyBase).replace(/\/auth\/?$/i,''):configuredBase;
 return apiUrl(`/auth/${String(path||'').replace(/^\/+/, '')}`,apiBase);
}
