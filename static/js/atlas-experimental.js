window.OglcnacExperimental = (() => {
  const make=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  async function interaction(panel,accession) {
    panel.hidden=true;
    try {
      const response=await fetch('/static/data/atlas-interactors-v1.json?v=6c57b9ac7312ed57');
      if(!response.ok)throw Error();
      const index=await response.json();
      if(!Object.hasOwn(index,accession))return;
      const [records,papers,methods]=index[accession];
      panel.querySelector('summary').textContent='OGT interaction evidence · '+papers+(papers===1?' publication':' publications');
      panel.querySelector('p').textContent=records+' OGT-PIN records for this protein. Detection methods: '+(methods.join(' · ')||'not reported')+'.';
      panel.querySelector('a').href='/ogt-pin/detail/?id='+encodeURIComponent(accession);
      panel.hidden=false;
    } catch {
      panel.querySelector('summary').textContent='OGT interaction evidence';
      panel.querySelector('p').textContent='The interaction index could not be loaded.';
      panel.querySelector('a').href='/ogt-pin/detail/?id='+encodeURIComponent(accession);
      panel.hidden=false;
    }
  }
  function create(panel,accession) {
    const get=s=>panel.querySelector(s);
    const find=get('[data-find]'), measure=get('[data-measure]'), entries=get('[data-entries]');
    const select=get('select'),status=get('[data-status]'),out=get('[data-output]');
    let site, signature, worker, revision=0, request, sequence='', verifiedSequence='';
    const cancel=()=>{worker?.terminate();worker=null;request?.abort();request=null;};
    function choose(value,reference) {
      const next=[value?.position,value?.residue,value?.mapped,value?.mismatch].join('|');
      if(next===signature && sequence===reference)return;
      sequence=reference;
      signature=next;site=value;revision++;cancel();
      find.disabled=!site?.mapped || site.mismatch || !['S','T','Y'].includes(site.residue);
      entries.hidden=true;measure.hidden=true;measure.disabled=false;out.replaceChildren();
      status.textContent=find.disabled?'Select a sequence-verified serine, threonine or tyrosine site.':'Ready to check '+site.residue+site.position+' in experimental structures.';
    }
    find.onclick=async()=>{
      const current=++revision;cancel();request=new AbortController();
      find.disabled=true;entries.hidden=true;measure.hidden=true;measure.disabled=false;out.replaceChildren();
      status.textContent='Finding structures with a mapped segment at this position…';
      try {
        const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
        if(verifiedSequence!==sequence){
          const fasta=await fetch('https://rest.uniprot.org/uniprotkb/'+encodeURIComponent(accession)+'.fasta',{signal});
          if(!fasta.ok)throw Error();
          const text=await fasta.text();
          if(current!==revision)return;
          if(text.split(/\r?\n/,1)[0].split('|')[1]!==accession || OglcnacProteinViewer.sequenceFromFasta(text)!==sequence){
            status.textContent='The current UniProt reference differs from the Atlas sequence. Structure mapping is unavailable for this version.';
            return;
          }
          verifiedSequence=sequence;
        }
        const res=await fetch('https://www.ebi.ac.uk/pdbe/api/mappings/best_structures/'+encodeURIComponent(accession),
          {signal});
        if(!res.ok && res.status!==404)throw Error();
        const data=res.ok?await res.json():{};
        if(current!==revision)return;
        const candidates=(data[accession]||[]).filter(r=>site.position>=r.unp_start && site.position<=r.unp_end && /^(?:[a-z0-9]{4}|pdb_[a-z0-9]{8})$/i.test(r.pdb_id));
        const ids=new Set();select.replaceChildren();
        for(const row of candidates) {
          const id=row.pdb_id.toLowerCase();if(ids.has(id))continue;
          ids.add(id);select.add(new Option([id.toUpperCase(),row.experimental_method,row.resolution?row.resolution+' Å':''].filter(Boolean).join(' · '),id));
        }
        entries.hidden=measure.hidden=!ids.size;
        status.textContent=ids.size?ids.size+' candidate PDB entries. Choose one to verify the residue and measure its contacts.':'No PDB segment covering this site was returned for the exact accession.';
      }catch{if(current===revision)status.textContent='Structure lookup unavailable. Try Find structures again.';}
      finally{if(current===revision)find.disabled=false;}
    };
    select.onchange=()=>{revision++;cancel();out.replaceChildren();measure.disabled=false;status.textContent='Ready to check '+select.value.toUpperCase()+'.';};
    measure.onclick=()=>{
      cancel();const current=++revision,pdb=select.value;
      out.replaceChildren();measure.disabled=true;status.textContent='Checking residue-level SIFTS mapping and assembly 1 coordinates…';
      const finish=message=>{
        if(current!==revision)return;
        cancel();measure.disabled=false;status.textContent=message;
      };
      try {
        worker=new Worker('/static/js/atlas-contact-worker.js?v=48d97d1eef773fef');
        worker.onerror=()=>finish('The coordinate reader could not run. Try again.');
        worker.onmessage=({data})=>{
          if(current!==revision)return;
          if(data.error){finish(data.error);return;}
          const link=make('a','Open '+pdb.toUpperCase()+' in RCSB PDB');link.href='https://www.rcsb.org/structure/'+pdb.toUpperCase();out.append(link);
          if(!data.rows.length){finish('No matching, observed side-chain oxygen was verified in this assembly.');return;}
          const list=make('ul','');
          for(const r of data.rows){
            const distance=r.distance===null?'No other protein chain observed':'Closest other protein chain '+r.partner+' at '+r.distance.toFixed(2)+' Å ('+(r.distance<=5?'within':'outside')+' 5 Å)';
            list.append(make('li','Chain '+r.chain+' · '+distance+' · Other polymer heavy atoms within 5 Å: '+r.partnerAtoms+' · DNA/RNA within 5 Å: '+(r.nucleic?'yes':'no')));
          }
          out.append(list);
          finish(site.residue+site.position+' · '+pdb.toUpperCase()+' · biological assembly 1. Distances are from the side-chain oxygen to observed heavy atoms on other polymer chains, including symmetry copies and chains from any species. Model 1, positive occupancy and primary alternate coordinates.');
        };
        worker.postMessage({pdb,accession,pos:site.position,residue:site.residue});
      }catch{finish('The coordinate reader is unavailable in this browser.');}
    };
    return {select:choose};
  }
  return {create,interaction};
})();
