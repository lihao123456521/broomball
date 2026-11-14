/* Samantha female English commentary and spell calls share one audio channel. */
(function(global){
'use strict';
global.createMatchCommentary=function({enabled=true,volume=.75,onCaption=()=>{},canSpeak=()=>true}={}){
 const limit=(value,low,high,fallback)=>Number.isFinite(value)?Math.max(low,Math.min(high,value)):fallback;
 let narrationEnabled=enabled!==false,narrationVolume=limit(volume,0,1,.75);
 let synth=null,Utterance=null,voices=[],voiceReadFailed=false,narratorVoice=null;
 let clock=0,sequence=0,active=null,caption='',captionLife=0,unlockAudio=null,unlocking=null;
 const recent=new Map(),audioCache=new Map(),failedSources=new Set();
 try{synth=global.speechSynthesis;Utterance=global.SpeechSynthesisUtterance;}catch{}
 const supported=()=>!!synth&&typeof synth.speak==='function'&&typeof Utterance==='function';
 const language=voice=>String(voice.lang||'').replaceAll('_','-').toLowerCase();
 const femaleName=voice=>/(?:^|\b)(?:samantha|victoria|karen|moira|tessa|fiona|veena|sangeeta|serena|zira|hazel|susan|heera|aria|jenny|libby|sonia|natasha|clara|michelle|neerja)(?:\b|neural)/i.test(voice.name||'')||/(?:^|[\s,;()_-])female(?:$|[\s,;()_-])/i.test(voice.name||'');
 const knownFemale=voice=>!/(?:^|[\s,;()_-])male(?:$|[\s,;()_-])/i.test(voice.name||'')&&femaleName(voice)&&language(voice).split('-')[0]==='en';
 const voiceId=voice=>voice&&(voice.voiceURI||voice.name+'|'+language(voice));
 function chooseEnglishVoice(){
  return voices.filter(knownFemale).sort((a,b)=>{
   const rank=voice=>(voice.localService?0:10)+(/\bsamantha\b/i.test(voice.name||'')?0:language(voice)==='en-us'?1:2);
   return rank(a)-rank(b)||String(a.name||'').localeCompare(String(b.name||''));
  })[0]||null;
 }
 function refreshVoices(){
  try{
   voices=supported()?Array.from(synth.getVoices()||[]):[];voiceReadFailed=false;
   // Keep one narrator while the voice is available, including after voiceschanged.
   narratorVoice=voices.find(voice=>knownFemale(voice)&&voiceId(voice)===voiceId(narratorVoice))||chooseEnglishVoice();
  }catch{voices=[];narratorVoice=null;voiceReadFailed=true;}
 }
 const speechAvailable=()=>supported()&&!voiceReadFailed&&!!narratorVoice;
 const catalog=()=>global.BroomCommentaryClips||{};
 const validEntry=entry=>entry&&typeof entry.src==='string'&&entry.src.length>0;
 const audioAvailable=()=>typeof global.Audio==='function'&&Object.values(catalog()).some(entry=>validEntry(entry)&&!failedSources.has(entry.src));
 const available=()=>audioAvailable()||speechAvailable();
 const preferredBackend=()=>audioAvailable()?'audio':speechAvailable()?'speech':'captions';
 function allowed(){try{return canSpeak()!==false;}catch{return false;}}
 function setCaption(text){caption=text;captionLife=text?5:0;try{onCaption(text);}catch{}}
 function cancelSpeech(){try{synth?.cancel();}catch{}}
 function pauseAudio(record){
  record.audio.onended=null;record.audio.onerror=null;record.audio.onplaying=null;
  try{record.audio.pause();}catch{}
  try{record.audio.currentTime=0;}catch{}
 }
 function clearActive(){
  const previous=active;active=null;sequence++;
  if(previous?.backend==='speech'&&previous.spoken)cancelSpeech();
  if(previous?.record&&previous.record.token===previous.token){
   previous.record.token=null;pauseAudio(previous.record);
  }
 }
 function stop(){clearActive();setCaption('');}
 function audioFor(src){
  if(failedSources.has(src)||typeof global.Audio!=='function')return null;
  if(audioCache.has(src))return audioCache.get(src);
  try{
   const audio=new global.Audio(src);audio.preload='auto';
   const record={audio,src,token:null};audioCache.set(src,record);
   try{audio.load?.();}catch{}
   return record;
  }catch{failedSources.add(src);return null;}
 }
 function prepare(){
  for(const entry of Object.values(catalog()))if(validEntry(entry))audioFor(entry.src);
  refreshVoices();
  return audioCache.size;
 }
 function unlock(){
  prepare();
  if(unlocking||typeof global.Audio!=='function')return unlocking||Promise.resolve(false);
  // Prime the browser media path inside the start/resume gesture without a spoken fragment.
  // The document's user activation also permits the already-preloaded sentence clips.
  try{
   unlockAudio=unlockAudio||new global.Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==');
   unlockAudio.muted=true;unlockAudio.volume=0;
   const finish=()=>{try{unlockAudio.pause();unlockAudio.currentTime=0;}catch{}};
   unlocking=Promise.resolve(unlockAudio.play()).then(()=>{finish();return true;},()=>{finish();unlocking=null;return false;});
   return unlocking;
  }catch{unlocking=null;return Promise.resolve(false);}
 }
 const current=token=>active?.token===token&&sequence===token;
 function captionOnly(token){
  if(!current(token))return;
  active.backend='captions';active.spoken=false;active.record=null;active.remaining=Math.max(0,captionLife);
 }
 function startSpeech(token){
  if(!current(token))return;
  const item=active,canUseSpeech=speechAvailable()&&(item.kind==='spell'||narrationVolume>0)&&!/[\u3400-\u9fff]/.test(item.text);
  if(!canUseSpeech){captionOnly(token);return;}
  try{
   const utterance=new Utterance(item.text),voice=narratorVoice||chooseEnglishVoice();
   utterance.lang=voice.lang||'en-US';
   utterance.voice=voice;
   utterance.pitch=1.04;
   utterance.rate=item.kind==='spell'?limit(item.voiceOptions.rate,.5,2,.95):1;
   utterance.volume=item.kind==='spell'?.9:narrationVolume;
   const release=()=>{if(current(token))active=null;};
   utterance.onend=release;utterance.onerror=release;
   item.backend='speech';item.utterance=utterance;item.spoken=true;item.remaining=item.kind==='spell'?5:15;
   if(synth.paused&&typeof synth.resume==='function')synth.resume();
   synth.speak(utterance);
  }catch{if(current(token))captionOnly(token);}
 }
 function startClip(token,entry){
  const record=audioFor(entry.src);
  if(!record){startSpeech(token);return;}
  const audio=record.audio;
  active.backend='audio';active.record=record;active.remaining=15;record.token=token;
  const release=()=>{
   if(!current(token))return;
   record.token=null;audio.onended=null;audio.onerror=null;audio.onplaying=null;active=null;
  };
  const failure=error=>{
   if(!current(token)||record.token!==token)return;
   record.token=null;pauseAudio(record);active.record=null;
   if(!allowed()||active.kind==='narrator'&&!narrationEnabled){stop();return;}
   if(error?.name==='NotAllowedError'){captionOnly(token);return;}
   failedSources.add(entry.src);
   startSpeech(token);
  };
  const started=()=>{
   if(!current(token)||record.token!==token){
    // A canceled play promise must never start a stale line after resume. A reused
    // element may already belong to a newer token, which must be left alone.
    if(record.token===null||record.token===token)pauseAudio(record);
    return;
   }
   if(!allowed()||active.kind==='narrator'&&!narrationEnabled){stop();return;}
   active.remaining=Number.isFinite(audio.duration)&&audio.duration>0?Math.min(60,audio.duration+2):20;
  };
  audio.onended=release;audio.onerror=failure;audio.onplaying=started;
  try{
   audio.volume=active.kind==='spell'?.9:narrationVolume;audio.currentTime=0;
   const playing=audio.play();
   if(playing&&typeof playing.then==='function')playing.then(started,failure);
   else started();
  }catch(error){failure(error);}
 }
 function begin(key,text,kind,priority,voiceOptions,entry){
  clearActive();
  if(kind==='spell')setCaption('');else setCaption(text);
  const token=++sequence;
  active={key,text,kind,priority,token,backend:'captions',spoken:false,remaining:5,voiceOptions};
  if(kind==='spell'){if(entry)startClip(token,entry);else startSpeech(token);}
  else if(entry&&narrationVolume>0)startClip(token,entry);
  else if(narrationVolume>0)startSpeech(token);
  return true;
 }
 refreshVoices();
 try{
  if(typeof synth?.addEventListener==='function')synth.addEventListener('voiceschanged',refreshVoices);
  else if(synth){const previous=synth.onvoiceschanged;synth.onvoiceschanged=event=>{try{previous?.call(synth,event);}catch{}refreshVoices();};}
 }catch{}
 return {
  prepare,unlock,
  announce(key,text,{priority=1,cooldown=8,clip}={}){
   const entry=validEntry(catalog()[clip])?catalog()[clip]:null;
   if(entry&&typeof entry.text==='string'&&entry.text.trim())text=entry.text;
   if(!narrationEnabled||!allowed()||typeof text!=='string'||!text.trim())return false;
   text=text.trim();key=String(key);priority=limit(priority,0,100,1);cooldown=limit(cooldown,0,3600,8);
   if(recent.has(key)&&clock-recent.get(key)<cooldown)return false;
   if(active){
    if(active.kind==='spell'||active.key===key||active.text===text)return false;
    // Possession, passes and shots wait for the current sentence to finish.
    if(priority<4||priority<active.priority)return false;
   }
   recent.set(key,clock);if(recent.size>128)recent.delete(recent.keys().next().value);
   return begin(key,text,'narrator',priority,{},entry);
  },
  spell(text,voiceOptions={}){
   if(!allowed()||typeof text!=='string'||!text.trim())return false;
   // Spell sound effects still play in the game. Skip the spoken incantation
   // while a recorded sentence is playing, without cutting it or queuing words.
   if(active?.kind==='narrator'&&active.backend==='audio')return false;
   const entry=global.BroomSpellClips?.[text.trim().toUpperCase().replace(/[.!！]/g,'')];
   return begin('spell',entry?.text||text.trim(),'spell',101,voiceOptions,validEntry(entry)?entry:null);
  },
  tick(dt){
   if(!allowed()){if(active||caption)stop();return;}
   dt=limit(dt,0,60,0);clock+=dt;
   if(captionLife>0){captionLife=Math.max(0,captionLife-dt);if(captionLife===0)setCaption('');}
   if(active){active.remaining-=dt;if(active.remaining<=0)clearActive();}
  },
  stop,
  reset(){stop();recent.clear();clock=0;},
  setEnabled(value){narrationEnabled=value!==false;if(!narrationEnabled){if(active?.kind==='narrator')clearActive();setCaption('');}},
  setVolume(value){
   narrationVolume=limit(value,0,1,narrationVolume);
   if(active?.kind==='narrator'){
    if(active.backend==='audio'){try{active.record.audio.volume=narrationVolume;}catch{}}
    else if(active.backend==='speech'&&active.utterance)active.utterance.volume=narrationVolume;
   }
  },
  get state(){return {enabled:narrationEnabled,volume:narrationVolume,available:available(),voice:narratorVoice?.name||'Samantha (offline)',language:'en-US',backend:active?.backend||preferredBackend(),activeKey:active?.key||null,caption};}
 };
};
})(window);
