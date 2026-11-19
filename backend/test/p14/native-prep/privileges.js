import {principalPolicy} from '../../../src/p14/rc2/grants.js';
const ident=x=>{if(!/^[a-zA-Z0-9_]+$/.test(x))throw Error('GRANT_IDENTIFIER');return '`'+x+'`';};
export function proposedGrants({role,schema,account}){
 if(!/^retail_p14_test_[a-zA-Z0-9_]+$/.test(schema)||!/^p14_test_[a-zA-Z0-9_]+@[a-zA-Z0-9.:-]+$/.test(account))throw Error('GRANT_SCOPE');
 const [user,host]=account.split('@');
 return principalPolicy(role,schema).map(r=>'GRANT '+r.privilege+(r.columns?' ('+r.columns.map(ident).join(',')+')':'')+
  ' ON '+ident(r.schema)+'.'+(r.table==='*'?'*':ident(r.table))+" TO '"+user+"'@'"+host+"';");
}
// A provisioning operator creates isolated users separately. No CREATE USER, password, execution or GRANT OPTION.
