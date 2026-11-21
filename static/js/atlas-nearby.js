/* Retrieve annotations only after the reader opens the panel. */
window.OglcnacNearby = function(panel, accession, showOverlay) {
  let site, sequence, entry, pending, generation=0;
  const status=panel.querySelector('[role=status]'), list=panel.querySelector('ul'), retry=panel.querySelector('button');
  const updateDatasets=OglcnacProteomics(panel.querySelector('[data-proteomics]'),accession);
  const whole=panel.querySelector('[data-whole]'),overlay=panel.querySelector('[data-overlay]');
  async function render() {
    const current=++generation;
    list.replaceChildren(); retry.hidden=true;
    if(!panel.open)return;
    if(!whole.checked && (!site?.mapped || site.mismatch)){status.textContent='Select a sequence-verified site on the modification map.';return;}
    try {
      status.textContent='Checking UniProt modified-residue annotations…';
      if(!entry){
        pending ??= OglcnacStaticData.loadSiteAnnotations(accession).finally(()=>{pending=null;});
        entry=await pending;
      }
      const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sequence));
      if(current!==generation)return;
      const digest=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
      if(entry?.sequence_sha256!==digest){
        status.textContent='An exact accession and sequence match is unavailable for this record.';return;
      }
      showOverlay(overlay.checked ? [...new Set(entry.features.map(f=>f[0]))] : []);
      const matches=whole.checked ? entry.features : entry.features.filter(f=>Math.abs(f[0]-site.position)<=5);
      status.textContent=whole.checked ? matches.length+' release annotations on this protein.' : matches.length?'Release annotations within five sequence positions of '+site.residue+site.position+'.':'No matching annotation in the UniProt snapshot.';
      for(const [p,kind,description,evidences] of matches){
        const delta=p-(site?.position||0);
        const li=document.createElement('li');
        li.append(sequence[p-1]+p+' · '+(description||kind));
        if(entry.canonical_accession)li.append(' · '+entry.canonical_accession+' position '+entry.source_positions[p]);
        if(!whole.checked)li.append(' · '+(delta===0?'same site':(delta>0?'+':'')+delta+(Math.abs(delta)===1?' residue':' residues')));
        for(const id of new Set(evidences.filter(e=>e.source==='PubMed'&&/^\d+$/.test(e.id)).map(e=>e.id))){
          const link=document.createElement('a');link.href='https://pubmed.ncbi.nlm.nih.gov/'+id+'/';link.textContent='PMID '+id;li.append(' · ',link);
        }
        list.append(li);
      }
    }catch{if(current===generation){status.textContent='UniProt annotations could not be loaded.';retry.hidden=false;}}
  }
  panel.querySelector('a').href='https://www.uniprot.org/uniprotkb/'+encodeURIComponent(accession)+'/entry';
  whole.onchange=render;overlay.onchange=render;
  panel.addEventListener('toggle',render);retry.onclick=render;
  return (value,reference)=>{site=value;sequence=reference;updateDatasets(value,reference);render();};
};
