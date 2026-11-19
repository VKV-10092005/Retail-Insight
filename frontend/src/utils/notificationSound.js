import {currentSettings} from '../services/appSettings';

export const NOTIFICATION_SOUND_TONES=[
 {id:'ting-tong',label:'Ting-tong cổ điển',description:'Hai nốt trầm ấm, rõ ràng'},
 {id:'chime',label:'Chuông pha lê',description:'Hợp âm rải sáng nhẹ'},
 {id:'droplet',label:'Giọt nước tinh tế',description:'Âm lướt nhanh, trong trẻo'},
 {id:'pop',label:'Nhịp gõ nhanh (POS)',description:'Ngắn gọn và dứt khoát'},
 {id:'melody',label:'Nhạc hiệu nhẹ nhàng',description:'Bốn nốt du dương'}
];

const toneSequences={
 'ting-tong':[{frequency:659.25,at:0,duration:.16},{frequency:523.25,at:.16,duration:.35}],
 chime:[{frequency:523.25,at:0,duration:.25},{frequency:659.25,at:.12,duration:.28},{frequency:783.99,at:.24,duration:.42}],
 droplet:[{frequency:698.46,at:0,duration:.13},{frequency:1046.5,at:.11,duration:.3}],
 pop:[{frequency:783.99,at:0,duration:.085},{frequency:783.99,at:.11,duration:.11}],
 melody:[{frequency:523.25,at:0,duration:.2},{frequency:783.99,at:.16,duration:.2},{frequency:659.25,at:.32,duration:.22},{frequency:1046.5,at:.49,duration:.38}]
};

let audioContext;

function getAudioContext(){
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass)return null;
 audioContext=audioContext||new AudioContextClass();
 return audioContext;
}

function unlockAudioContext(){
 try{const context=getAudioContext();if(context?.state==='suspended')void context.resume().catch(()=>{});}catch{}
 window.removeEventListener('pointerdown',unlockAudioContext);
 window.removeEventListener('keydown',unlockAudioContext);
}

if(typeof window!=='undefined'){
 window.addEventListener('pointerdown',unlockAudioContext,{once:true,passive:true});
 window.addEventListener('keydown',unlockAudioContext,{once:true});
}

function note(context,{frequency,start,duration,volume}){
 const triangle=context.createOscillator(),sine=context.createOscillator(),triangleGain=context.createGain(),sineGain=context.createGain(),gain=context.createGain(),echo=context.createDelay(.5),echoGain=context.createGain(),end=start+duration;
 triangle.type='triangle';sine.type='sine';
 triangle.frequency.setValueAtTime(frequency,start);sine.frequency.setValueAtTime(frequency,start);
 triangleGain.gain.setValueAtTime(.68,start);sineGain.gain.setValueAtTime(.32,start);
 gain.gain.setValueAtTime(.0001,start);
 gain.gain.linearRampToValueAtTime(volume,start+.018);
 gain.gain.setValueAtTime(volume,start+Math.min(.055,duration*.35));
 gain.gain.exponentialRampToValueAtTime(.0001,end);
 echo.delayTime.setValueAtTime(.12,start);echoGain.gain.setValueAtTime(.16,start);
 triangle.connect(triangleGain);sine.connect(sineGain);triangleGain.connect(gain);sineGain.connect(gain);gain.connect(context.destination);gain.connect(echo);echo.connect(echoGain);echoGain.connect(context.destination);
 triangle.start(start);sine.start(start);triangle.stop(end+.01);sine.stop(end+.01);
}

export async function playNotificationSound(toneOverride){
 const settings=currentSettings();if(settings.general?.sound===false)return false;
 try{
  audioContext=getAudioContext();if(!audioContext)return false;
  if(audioContext.state==='suspended')await audioContext.resume();
  if(audioContext.state!=='running')return false;
  const tone=toneSequences[toneOverride]?toneOverride:(toneSequences[settings.general?.soundTone]?settings.general.soundTone:'ting-tong'),start=audioContext.currentTime+.015;
  for(const item of toneSequences[tone])note(audioContext,{frequency:item.frequency,start:start+item.at,duration:item.duration,volume:.45});
  return true;
 }catch{return false;}
}
