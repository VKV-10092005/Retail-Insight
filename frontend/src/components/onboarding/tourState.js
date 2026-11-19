export const tourCompletedKey=userId=>`retail_insight_tour_completed_${userId}`;
const tourPendingKey=userId=>`onboarding_main_pending_${userId}`;
const tourShownKey=userId=>`retail_insight_tour_shown_${userId}`;

export function getTourState(userId){
 if(!userId)return {pending:false,completed:false,shown:false};
 try{
  return {
   pending:localStorage.getItem(tourPendingKey(userId))==='true',
   completed:localStorage.getItem(tourCompletedKey(userId))==='true',
   shown:localStorage.getItem(tourShownKey(userId))==='true'
  };
 }catch{return {pending:false,completed:false,shown:false};}
}

export function markTourShown(userId){
 if(!userId)return;
 try{localStorage.setItem(tourShownKey(userId),'true');}catch{}
}

export function completeTour(userId){
 if(!userId)return;
 try{
  localStorage.setItem(tourCompletedKey(userId),'true');
  localStorage.setItem(`retail_onboarding_tour_done_${userId}`,'true');
  localStorage.setItem(`onboarding_main_done_${userId}`,'true');
  localStorage.setItem(`onboarding_main_completed_${userId}`,'true');
  localStorage.removeItem(tourPendingKey(userId));
  localStorage.removeItem(`onboarding_main_step_${userId}`);
 }catch{}
 window.dispatchEvent(new CustomEvent('retail-tour-completed',{detail:{userId:String(userId)}}));
}
