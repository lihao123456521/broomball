/* Team control decisions, independent of rendering and input.
 * Returns the exact player/allies object to control; never an opponent.
 * now and lastSwitchAt are match seconds. Record lastSwitchAt only after the
 * game actually switches bodies, and pass possessionChanged on a turnover.
 */
window.BroomTeamControl=(()=>{
 'use strict';
 const defaults=Object.freeze({holdSeconds:.35,minAdvantage:1.75,relativeAdvantage:.15,maxAdvantage:4});
 const finite=value=>Number.isFinite(value);
 function position(unit,player){
  const p=unit===player?player?.pos||player?.mesh?.position:unit?.mesh?.position||unit?.pos||unit?.position||unit;
  return p&&finite(p.x)&&finite(p.z)&&(!('y' in p)||finite(p.y))?p:null;
 }
 function distance(a,b){return Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);}
 function keeper(unit){return ['keeper','goalkeeper','gk'].includes(String(unit?.role||'').toLowerCase());}
 function available(unit,player){
  return !!unit&&!!position(unit,player)&&unit.available!==false&&unit.active!==false&&unit.disabled!==true
   &&!(unit.stun>0)&&unit.mesh?.visible!==false&&!unit.mesh?.userData?.disposed;
 }
 function setting(value,fallback){return finite(value)?Math.max(0,value):fallback;}
 function getDesiredUnit(options={}){
  const {player,allies=[],rivals=[],carrier=null,ball=null,passTarget=null,passSender=null,
   now=0,lastSwitchAt=-Infinity,enabled=true,paused=false,phase='',possessionChanged=false,
   force=false,selectPassReceiver=false}=options;
  if(!player)return null;
  if(!enabled||paused||['menu','paused','countdown','ended'].includes(phase))return player;
  const friendlyAllies=allies.filter(unit=>unit&&unit!==player&&!rivals.includes(unit));
  const friendly=unit=>unit==='player'||unit===player||friendlyAllies.includes(unit);
  const actual=unit=>unit==='player'?player:unit;
  // Holding the ball is authoritative, even for a keeper or a just-hit rider.
  // The game's possession system, rather than this selector, decides when a
  // rider drops it. A switch cooldown can never leave a team-mate holding it.
  if(carrier&&friendly(carrier))return position(actual(carrier),player)?actual(carrier):player;
  const homePass=!carrier&&friendly(passSender)&&friendly(passTarget);
  if(homePass){
   const receiver=actual(passTarget);
   if(selectPassReceiver&&available(receiver,player))return receiver;
   if(available(player,player))return player;
  }
  const candidates=[player,...friendlyAllies].filter(unit=>available(unit,player));
  const field=candidates.filter(unit=>!keeper(unit));
  // Keep the goalkeeper in goal while a field player can defend; a keeper is
  // still a valid last available player and always controllable in possession.
  const pool=field.length?field:candidates;
  if(!pool.length)return player;
  const target=position(rivals.includes(carrier)?carrier:ball,player)||position(ball,player);
  if(!target)return player;
  let best=pool[0],bestDistance=distance(position(best,player),target);
  for(const unit of pool.slice(1)){
   const d=distance(position(unit,player),target);
   // Player is first, so an exact tie preserves current control deterministically.
   if(d<bestDistance-1e-7){best=unit;bestDistance=d;}
  }
  if(best===player)return player;
  if(force||possessionChanged||!pool.includes(player))return best;
  const hold=setting(options.holdSeconds,defaults.holdSeconds);
  const age=now-lastSwitchAt;
  if(finite(age)&&age>=0&&age<hold)return player;
  const currentDistance=distance(position(player,player),target);
  const minimum=setting(options.minAdvantage,defaults.minAdvantage);
  const relative=setting(options.relativeAdvantage,defaults.relativeAdvantage);
  const maximum=Math.max(minimum,setting(options.maxAdvantage,defaults.maxAdvantage));
  const advantage=Math.max(minimum,Math.min(maximum,currentDistance*relative));
  return currentDistance-bestDistance>=advantage?best:player;
 }
 return Object.freeze({getDesiredUnit,defaults});
})();
