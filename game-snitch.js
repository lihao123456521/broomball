/* Imported golden snitch; original procedural object stays until the GLB is ready. */
window.SnitchAsset={
 attach(root){
  new THREE.GLTFLoader().load('./assets/snitch/lux3d-snitch.glb',gltf=>{
   const model=gltf.scene;model.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=2.8/size.x;
   if(!model.getObjectByName('WingL')||!model.getObjectByName('WingR')){console.warn('飞贼缺少翅膀，保留原模型。');return;}
   model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);model.name='Lux3DGoldenSnitch';
   model.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;}});
   for(const child of [...root.children])if(!child.isLight){child.traverse(p=>{if(p.geometry)p.geometry.dispose();});root.remove(child);}
   root.add(model);root.userData.imported=true;
  },undefined,error=>{root.userData.assetError=true;console.warn('飞贼模型加载失败，保留原模型。',error);});
 },
 animate(root,flap){const left=root.getObjectByName('WingL'),right=root.getObjectByName('WingR');if(!left||!right)return;left.rotation.z=root.userData.imported?flap*.65:-.28+flap;right.rotation.z=root.userData.imported?-flap*.65:.28-flap;}
};
