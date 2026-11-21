// Shrake–Rupley heavy-atom SASA with a 1.4 Å water probe and 960 samples per atom.
(function(root){
  const radii={C:1.70,N:1.55,O:1.52,S:1.80,SE:1.90,P:1.80};
  const maxima={S:155,T:172,Y:263};
  const samples=960;
  const points=Array.from({length:samples},(_,i)=>{
    const z=1-2*(i+0.5)/samples,r=Math.sqrt(1-z*z);
    const angle=i*Math.PI*(3-Math.sqrt(5));
    return [Math.cos(angle)*r,Math.sin(angle)*r,z];
  });
  function area(atoms,start,end){
    let total=0;
    for(let i=start;i<end;i++){
      const a=atoms[i];
      if(!a)continue;
      const nearby=[];
      for(let j=0;j<atoms.length;j++){
        const b=atoms[j];
        if(j===i || !b)continue;
        const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
        if(x*x+y*y+z*z<(a.radius+b.radius)**2)nearby.push([x,y,z,b.radius*b.radius]);
      }
      let visible=0;
      for(const [dx,dy,dz] of points){
        const x=a.radius*dx,y=a.radius*dy,z=a.radius*dz;
        if(!nearby.some(b=>(x-b[0])**2+(y-b[1])**2+(z-b[2])**2<b[3]))visible++;
      }
      total+=4*Math.PI*a.radius*a.radius*visible/samples;
    }
    return total;
  }
  function measure(model,index,residue){
    if(!maxima[residue])return null;
    const h=model.atomicHierarchy,c=model.atomicConformation;
    const atoms=[];
    for(let i=0;i<h.atoms._rowCount;i++){
      const element=h.atoms.type_symbol.value(i);
      if(element==='H'||element==='D'){atoms.push(null);continue;}
      if(!radii[element])return null;
      atoms.push({x:c.x[i],y:c.y[i],z:c.z[i],radius:radii[element]+1.4});
    }
    const offsets=h.residueAtomSegments.offsets;
    const absolute=area(atoms,offsets[index],offsets[index+1]);
    return {absolute,relative:absolute/maxima[residue]};
  }
  root.OglcnacSolvent={area,measure};
})(typeof window==='undefined'?module.exports:window);
