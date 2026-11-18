/* The menu uses the same rider factory and uploaded assets as the match. */
window.BroomCharacterPreview=(()=>{
 'use strict';
 const positions={harry:['锋线','快速前插 · 抢点射门'],hermione:['组织','跑位策应 · 连续短传'],ron:['防守','贴身跟防 · 拦截出球'],draco:['锋线','边路突破 · 抢点射门'],pansy:['组织','接应串联 · 穿透直塞'],blaise:['防守','覆盖中路 · 拦截出球'],luna:['组织','寻找空当 · 灵活策应'],cho:['锋线','斜线前插 · 快速终结'],padma:['防守','收紧站位 · 稳健出球'],cedric:['锋线','中路推进 · 抢点射门'],hannah:['组织','短传接应 · 转移进攻'],ernie:['防守','贴身盯防 · 反击出球']};
 function roleFor(id){const[role,style]=positions[id]||positions.harry;return{role,style};}
 function init({THREE:T,element,createWizard,disposeObject,getSelection,prepareWizard}={}){
  if(!element||!T)return null;
  element.innerHTML='<div class="preview-topline"><span>你的出场队长</span><span class="preview-live-dot">实时 3D</span></div><div class="preview-stage"><canvas id="characterPreviewCanvas" tabindex="0" aria-label="拖动以旋转当前角色的三维模型"></canvas><div class="preview-loading" role="status">正在准备角色…</div></div><div class="preview-identity"><div class="preview-house"></div><h2 class="preview-name"></h2><p class="preview-name-en"></p><div class="preview-details"><div><span>场上定位</span><strong class="preview-position"></strong></div><div><span>配合特点</span><strong class="preview-style"></strong></div></div></div>';
  const canvas=element.querySelector('canvas'),stage=element.querySelector('.preview-stage'),loading=element.querySelector('.preview-loading');
  const views=document.createElement('div');views.className='preview-view-switch';views.setAttribute('role','group');views.setAttribute('aria-label','角色预览范围');views.innerHTML='<button type="button" data-view="body" aria-pressed="true">全身 3D</button><button type="button" data-view="face" aria-pressed="false">面容近景</button>';
  const toolbar=document.createElement('div');toolbar.className='preview-toolbar';element.insertBefore(toolbar,stage);toolbar.append(views);
  let keyboard=document.getElementById('coreKeyboard');if(!keyboard){keyboard=document.createElement('section');keyboard.id='coreKeyboard';keyboard.className='core-keyboard';keyboard.setAttribute('aria-label','比赛按键');document.querySelector('#menu .menu-actions')?.before(keyboard);}
  keyboard.innerHTML='<div class="core-keyboard-title">一只左手，完成传、跑、射</div><div class="core-keyboard-body"><div class="core-key-layout" aria-label="键盘左手区域"><kbd class="key-esc">Esc</kbd><kbd class="key-w">W</kbd><kbd class="key-e action-key">E</kbd><kbd class="key-r action-key">R</kbd><kbd class="key-a">A</kbd><kbd class="key-s">S</kbd><kbd class="key-d">D</kbd><kbd class="key-f action-key">F</kbd><kbd class="key-shift">Shift</kbd></div><div class="core-key-legend"><span><b>W A S D</b>移动</span><span><b>E</b>短传</span><span><b>R</b>直塞</span><span><b>F</b>射门 / 逼抢</span><span><b>Shift</b>冲刺 <i>·</i> <b>Esc</b>暂停</span></div></div><p class="core-auto-control">我方接球自动操控 · 对手持球自动选最近防守者</p>';
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
  let wizard=null,selection=null,signature='',meshSignature='',appearanceSignature='',active=false,ready=false,frames=0,error=null;
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
   const position=roleFor(next.id);element.querySelector('.preview-position').textContent='队长 · '+position.role;
   element.querySelector('.preview-style').textContent=position.style;
   const accent=new T.Color(next.houseColor||0xc6ff58);ringMaterial.color.copy(accent);ringMaterial.emissive.copy(accent);rim.color.copy(accent).lerp(new T.Color(0xe2f0ff),.65);
  }
  function select(next){
   selection={...next};metadata(selection);ready=false;error=null;meshSignature='';appearanceSignature='';fitCountdown=0;manual=false;userRotation=0;rotation=-.12;faceFrame=null;
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
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(stage);
  function update(dt,{active:enabled=true}={}){
   active=!!enabled;if(!active)return;
   const next=getSelection?.();if(!next)return;
   const nextSignature=[next.id,next.house,next.broomId,next.broomLevel].join('|');
   if(nextSignature!==signature){signature=nextSignature;select(next);}else selection={...selection,...next};
   resize();if(!wizard)return;
   const appearance=[!!wizard.userData.importedWizard,!!wizard.userData.broomLoading,wizard.userData.artProfile].join('|');if(appearance!==appearanceSignature){appearanceSignature=appearance;fitCountdown=0;meshSignature='';}
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
 return Object.freeze({init,roleFor});
})();
