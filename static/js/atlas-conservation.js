// Counts each species once in the one-to-one summary. Other relationships remain visible.
window.OglcnacConservation=function(panel,accession){
  const status=panel.querySelector('[role=status]'),table=panel.querySelector('table');
  const body=table.tBodies[0],source=panel.querySelector('a');
  const oma=panel.querySelector('[data-oma]');
  async function showGroup(token){
    try{
      const {record,release}=await OglcnacStaticData.loadOmaGroup(accession);
      if(token!==revision || !record)return;
      const link=document.createElement('a');
      link.href='https://omabrowser.org/oma/info/'+encodeURIComponent(record.entry)+'/';
      link.textContent=record.entry;
      oma.replaceChildren('OMA '+release+' · ',link,record.group?' · group '+record.group+' ('+record.members+' proteins)':'');
      oma.hidden=false;
    }catch{/* The independently cached alignment panel remains available. */}
  }
  let selected,reference,revision=0;
  async function render(){
    const token=++revision;
    body.replaceChildren();table.hidden=true;source.hidden=true;
    oma.hidden=true;
    if(!panel.open)return;
    showGroup(token);
    if(!selected?.mapped || selected.mismatch){
      status.textContent='Select a residue verified against the Atlas sequence.';return;
    }
    const pos=selected.position,aa=selected.residue;
    try{
      status.textContent='Loading release alignments…';
      let {protein,manifest}=await OglcnacStaticData.loadConservation(accession);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(reference));
      if(token!==revision)return;
      const digest=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
      if(protein && protein.sequence_sha256!==digest)protein=null;
      let isOma=false;
      if(!protein?.sites[String(pos)]?.length){
        const supplement=await OglcnacStaticData.loadOmaAlignment(accession);
        if(token!==revision)return;
        if(supplement?.sequence_sha256===digest && supplement.sites[String(pos)]?.length){
          protein=supplement;
          isOma=true;
        }
      }
      if(!protein){
        status.textContent='No verified ortholog alignment for this sequence in the release.';return;
      }
      const rows=protein.sites[String(pos)]||[],groups=new Map();
      for(const row of rows){
        if(row[2] !== (isOma?'oma_group':'ortholog_one2one'))continue;
        if(!groups.has(row[0]))groups.set(row[0],[]);
        groups.get(row[0]).push(row);
      }
      const eligible=[...groups.values()].filter(v=>v.length===1 && /^[ACDEFGHIKLMNPQRSTVWY]$/.test(v[0][3])).map(v=>v[0]);
      const exact=eligible.filter(r=>r[3]===aa).length;
      const compatible=eligible.filter(r=>'ST'.includes(aa)?'ST'.includes(r[3]):aa===r[3]).length;
      const identical=eligible.reduce((sum,r)=>sum+r[4],0),aligned=eligible.reduce((sum,r)=>sum+r[5],0);
      const n=eligible.length;
      const prefix=isOma
        ? 'OMA group · '+n+' reference species with an assessable residue in a unique global alignment of UniProt sequences. '
        : 'Ensembl Compara '+manifest.ensembl_release+' · '+n+' of '+manifest.panels[protein.division].filter(t=>t!==protein.species).length+' panel species have one assessable one-to-one ortholog. ';
      status.textContent=prefix+(n?'Exact residue '+exact+'/'+n+' · compatible acceptor '+compatible+'/'+n+' · identical aligned residues in the ±5 window '+identical+'/'+aligned+'.':'');
      for(const [species,gene,relation,residue,matched,total,coordinate] of rows){
        const tr=body.insertRow();
        for(const val of [species.replaceAll('_',' '),gene,isOma?'OMA group':relation.replace('ortholog_','').replace('one2one','1:1').replace('one2many','1:many'),residue+(coordinate||''),matched+'/'+total])tr.insertCell().textContent=val;
      }
      table.hidden=!rows.length;
      if(protein.url){source.href=protein.url;source.hidden=false;}
    }catch{if(token===revision)status.textContent='Alignment snapshot unavailable. Close and reopen to retry.';}
  }
  panel.addEventListener('toggle',render);
  return (site,sequence)=>{selected=site;reference=sequence;render();};
};
