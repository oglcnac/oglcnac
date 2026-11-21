/* Retrieve annotations only after the reader opens the panel. */
window.OglcnacNearby = function(panel, accession) {
  let site, sequence, entry, pending, generation=0;
  const status=panel.querySelector('[role=status]'), list=panel.querySelector('ul'), retry=panel.querySelector('button');
  async function render() {
    const current=++generation;
    list.replaceChildren(); retry.hidden=true;
    if(!panel.open)return;
    if(!site?.mapped || site.mismatch){status.textContent='Select a sequence-verified site on the modification map.';return;}
    try {
      status.textContent='Checking UniProt modified-residue annotations…';
      if(!entry){
        pending ??= fetch('https://rest.uniprot.org/uniprotkb/'+encodeURIComponent(accession)+'.json',{signal:AbortSignal.timeout(20000)})
          .then(r=>{if(!r.ok)throw Error();return r.json();}).finally(()=>{pending=null;});
        entry=await pending;
      }
      if(current!==generation)return;
      if(entry.primaryAccession!==accession || entry.sequence?.value!==sequence){
        status.textContent='An exact accession and sequence match is unavailable for this record.';return;
      }
      const matches=(entry.features||[]).filter(f=>f.type==='Modified residue' && f.location?.start?.modifier==='EXACT' &&
        f.location.end?.modifier==='EXACT' && f.location.start.value===f.location.end.value && Math.abs(f.location.start.value-site.position)<=5)
        .sort((a,b)=>a.location.start.value-b.location.start.value);
      status.textContent=matches.length?'UniProt annotations within five sequence positions of '+site.residue+site.position+'.':'UniProt lists no exact-position modified-residue annotation within five residues of this site.';
      for(const f of matches){
        const p=f.location.start.value,delta=p-site.position;
        const li=document.createElement('li');
        li.append(sequence[p-1]+p+' · '+(f.description||'Modified residue')+' · '+(delta===0?'same site':(delta>0?'+':'')+delta+(Math.abs(delta)===1?' residue':' residues')));
        for(const id of new Set((f.evidences||[]).filter(e=>e.source==='PubMed'&&/^\d+$/.test(e.id)).map(e=>e.id))){
          const link=document.createElement('a');link.href='https://pubmed.ncbi.nlm.nih.gov/'+id+'/';link.textContent='PMID '+id;li.append(' · ',link);
        }
        list.append(li);
      }
    }catch{if(current===generation){status.textContent='UniProt annotations could not be loaded.';retry.hidden=false;}}
  }
  panel.querySelector('a').href='https://www.uniprot.org/uniprotkb/'+encodeURIComponent(accession)+'/entry';
  panel.addEventListener('toggle',render);retry.onclick=render;
  return (value,reference)=>{site=value;sequence=reference;render();};
};
