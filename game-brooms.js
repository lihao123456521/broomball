/* Local broom inventory, team lineups and opponent equipment budgets. */
window.BroomGarage=(()=>{
 'use strict';
 const catalog=[
  {id:'lux-basic',name:'初学者 · 木羽',description:'Lux3D 生成的基础扫帚 · 你的第一把飞行装备',price:0,model:'./assets/brooms/lux3d-basic.glb',image:'./assets/brooms/lux-basic.png',power:1},
  {id:'classic',name:'经典训练扫帚',description:'原版轻巧扫帚 · 熟悉的球场伙伴',price:0,model:null,image:'./assets/brooms/classic.png',power:1}
 ];
 const key='broomball-career-v1',maxLevel=3,models=new Map(),roles=['chaser0','chaser1','keeper','seeker'];
 const houses=['gryffindor','slytherin','ravenclaw','hufflepuff'];
 const state={coins:0,equipped:'lux-basic',owned:['lux-basic','classic'],levels:{},lineups:{},opponents:{},rosterVersion:2};
 let storageOK=true;
 const valid=id=>catalog.some(b=>b.id===id),money=v=>Number.isSafeInteger(v)&&v>=0?v:0,clampLevel=v=>Number.isInteger(v)?Math.max(0,Math.min(maxLevel,v)):0;
 try{
  const s=JSON.parse(localStorage.getItem(key)||'null');
  if(s){
   state.coins=money(s.coins);
   state.owned=[...new Set([...state.owned,...(Array.isArray(s.owned)?s.owned:[]).filter(valid)])];
   if(s.rosterVersion===2&&state.owned.includes(s.equipped))state.equipped=s.equipped;
   for(const b of catalog)state.levels[b.id]=clampLevel(s.levels?.[b.id]);
   for(const house of houses){
    const lineup=s.lineups?.[house]||{};
    state.lineups[house]={chaser:state.owned.includes(lineup.chaser)?lineup.chaser:'lux-basic',keeper:state.owned.includes(lineup.keeper)?lineup.keeper:'lux-basic'};
    const old=s.opponents?.[house];if(!old)continue;
    const owned=[...new Set(['lux-basic',...(Array.isArray(old.owned)?old.owned:[]).filter(valid)])];
    state.opponents[house]={coins:money(old.coins),owned,matches:money(old.matches),wins:money(old.wins),lastReward:money(old.lastReward),lastSpent:money(old.lastSpent),members:{}};
    for(const role of roles){const item=old.members?.[role];state.opponents[house].members[role]={id:owned.includes(item?.id)?item.id:'lux-basic',level:clampLevel(item?.level)};}
   }
  }
 }catch{storageOK=false;}
 function save(){try{localStorage.setItem(key,JSON.stringify(state));storageOK=true;}catch{storageOK=false;}}
 function current(){return catalog.find(b=>b.id===state.equipped);}
 function level(id=state.equipped){return state.levels[id]||0;}
 function multiplier(id=state.equipped,lv=level(id)){return (catalog.find(b=>b.id===id)?.power||1)*(1+lv*.03);}
 function cost(id){return 100*(level(id)+1);}
 function equip(id){if(!state.owned.includes(id)||!valid(id))return false;state.equipped=id;save();return true;}
 function assign(house,role,id){if(!houses.includes(house)||!['chaser','keeper'].includes(role)||!state.owned.includes(id)||!valid(id))return false;lineup(house)[role]=id;save();return true;}
 function lineup(house){if(!state.lineups[house])state.lineups[house]={chaser:'lux-basic',keeper:'lux-basic'};return state.lineups[house];}
 function buy(id){const b=catalog.find(b=>b.id===id);if(!b||state.owned.includes(id)||state.coins<b.price)return false;state.coins-=b.price;state.owned.push(id);save();return true;}
 function upgrade(id){if(!state.owned.includes(id)||level(id)>=maxLevel||state.coins<cost(id))return false;state.coins-=cost(id);state.levels[id]=level(id)+1;save();return true;}
 function prize(mode,home,away){if(!['standard','challenge'].includes(mode))return 0;return Math.round((home>away?120:home===away?70:40)*(mode==='challenge'?1.5:1));}
 function reward(mode,home,away){const amount=prize(mode,home,away);state.coins+=amount;save();return amount;}
 function opponent(house){
  if(!state.opponents[house])state.opponents[house]={coins:0,owned:['lux-basic'],matches:0,wins:0,lastReward:0,lastSpent:0,members:Object.fromEntries(roles.map(r=>[r,{id:'lux-basic',level:0}]))};
  return state.opponents[house];
 }
 function autoEquip(team){
  let spent=0;
  // Evaluate real affordable upgrades; funds are deducted before changing equipment.
  for(let step=0;step<64;step++){
   const choices=[];
   for(const role of ['seeker','chaser0','chaser1','keeper']){
    const item=team.members[role],power=multiplier(item.id,item.level),weight=role==='keeper'?.8:1;
    if(item.level<maxLevel){const price=100*(item.level+1);if(price<=team.coins)choices.push({role,id:item.id,level:item.level+1,price,value:(multiplier(item.id,item.level+1)-power)*weight/price});}
    for(const b of catalog){const price=team.owned.includes(b.id)?0:b.price,gain=multiplier(b.id,0)-power;if(gain>0&&price<=team.coins)choices.push({role,id:b.id,level:0,price,value:gain*weight/Math.max(1,price)});}
   }
   choices.sort((a,b)=>b.value-a.value);const best=choices[0];if(!best)break;
   team.coins-=best.price;spent+=best.price;if(!team.owned.includes(best.id))team.owned.push(best.id);team.members[best.role]={id:best.id,level:best.level};
  }
  return spent;
 }
 function settleOpponent(house,mode,home,away){
  const amount=prize(mode,away,home);if(!amount)return {reward:0,spent:0,coins:opponent(house).coins};
  const team=opponent(house);team.coins+=amount;team.matches++;if(away>home)team.wins++;team.lastReward=amount;team.lastSpent=autoEquip(team);save();
  return {reward:amount,spent:team.lastSpent,coins:team.coins};
 }
 function load(broom){if(!models.has(broom.id)){const promise=new Promise((resolve,reject)=>new THREE.GLTFLoader().load(broom.model,g=>resolve(g.scene),undefined,reject));models.set(broom.id,promise);promise.catch(()=>models.delete(broom.id));}return models.get(broom.id);}
 function mark(wizard,id,lv){wizard.userData.broomId=id;wizard.userData.broomLevel=lv;wizard.userData.broomMultiplier=multiplier(id,lv);}
 async function mount(wizard,id=state.equipped,lv=level(id)){
  const broom=catalog.find(b=>b.id===id);if(!broom)return;
  const slot=wizard.userData.replaceable.broom,token={};wizard.userData.broomRequest=token;wizard.userData.broomLoading=true;wizard.userData.broomError=false;
  // Preserve a clean procedural fallback for switching back after a GLB was equipped.
  if(!slot.userData.fallback)slot.userData.fallback=slot.children.map(c=>{const copy=c.clone(true);copy.traverse(p=>{if(p.geometry)p.geometry=p.geometry.clone();});return copy;});
  try{
   let model=null;
   if(broom.model){
    const template=await load(broom);if(wizard.userData.broomRequest!==token||!wizard.parent)return;
    model=template.clone(true);model.traverse(p=>{if(p.isMesh){p.geometry=p.geometry.clone();p.castShadow=true;p.receiveShadow=true;}});
    model.rotation.y=broom.rotationY??-Math.PI/2;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=(broom.length||4.8)/size.z;
    model.scale.setScalar(scale);model.position.set(-center.x*scale,.38-center.y*scale,.25-center.z*scale);model.name=id==='lux-basic'?'Lux3DBasicBroom':'ImportedBroom';
   }
   if(wizard.userData.broomRequest!==token)return;
   slot.traverse(p=>{if(p.geometry)p.geometry.dispose();});slot.clear();
   if(model)slot.add(model);else for(const c of slot.userData.fallback){const copy=c.clone(true);copy.traverse(p=>{if(p.geometry)p.geometry=p.geometry.clone();});slot.add(copy);}
   mark(wizard,id,lv);
  }catch(error){console.warn('扫帚模型加载失败，保留当前扫帚。',error);wizard.userData.broomError=true;}
  finally{if(wizard.userData.broomRequest===token){wizard.userData.broomLoading=false;window.dispatchEvent(new Event('broom-model-ready'));}}
 }
 return {catalog,current,level,multiplier,cost,equip,assign,lineup,buy,upgrade,reward,opponent,settleOpponent,mount,maxLevel,get state(){return JSON.parse(JSON.stringify(state));},get storageOK(){return storageOK;}};
})();
window.initBroomShop=function({replacePlayerModel,applyTeamEquipment,match,houses}){
 const garage=window.BroomGarage,$=id=>document.getElementById(id);let message='';
 const houseName=id=>houses.find(h=>h.id===id)?.name||id;
 function render(){
  const state=garage.state;$('broomBalance').textContent=state.coins+' 金币';$('equippedBroom').textContent=garage.current().name+' · Lv.'+garage.level();
  $('broomNotice').textContent=message||(!garage.storageOK?'浏览器无法保存进度，请检查本地存储是否可用。':'标准赛胜利 120 / 平局 70 / 失利 40 金币；挑战赛奖金 ×1.5。训练与中途退出无奖金。');$('broomCards').replaceChildren();
  for(const broom of garage.catalog){
   const owned=state.owned.includes(broom.id),active=state.equipped===broom.id,lv=garage.level(broom.id),card=document.createElement('article');card.className='broom-card'+(active?' equipped':'');
   if(broom.image){const img=document.createElement('img');img.src=broom.image;img.alt=broom.name+'实物预览';img.className='broom-product-image';img.loading='lazy';card.append(img);}
   const title=document.createElement('h3');title.textContent=broom.name;card.append(title);const desc=document.createElement('p');desc.textContent=broom.description;card.append(desc);
   const stats=document.createElement('p');stats.textContent='Lv.'+lv+' / '+garage.maxLevel+' · 巡航与冲刺速度 +'+Math.round((garage.multiplier(broom.id,lv)-1)*100)+'%';card.append(stats);
   const select=document.createElement('button');select.type='button';select.className='secondary';select.textContent=active?'已装备':owned?'装备':broom.price+' 金币 · 购买';select.disabled=active||(!owned&&state.coins<broom.price);
   select.onclick=()=>{if(match.state!=='menu')return;if(!owned&&!garage.buy(broom.id))return;if(garage.equip(broom.id)){replacePlayerModel();message='已装备 '+broom.name+'。';render();}};card.append(select);
   if(owned){const upgrade=document.createElement('button');upgrade.type='button';upgrade.className='secondary';upgrade.textContent=lv>=garage.maxLevel?'已满级':'升级 · '+garage.cost(broom.id)+' 金币';upgrade.disabled=lv>=garage.maxLevel||state.coins<garage.cost(broom.id);upgrade.onclick=()=>{if(match.state==='menu'&&garage.upgrade(broom.id)){applyTeamEquipment();message=broom.name+' 已升至 Lv.'+garage.level(broom.id)+'，速度提升已生效。';render();}};card.append(upgrade);}
   $('broomCards').append(card);
  }
  $('teamLoadouts').replaceChildren();
  for(const [role,label] of [['player','我的扫帚'],['chaser','接应手扫帚'],['keeper','守门员扫帚']]){
   const row=document.createElement('label');row.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label);select.dataset.role=role;
   for(const b of garage.catalog.filter(b=>state.owned.includes(b.id))){const opt=document.createElement('option');opt.value=b.id;opt.textContent=b.name+' · Lv.'+garage.level(b.id);select.append(opt);}
   select.value=role==='player'?state.equipped:garage.lineup(match.homeHouse)[role];select.onchange=()=>{if(match.state!=='menu')return;const ok=role==='player'?garage.equip(select.value):garage.assign(match.homeHouse,role,select.value);if(ok){if(role==='player')replacePlayerModel();else applyTeamEquipment();message=label+'已配置。';render();}};row.append(select);$('teamLoadouts').append(row);
  }
  $('teamEquipmentTitle').textContent=houseName(match.homeHouse)+' · 队伍装备';const team=garage.opponent(match.awayHouse);
  $('opponentEquipmentTitle').textContent=houseName(match.awayHouse)+' · 对手装备';
  $('opponentBudget').textContent='装备资金 '+team.coins+' 金币 · 已完成 '+team.matches+' 场 · 最近奖金 '+team.lastReward+' / 装备支出 '+team.lastSpent+' 金币';
  $('opponentLoadouts').replaceChildren();
  for(const [role,label] of [['chaser0','追球手一'],['chaser1','追球手二'],['keeper','守门员'],['seeker','找球手']]){const item=team.members[role],p=document.createElement('p');p.textContent=label+'：'+(garage.catalog.find(b=>b.id===item.id)?.name||item.id)+' · Lv.'+item.level;$('opponentLoadouts').append(p);}
 }
 $('broomShopToggle').onclick=()=>{const panel=$('broomShop');panel.hidden=!panel.hidden;$('broomShopToggle').setAttribute('aria-expanded',String(!panel.hidden));message='';render();if(!panel.hidden)panel.scrollIntoView({block:'start',behavior:'smooth'});};
 window.addEventListener('broom-model-ready',()=>{if(window.__BROOMBALL__?.player.mesh.userData.broomError){message='模型暂时无法加载，保留当前扫帚。刷新页面可重试。';render();}});
 window.addEventListener('broom-career-updated',()=>{message='';render();});render();
};
