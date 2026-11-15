/* Two live face views share one canvas, using the exact match character factory. */
window.BroomPlayerPortraits=(()=>{
 'use strict';
 function init({THREE:T,element,createWizard,disposeObject}={}){
  if(!T||!element)return null;
  element.innerHTML='<canvas class="player-portraits-canvas" aria-label="当前操作球员与持球球员的三维面容"></canvas><div class="player-portrait" data-portrait="controlled"><div class="portrait-role">当前操控</div><div class="portrait-view"></div><strong class="portrait-name"></strong></div><div class="player-portrait" data-portrait="carrier"><div class="portrait-role">持球球员</div><div class="portrait-view"></div><strong class="portrait-name"></strong></div>';
  const renderer=new T.WebGLRenderer({canvas:element.querySelector('canvas'),alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;renderer.autoClear=false;
  const direction=new T.Vector3(.11,.075,-1).normalize();
  const slots=['controlled','carrier'].map(key=>{
   const node=element.querySelector('[data-portrait="'+key+'"]'),scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.01,30);
   scene.add(new T.HemisphereLight(0xe9f1ff,0x455263,2.1));
   for(const[color,intensity,position]of[[0xffecd9,2.7,[-3,4,-5]],[0xc5e1ff,1.8,[3,2,-3]],[0xdbebff,1.6,[2,3,4]]]){const light=new T.DirectionalLight(color,intensity);light.position.fromArray(position);scene.add(light);}
   return{key,node,view:node.querySelector('.portrait-view'),name:node.querySelector('.portrait-name'),role:node.querySelector('.portrait-role'),scene,camera,wizard:null,signature:'',identity:null,ready:false,source:null,facePixels:0,uploadedIds:[]};
  });
  let active=false,elapsed=0,frames=0,width=0,height=0,error=null,layoutKey='';
  function select(slot,identity){
   const signature=identity?[identity.id,identity.house].join('|'):'';
   slot.identity=identity?{...identity}:null;slot.name.textContent=identity?.name||'争夺中';slot.node.dataset.empty=identity?'false':'true';
   if(slot.signature===signature)return;slot.signature=signature;slot.ready=false;slot.source=null;
   if(slot.wizard){disposeObject?.(slot.wizard);slot.wizard=null;}
   if(!identity)return;
   try{slot.wizard=createWizard(identity.id);slot.wizard.name='MatchPortrait:'+slot.key;slot.wizard.position.set(0,0,0);slot.wizard.rotation.set(0,0,0);slot.scene.add(slot.wizard);window.BroomHouses?.applyUniform(slot.wizard,identity.house);}
   catch(reason){error=String(reason.message||reason);}
  }
  function draw(slot,root){
   if(!slot.wizard||slot.node.hidden)return;
   const frame=window.BroomCharacterArt?.getFaceFrame(slot.wizard);if(!frame)return;
   const box=slot.view.getBoundingClientRect(),x=box.left-root.left,y=root.bottom-box.bottom,w=box.width,h=box.height;if(w<1||h<1)return;
   slot.camera.aspect=w/h;slot.camera.updateProjectionMatrix();
   const distance=frame.radius/Math.tan(T.MathUtils.degToRad(slot.camera.fov*.5))*1.04;
   slot.camera.position.copy(frame.center).addScaledVector(direction,distance);slot.camera.lookAt(frame.center);slot.camera.updateMatrixWorld();
   renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.render(slot.scene,slot.camera);
   const ids=new Set();slot.wizard.traverseVisible(o=>{if(o.userData.uploadedModel)ids.add(o.userData.uploadedModel);});slot.uploadedIds=[...ids];
   const top=frame.center.clone().add(new T.Vector3(0,frame.radius*.7,0)).project(slot.camera),bottom=frame.center.clone().add(new T.Vector3(0,-frame.radius*.7,0)).project(slot.camera);
   slot.ready=slot.identity.id!=='harry'||!!slot.wizard.userData.importedWizard;slot.source=frame.source;slot.facePixels=Math.abs(top.y-bottom.y)*h*.5;
   slot.node.dataset.ready=String(slot.ready);
  }
  function update(dt,{active:enabled=false,controlled=null,carrier=null}={}){
   active=!!enabled;element.hidden=!active;if(!active){elapsed=0;return;}
   const same=!!controlled&&!!carrier&&(controlled.key&&carrier.key?controlled.key===carrier.key:controlled.id===carrier.id&&controlled.house===carrier.house),compact=window.matchMedia('(max-width:900px)').matches,nextLayout=[controlled?.key,carrier?.key,compact,same,!!carrier].join('|');
   const changed=nextLayout!==layoutKey||slots[0].signature!==(controlled?[controlled.id,controlled.house].join('|'):'')||slots[1].signature!==(carrier?[carrier.id,carrier.house].join('|'):'');layoutKey=nextLayout;
   slots[0].node.hidden=!!(compact&&carrier&&!same);slots[1].node.hidden=!carrier||same;
   if(compact&&carrier&&!same)slots[1].node.hidden=false;
   element.dataset.layout=slots.some(slot=>slot.node.hidden)?'single':'dual';
   slots[0].role.textContent=same?'当前持球 / 操控':'当前操控';
   select(slots[0],controlled);select(slots[1],carrier);elapsed+=Math.max(0,dt);if(!changed&&elapsed<.125)return;elapsed=0;
   const root=element.getBoundingClientRect(),w=Math.round(root.width),h=Math.round(root.height);if(w<1||h<1)return;
   if(width!==w||height!==h){width=w;height=h;renderer.setSize(width,height,false);}
   renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear();renderer.setScissorTest(true);
   for(const slot of slots)draw(slot,root);renderer.setScissorTest(false);frames++;
  }
  function getStatus(){return{active,renderedFrames:frames,width,height,layout:element.dataset.layout,error,slots:slots.map(slot=>({role:slot.key,visible:!slot.node.hidden,identity:slot.identity,ready:slot.ready,source:slot.source,facePixels:slot.facePixels,uploadedIds:[...slot.uploadedIds],profile:slot.wizard?.userData.artProfile||null}))};}
  function dispose(){for(const slot of slots)if(slot.wizard)disposeObject?.(slot.wizard);renderer.dispose();element.replaceChildren();}
  return{update,getStatus,dispose,renderer,get wizards(){return slots.map(slot=>slot.wizard);}};
 }
 return Object.freeze({init});
})();
