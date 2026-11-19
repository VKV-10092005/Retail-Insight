import {createHash} from 'node:crypto';
export const sha256=s=>createHash('sha256').update(s).digest('hex');
const reject=m=>{throw new Error('P14_SQL: '+m);};

// Conservative MySQL lexer, not a server syntax validator. Unsupported syntax fails closed.
// Backslash escapes must match the release-pinned SQL mode; executable comments are refused.
export function lexSql(input,{noBackslashEscapes=false}={}){
 const s=input.replace(/^\uFEFF/,''),tokens=[],markers=[];
 let i=0;
 while(i<s.length){
  const start=i,c=s[i];
  if(/\s/.test(c)){i++;continue;}
  if(c==='#'||(s.startsWith('--',i)&&(!s[i+2]||/\s/.test(s[i+2])))){
   const end=s.indexOf('\n',i),stop=end<0?s.length:end;
   const text=s.slice(i,stop).replace(/\r$/,'');
   const m=/^-- @statement ([A-Z0-9_]+)$/.exec(text);
   if(m&&/^\s*$/.test(s.slice(s.lastIndexOf('\n',i-1)+1,i)))markers.push({id:m[1],start,end:stop});
   i=stop;continue;
  }
  if(s.startsWith('/*',i)){
   if(['!','+'].includes(s[i+2]))reject('executable/hint comment unsupported');
   const end=s.indexOf('*/',i+2);
   if(end<0)reject('unterminated comment');
   if(s.slice(i+2,end).includes('/*'))reject('nested comment unsupported');
   i=end+2;continue;
  }
  if(["'",'"','`'].includes(c)){
   i++;let closed=false;
   while(i<s.length){
    if(s[i]===c){if(s[i+1]===c){i+=2;continue;}i++;closed=true;break;}
    if(s[i]==='\\'&&!noBackslashEscapes&&c!=='`'){i+=2;continue;}
    i++;
   }
   if(!closed)reject('unterminated quoted literal/identifier');
   tokens.push({value:'<quoted>',start,end:i});continue;
  }
  if(/[A-Za-z_]/.test(c)){
   i++;while(i<s.length&&/[A-Za-z0-9_$]/.test(s[i]))i++;
   tokens.push({value:s.slice(start,i).toUpperCase(),start,end:i});continue;
  }
  if(c==='\0')reject('NUL byte');
  tokens.push({value:c,start,end:++i});
 }
 return {source:s,tokens,markers};
}
export function validateSql(sql,options={}){
 const {tokens}=lexSql(sql,options),v=tokens.map(t=>t.value);
 if(!v.length)reject('empty statement');
 if(v.includes('DELIMITER')||v.includes('A0_REVIEW_ONLY_DO_NOT_EXECUTE'))reject('review/client directive');
 if(/\{\{/.test(sql)&&!options.allowTokens)reject('unrendered token');
 const trigger=v[0]==='CREATE'&&v[1]==='TRIGGER';
 const allowed=v[0]==='SELECT'||['INSERT','UPDATE'].includes(v[0])||
  (v[0]==='CREATE'&&['TABLE','INDEX','TRIGGER'].includes(v[1]))||
  (v[0]==='ALTER'&&v[1]==='TABLE');
 if(!allowed)reject('unsupported top-level SQL');
 if(v.filter(t=>t==='?').length&&!options.allowParameters)reject('unbound parameter');
 if(!trigger){
  const semis=v.flatMap((t,i)=>t===';'?[i]:[]);
  if(semis.length!==1||semis[0]!==v.length-1)reject('exactly one terminated statement required');
 }else{
  const begin=v.indexOf('BEGIN');
  if(begin<0||v.slice(0,begin).includes(';'))reject('compound trigger required');
  const stack=[];let finished=false;
  for(let i=begin;i<v.length;i++){
   const t=v[i];
   if(finished){if(i!==v.length-1||t!==';')reject('SQL after trigger body');continue;}
   if(['LOOP','WHILE','REPEAT','PROCEDURE','FUNCTION'].includes(t))reject('unsupported trigger construct');
   if(t==='BEGIN'||t==='CASE')stack.push(t);
   else if(t==='IF'&&(v[i-1]==='BEGIN'||v[i-1]===';'||v[i-1]==='THEN'||v[i-1]==='ELSE'))stack.push('IF');
   else if(t==='END'){
    const kind=stack.pop();if(!kind)reject('unmatched END');
    if(kind==='IF'){if(v[++i]!=='IF')reject('expected END IF');}
    else if(kind==='CASE'&&v[i+1]==='CASE')i++;
    else if(kind==='BEGIN'&&stack.length===0)finished=true;
   }
  }
  if(!finished||stack.length||v.at(-1)!==';')reject('incomplete trigger body');
 }
 return {kind:trigger?'TRIGGER':v[0],parameters:v.filter(t=>t==='?').length};
}
export function parseMarkedSql(source,{draft=false,...options}={}){
 const {source:s,markers}=lexSql(source,options);
 if(!markers.length)reject('missing statement markers');
 if(lexSql(s.slice(0,markers[0].start),options).tokens.length)reject('unmarked SQL prefix');
 const seen=new Set();
 return markers.map((m,i)=>{
  if(seen.has(m.id))reject('duplicate ID');seen.add(m.id);
  const sql=s.slice(m.end,markers[i+1]?.start??s.length).trim();
  if(draft&&m.id.startsWith('REVIEW_ONLY')){
   if(lexSql(sql).tokens.map(t=>t.value).join(' ')!=='A0_REVIEW_ONLY_DO_NOT_EXECUTE ;')reject('invalid review sentinel');
   return {id:m.id,sql,sha256:sha256(sql),reviewOnly:true};
  }
  return {id:m.id,sql,sha256:sha256(sql),...validateSql(sql,options)};
 });
}

