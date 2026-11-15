/* The menu uses the same rider factory and uploaded assets as the match. */
window.BroomCharacterPreview=(()=>{
 'use strict';
 function init({THREE:T,element,createWizard,disposeObject,getSelection,prepareWizard}={}){
  if(!element||!T)return null;
  element.innerHTML='<div class="preview-topline"><span>YOUR STARTING RIDER</span><span class="preview-live-dot">3D 角色</span></div><div class="preview-stage"><canvas id="characterPreviewCanvas" tabindex="0" aria-label="拖动以旋转当前角色的三维模型"></canvas><div class="preview-loading" role="status">正在准备角色…</div></div><div class="preview-identity"><div class="preview-house"></div><h2 class="preview-name"></h2><p class="preview-name-en"></p><div class="preview-details"><div><span>战术技能</span><strong class="preview-spell"></strong></div><div><span>飞行装备</span><strong class="preview-broom"></strong></div></div></div><div class="preview-rotation"><button type="button" class="preview-rotate-left" aria-label="向左旋转角色">↶</button><span>拖动模型旋转查看</span><button type="button" class="preview-rotate-right" aria-label="向右旋转角色">↷</button></div>';
  const canvas=element.querySelector('canvas'),stage=element.querySelector('.preview-stage'),loading=element.querySelector('.preview-loading');
  const views=document.createElement('div');views.className='preview-view-switch';views.setAttribute('role','group');views.setAttribute('aria-label','角色预览范围');views.innerHTML='<button type="button" data-view="body" aria-pressed="true">全身 3D</button><button type="button" data-view="face" aria-pressed="false">面容近景</button>';
  const toolbar=document.createElement('div');toolbar.className='preview-toolbar';element.insertBefore(toolbar,stage);toolbar.append(views,element.querySelector('.preview-rotation'));
  // Equipment is an optional drawer. Its own close action keeps the original
  // selector and keyboard focus available without adding a second menu page.
  const shop=document.getElementById('broomShop');if(shop&&!shop.querySelector('.broom-shop-close')){const close=document.createElement('button');close.type='button';close.className='broom-shop-close';close.textContent='关闭装备库 ×';close.addEventListener('click',()=>{const toggle=document.getElementById('broomShopToggle');if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();toggle?.focus();});shop.prepend(close);}
  const actions=document.querySelector('#menu .menu-actions'),summary=document.createElement('div');summary.className='lobby-match-summary';summary.innerHTML='<span>即将开赛</span><strong></strong><small></small>';actions?.before(summary);
  function updateSummary(){const home=document.querySelector('.house-option[aria-pressed="true"] strong')?.textContent||'',away=document.getElementById('opponentHouse')?.selectedOptions[0]?.textContent||'',mode=document.querySelector('.mode-option[aria-pressed="true"]');const title=mode?.dataset.mode==='training'?'学院飞行训练':home+'  vs  '+away,detail=[mode?.querySelector('strong')?.textContent,mode?.querySelector('small')?.textContent].filter(Boolean).join(' · ');if(summary.querySelector('strong').textContent!==title)summary.querySelector('strong').textContent=title;if(summary.querySelector('small').textContent!==detail)summary.querySelector('small').textContent=detail;}
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.1,80),pivot=new T.Group();pivot.name='MenuRiderStage';scene.add(pivot);
  scene.add(new T.HemisphereLight(0xe9f4ff,0x354552,1.8));
  const key=new T.DirectionalLight(0xffecce,2.7);key.position.set(-4,7,-6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=6;key.shadow.camera.bottom=-3;key.shadow.bias=-.0005;scene.add(key);
  const fill=new T.DirectionalLight(0xc6e6ff,1.7);fill.position.set(5,3,-2);scene.add(fill);
  const rim=new T.DirectionalLight(0xc6ffb2,2.0);rim.position.set(1,6,5);scene.add(rim);
  const discMaterial=new T.MeshStandardMaterial({color:0x1b3545,metalness:.42,roughness:.56});
  const disc=new T.Mesh(new T.CylinderGeometry(2.65,2.95,.20,64),discMaterial);disc.position.y=-.12;disc.receiveShadow=true;scene.add(disc);
  const ringMaterial=new T.MeshStandardMaterial({color:0xc6ff58,emissive:0xc6ff58,emissiveIntensity:.18,metalness:.65,roughness:.32});
  const ring=new T.Mesh(new T.TorusGeometry(2.65,.022,6,80),ringMaterial);ring.rotation.x=Math.PI/2;ring.position.y=-.01;scene.add(ring);
  const shadow=new T.Mesh(new T.CircleGeometry(2.35,48),new T.MeshBasicMaterial({color:0x020a10,transparent:true,opacity:.24,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;scene.add(shadow);
  let wizard=null,selection=null,signature='',meshSignature='',active=false,ready=false,frames=0,error=null;
  let elapsed=0,fitCountdown=0,width=0,height=0,rotation=-.12,userRotation=0,dragging=false,dragX=0,manual=false,viewMode='body',faceFrame=null;
  let center=new T.Vector3(0,1.6,0),distance=10,baseY=.5,projectedBounds=null,meshes=0,triangles=0,uploadedIds=[];
  const direction=new T.Vector3(2.3,1.7,-8).normalize(),faceDirection=new T.Vector3(.12,.10,-1).normalize(),emptyBounds=()=>new T.Box3();
  function visibleBounds(){
   const box=emptyBounds();meshes=0;triangles=0;const ids=new Set();
   wizard?.updateWorldMatrix(true,true);
   wizard?.traverseVisible(object=>{
    if(object.userData.uploadedModel)ids.add(object.userData.uploadedModel);
    if(!object.isMesh||!object.geometry)return;
    const geometry=object.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
    if(geometry.boundingBox)box.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    meshes++;triangles+=(geometry.index?.count||geometry.getAttribute('position')?.count||0)/3;
   });
   uploadedIds=[...ids];return box;
  }
  function corners(box){const points=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(new T.Vector3(x,y,z));return points;}
  function project(box){
   camera.updateMatrixWorld();const p=corners(box).map(point=>point.project(camera));
   const left=Math.min(...p.map(p=>p.x)),right=Math.max(...p.map(p=>p.x)),bottom=Math.min(...p.map(p=>p.y)),top=Math.max(...p.map(p=>p.y));
   return {left:(left*.5+.5)*width,right:(right*.5+.5)*width,top:(.5-top*.5)*height,bottom:(.5-bottom*.5)*height,pixelWidth:(right-left)*width*.5,pixelHeight:(top-bottom)*height*.5,ndcWidth:right-left,ndcHeight:top-bottom};
  }
  function placeCamera(){camera.position.copy(center).addScaledVector(viewMode==='face'?faceDirection:direction,distance);camera.lookAt(center);camera.updateMatrixWorld();}
  function fit(){
   if(!wizard||!width||!height)return;
   const oldRotation=pivot.rotation.y;pivot.rotation.y=rotation+userRotation;wizard.position.y=0;scene.updateMatrixWorld(true);
   let box=visibleBounds();if(box.isEmpty()){pivot.rotation.y=oldRotation;return;}
   baseY=.48-box.min.y;wizard.position.y=baseY;scene.updateMatrixWorld(true);box=visibleBounds();
   if(viewMode==='face'){
    faceFrame=window.BroomCharacterArt?.getFaceFrame(wizard);if(faceFrame){center.copy(faceFrame.center);center.y+=faceFrame.radius*.07;wizard.localToWorld(center);distance=faceFrame.radius/Math.tan(T.MathUtils.degToRad(camera.fov*.5))*1.23;distance*=Math.max(1,1/camera.aspect);placeCamera();projectedBounds=project(box);return;}
   }
   const size=box.getSize(new T.Vector3());box.getCenter(center);center.y-=size.y*.015;
   distance=Math.max(5.3,size.length()*.9);
   for(let i=0;i<6;i++){placeCamera();const projection=project(box),ratio=Math.max((width*.5-projection.left)/(width*.43),(projection.right-width*.5)/(width*.43),(height*.5-projection.top)/(height*.41),(projection.bottom-height*.5)/(height*.41));distance*=T.MathUtils.clamp(ratio,.72,1.6);}
   distance=Math.max(4.5,distance);placeCamera();projectedBounds=project(box);
  }
  function resize(){
   const bounds=stage.getBoundingClientRect(),nextWidth=Math.max(1,Math.round(bounds.width)),nextHeight=Math.max(1,Math.round(bounds.height));
   if(nextWidth===width&&nextHeight===height)return;
   width=nextWidth;height=nextHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();fit();
  }
  function metadata(next){
   element.style.setProperty('--preview-house',next.houseColor||'#c6ff58');
   element.querySelector('.preview-house').textContent=next.houseName||next.house||'学院代表队';
   element.querySelector('.preview-name').textContent=next.name||next.id||'';
   element.querySelector('.preview-name-en').textContent=next.en||'';
   element.querySelector('.preview-spell').textContent=next.spell||'';
   element.querySelector('.preview-broom').textContent=next.broomName||'学院赛用扫帚';
   const accent=new T.Color(next.houseColor||0xc6ff58);ringMaterial.color.copy(accent);ringMaterial.emissive.copy(accent);rim.color.copy(accent).lerp(new T.Color(0xe2f0ff),.65);
  }
  function select(next){
   selection={...next};metadata(selection);ready=false;error=null;meshSignature='';fitCountdown=0;manual=false;userRotation=0;rotation=-.12;faceFrame=null;
   loading.hidden=false;
   if(wizard)disposeObject?.(wizard);
   try{
    wizard=createWizard(next.id);wizard.name='MenuPreviewRider';wizard.position.set(0,0,0);wizard.rotation.set(0,0,0);pivot.add(wizard);
    if(prepareWizard)prepareWizard(wizard,next);
    else{window.BroomHouses?.applyUniform(wizard,next.house);window.BroomGarage?.mount(wizard,next.broomId,next.broomLevel);}
    fit();
   }catch(reason){error=String(reason.message||reason);loading.textContent='角色准备中，请稍候';}
  }
  function rotate(amount){manual=true;userRotation+=amount;fit();}
  function setView(mode){viewMode=mode==='face'?'face':'body';manual=false;userRotation=0;for(const button of views.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.view===viewMode));disc.visible=ring.visible=shadow.visible=viewMode==='body';fit();}
  for(const button of views.querySelectorAll('button'))button.addEventListener('click',()=>setView(button.dataset.view));
  canvas.addEventListener('pointerdown',event=>{dragging=true;dragX=event.clientX;manual=true;try{canvas.setPointerCapture(event.pointerId);}catch{}canvas.focus();});
  canvas.addEventListener('pointermove',event=>{if(!dragging)return;userRotation+=(event.clientX-dragX)*.012;dragX=event.clientX;fit();});
  const release=()=>{dragging=false;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('keydown',event=>{if(event.code==='ArrowLeft'||event.code==='ArrowRight'){event.preventDefault();event.stopPropagation();rotate(event.code==='ArrowLeft'?.25:-.25);}});
  element.querySelector('.preview-rotate-left').addEventListener('click',()=>rotate(.38));element.querySelector('.preview-rotate-right').addEventListener('click',()=>rotate(-.38));
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(stage);
  function update(dt,{active:enabled=true}={}){
   active=!!enabled;if(!active)return;updateSummary();
   const next=getSelection?.();if(!next)return;
   const nextSignature=[next.id,next.house,next.broomId,next.broomLevel].join('|');
   if(nextSignature!==signature){signature=nextSignature;select(next);}else selection={...selection,...next};
   resize();if(!wizard)return;
   elapsed+=Math.min(Math.max(dt,0),.05);fitCountdown-=dt;
   if(!manual&&!selection.reducedMotion)pivot.rotation.y=rotation+Math.sin(elapsed*.45)*.13;else pivot.rotation.y=rotation+userRotation;
   wizard.position.y=baseY+(!selection.reducedMotion?Math.sin(elapsed*1.8)*.035:0);
   if(fitCountdown<=0){
    fitCountdown=.18;let count=0;wizard.traverseVisible(object=>{if(object.isMesh)count++;});
    const currentSignature=[count,!!wizard.userData.importedWizard,!!wizard.userData.broomLoading,!!wizard.userData.characterArtVersion].join('|');
    if(currentSignature!==meshSignature){meshSignature=currentSignature;fit();}
   }
   scene.updateMatrixWorld(true);const box=visibleBounds();projectedBounds=box.isEmpty()?null:project(box);
   // Dragging can expose the long side of a broom. Expand just enough to keep it in view.
   if(viewMode==='body'&&projectedBounds&&(projectedBounds.left<width*.045||projectedBounds.right>width*.955||projectedBounds.top<height*.035||projectedBounds.bottom>height*.965)){distance*=1.025;placeCamera();projectedBounds=project(box);}
   renderer.render(scene,camera);frames++;
   ready=!wizard.userData.broomLoading&&(selection.id!=='harry'||!!wizard.userData.importedWizard)&&!error;
   loading.hidden=ready;
  }
  function getStatus(){return {characterId:selection?.id||null,house:selection?.house||null,ready,active,renderedFrames:frames,width,height,meshCount:meshes,triangles:Math.round(triangles),uploadedIds:[...uploadedIds],projectedBounds,viewMode,faceSource:faceFrame?.source||null,error,rotation:pivot.rotation.y};}
  function refresh(){signature='';}
  function dispose(){observer?.disconnect();if(wizard)disposeObject?.(wizard);for(const object of[disc,ring,shadow]){object.geometry.dispose();object.material.dispose();}renderer.dispose();}
  resize();
  return {update,getStatus,refresh,dispose,renderer,scene,camera,get wizard(){return wizard;}};
 }
 return Object.freeze({init});
})();
