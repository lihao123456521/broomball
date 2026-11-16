/* One shared, equal-speed match broom. The uploaded GLB is the actual gear. */
window.BroomRiderGear=(()=>{
 const item=Object.freeze({id:'uploaded-broom',name:'学院赛用扫帚'});
 async function mount(wizard){
  const slot=wizard.userData.replaceable.broom;
  if(wizard.userData.broomId===item.id&&slot.children.some(child=>child.userData.uploadedModel==='broom'))return;
  const token={};wizard.userData.broomRequest=token;wizard.userData.broomLoading=true;
  try{
   const template=await window.BroomModels.load('broom');if(wizard.userData.broomRequest!==token||wizard.userData.disposed||!wizard.parent)return;
   const model=template.clone(true);model.traverse(object=>{if(object.isMesh){object.geometry=object.geometry.clone();object.geometry.userData.sharedModel=false;object.castShadow=object.receiveShadow=true;}});
   model.rotation.y=-Math.PI/2;model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=4.8/Math.max(.001,size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,.38-center.y*scale,.25-center.z*scale);model.name='ImportedMatchBroom';
   slot.traverse(object=>{if(object.geometry&&!object.geometry.userData.sharedModel)object.geometry.dispose();});slot.clear();slot.add(model);window.BroomModels.recordPlacement(model,'broom','core-match-'+wizard.uuid);wizard.userData.broomId=item.id;wizard.userData.broomLevel=0;wizard.userData.broomMultiplier=1;wizard.userData.broomError=false;
  }catch(error){wizard.userData.broomError=true;console.warn('Match broom unavailable',error);}
  finally{if(wizard.userData.broomRequest===token){wizard.userData.broomLoading=false;window.dispatchEvent(new Event('broom-model-ready'));}}
 }
 return Object.freeze({mount,current:()=>item,level:()=>0});
})();
window.BroomGarage=window.BroomRiderGear;
