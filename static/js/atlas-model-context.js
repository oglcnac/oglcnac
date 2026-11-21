// All positions in the model use the verified fragment's one-based sequence index.
window.OglcnacModelContext = function(panel,accession) {
  const status=panel.querySelector('p'),body=panel.querySelector('tbody');
  let current,measurement,revision=0;
  const atomAt=(model,index)=>{
    const h=model.atomicHierarchy;
    for(let atom=h.residueAtomSegments.offsets[index];atom<h.residueAtomSegments.offsets[index+1];atom++){
      if(h.atoms.label_atom_id.value(atom)==='CA')return atom;
    }
    return null;
  };
  async function render(){
    const token=++revision;
    measurement=null;
    body.replaceChildren();
    panel.querySelector('table').hidden=true;
    if(!current || !panel.open)return;
    const {model,entry,sequence,position}=current;
    const origin=position-entry.start, c=model.atomicConformation;
    const atom=atomAt(model,origin);
    if(atom===null || c.B_iso_or_equiv.value(atom)<70){
      status.textContent='Site confidence or coordinates are insufficient for this measurement.';
      return;
    }
    try{
      status.textContent='Checking mapped modifications in this model…';
      const exposure=OglcnacSolvent.measure(model,origin,sequence[position-1]);
      const exposureText=exposure ? ' Solvent-accessible surface '+exposure.absolute.toFixed(1)+' Å² ('+(100*exposure.relative).toFixed(1)+'% of residue reference maximum).' : '';
      const record=await OglcnacStaticData.loadSiteAnnotations(accession);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sequence));
      if(token!==revision)return;
      if(!record || record.sequence_sha256!==Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')){
        status.textContent='Compatible release annotations are unavailable.'+exposureText;return;
      }
      const rows=[];
      for(const [pos,,description] of record.features){
        if(pos===position || pos<entry.start || pos>entry.end)continue;
        const other=atomAt(model,pos-entry.start);
        if(other===null || c.B_iso_or_equiv.value(other)<70)continue;
        const distance=Math.hypot(c.x[atom]-c.x[other],c.y[atom]-c.y[other],c.z[atom]-c.z[other]);
        if(distance<=10)rows.push({pos,description,distance,confidence:c.B_iso_or_equiv.value(other)});
      }
      rows.sort((a,b)=>a.distance-b.distance);
      const version=entry.latestVersion||entry.modelVersion||'unspecified';
      status.textContent=entry.entryId+' · model version '+version+' · '+new Set(rows.map(r=>r.pos)).size+' annotated positions within 10 Å (Cα distance, both pLDDT ≥70).'+exposureText;
      const result={accession,position,residue:sequence[position-1],model:entry.entryId,version,
        model_start:entry.start,model_end:entry.end,plddt:c.B_iso_or_equiv.value(atom),
        window_mean_plddt:current.mean,window_size:current.windowSize,
        solvent_area_angstrom2:exposure?.absolute??null,relative_solvent_accessibility:exposure?.relative??null,
        distance_limit_angstrom:10,minimum_plddt:70,neighbors:[]};
      const url=entry.paeDocUrl;
      let pae;
      if(rows.length && url && new URL(url).hostname==='alphafold.ebi.ac.uk'){
        try{
          const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
          if(response.ok)pae=(await response.json())[0]?.predicted_aligned_error;
        }catch{/* Local distances remain available if the separate error matrix is unavailable. */}
      }
      if(token!==revision)return;
      for(const row of rows){
        const index=row.pos-entry.start;
        const forward=pae?.[origin]?.[index],reverse=pae?.[index]?.[origin];
        const error=Number.isFinite(forward)&&Number.isFinite(reverse)?Math.max(forward,reverse).toFixed(1):'Unavailable';
        result.neighbors.push({position:row.pos,residue:sequence[row.pos-1],annotation:row.description,
          ca_distance_angstrom:row.distance,plddt:row.confidence,
          max_directional_pae_angstrom:error==='Unavailable'?null:Math.max(forward,reverse)});
        const tr=body.insertRow();
        for(const value of [sequence[row.pos-1]+row.pos,row.description,row.distance.toFixed(2),row.confidence.toFixed(1),error])tr.insertCell().textContent=value;
      }
      measurement=result;
      panel.querySelector('table').hidden=!rows.length;
    }catch{if(token===revision)status.textContent='Could not load site evidence. Close and reopen to retry.';}
  }
  panel.addEventListener('toggle',render);
  function update(value){current=value;panel.hidden=!value;render();}
  update.snapshot=position=>measurement?.position===position?measurement:null;
  return update;
};
