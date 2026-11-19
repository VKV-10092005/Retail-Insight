import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {useAuth} from '../auth/AuthContext';

const BranchContext=createContext(null);
const STAFF_ROLES=new Set(['MANAGER','CASHIER','INVENTORY']);

function storageKey(user){
  return `ri_active_branch_id_${user?.organization_id||user?.organization?.id||user?.id||'anonymous'}`;
}

function assignedBranchId(user,branches){
  if(!user)return '';
  if(STAFF_ROLES.has(user.role))return String(user.branch_id||branches[0]?.id||'');
  return '';
}

export function BranchProvider({children}){
  const {user}=useAuth();
  const branches=useMemo(()=>Array.isArray(user?.branches)?user.branches:[],[user?.branches]);
  const [activeBranchId,setActiveBranchIdState]=useState('');

  useEffect(()=>{
    if(!user){setActiveBranchIdState('');return;}
    const fixed=assignedBranchId(user,branches);
    if(fixed){setActiveBranchIdState(fixed);return;}
    if(user.role!=='OWNER'){setActiveBranchIdState('');return;}
    let stored='';
    try{stored=localStorage.getItem(storageKey(user))||localStorage.getItem('activeBranchId')||'';}catch{}
    const valid=branches.some(branch=>String(branch.id)===String(stored));
    setActiveBranchIdState(valid?String(stored):String(branches[0]?.id||''));
  },[user?.id,user?.role,user?.branch_id,user?.organization_id,branches]);

  useEffect(()=>{
    if(user?.role!=='OWNER'||!activeBranchId)return;
    try{localStorage.setItem(storageKey(user),String(activeBranchId));localStorage.setItem('activeBranchId',String(activeBranchId));}catch{}
  },[user,activeBranchId]);

  const setActiveBranchId=value=>{
    if(!user)return;
    if(STAFF_ROLES.has(user.role)){
      setActiveBranchIdState(assignedBranchId(user,branches));
      return;
    }
    const next=String(typeof value==='function'?value(activeBranchId):value||'');
    if(user.role==='OWNER'&&branches.some(branch=>String(branch.id)===next))setActiveBranchIdState(next);
  };

  const activeBranch=branches.find(branch=>String(branch.id)===String(activeBranchId))||null;
  const isOwner=user?.role==='OWNER';
  const isBranchLocked=STAFF_ROLES.has(user?.role);

  return <BranchContext.Provider value={{activeBranchId,activeBranch,branches,setActiveBranchId,isOwner,isBranchLocked}}>{children}</BranchContext.Provider>;
}

export function useBranch(){
  const value=useContext(BranchContext);
  if(!value)throw new Error('BranchProvider missing');
  return value;
}

export function BranchSelect({className='ri-control',onChange}){
  const {activeBranchId,activeBranch,branches,setActiveBranchId,isOwner}=useBranch();
  if(!isOwner)return <span className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</span>;
  return <select className={className} value={activeBranchId} onChange={event=>{setActiveBranchId(event.target.value);onChange?.(event.target.value);}}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>;
}

