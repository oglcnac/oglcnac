window.OglcnacSiteRecord = function(root, accession, records) {
  const find = key => root.querySelector('[data-'+key+']');
  const identity = find('identity'), status = find('status'), body = find('body');
  let position, revision = 0, comparison, settle, selected, source, protein;
  const link = row => '/atlas/detail/?'+new URLSearchParams({id:accession,site:row.position,organism:row.species,residue:row.residue})+'#site-record';
  const node = (tag,text) => Object.assign(document.createElement(tag),{textContent:text});
  function stop() {
    revision++;
    settle?.({error:'Stopped'});settle=null;
    comparison?.terminate(); comparison=null;
    find('stop').hidden=true;
    find('compare').disabled=false;
  }
  function render() {
    stop();
    const matching=protein.filter(row=>row.position===position);
    const row=matching[identity.selectedIndex];
    selected=null; body.hidden=!row;
    if(!row){status.textContent=matching.length?'This site identity is absent from the release. Choose an available record.':'No record for this position in the release.';return;}
    const original=records().filter(r=>Object.hasOwn(row.peptide_outcomes,r.id));
    selected={accession,...row,source,records:original,
      sequence_reference:'https://www.uniprot.org/uniprotkb/'+encodeURIComponent(accession)+'/entry',
      model_provenance_index:new URL('/static/data/site-context-v1/confidence-sources.json?v=d84b120b5a38dfad'+source.confidence_sources_sha256,location.origin).href,
      model_source:row.model?
      'https://www.alphafold.ebi.ac.uk/files/'+row.model[1]+'-confidence_v'+row.model[2]+'.json':null,url:new URL(link(row),location.origin).href};
    status.textContent=row.species+' · '+original.length+' records · '+row.pmids.length+(row.pmids.length===1?' distinct PMID':' distinct PMIDs');
    const format=w=>w?w[0]+' at '+position+' · '+w[2]+' ('+w[1]+'–'+(w[1]+w[2].length-1)+')':'Unavailable';
    find('atlas').textContent=format(row.atlas_window);
    find('uniprot').textContent=format(row.uniprot_window);
    const both=row.atlas_window && row.uniprot_window;
    find('agreement').textContent=both?('Residue '+(row.atlas_window[0]===row.uniprot_window[0]?'agrees':'differs')+' · ±5 window '+(JSON.stringify(row.atlas_window)===JSON.stringify(row.uniprot_window)?'agrees':'differs')):'Agreement unavailable';
    const numbering=row.coordinate_translations||[];
    find('numbering-label').hidden=find('numbering').hidden=!numbering.length;
    find('numbering').replaceChildren(...numbering.map(item=>{
      const line=node('div','');
      const pairs=item.pairs.map(([canonical,iso])=>item.canonical+' '+row.residue+canonical+' ↔ '+item.isoform+' '+row.residue+iso);
      line.textContent=item.status==='mapped'?pairs.join(' · '):pairs.length?
        'Source numbering unresolved. Possible coordinates: '+pairs.join(' or '):
        item.isoform+' · Unresolved: no verified unchanged residue correspondence.';
      return line;
    }));
    const counts=new Map();
    for(const outcome of Object.values(row.peptide_outcomes))counts.set(outcome,(counts.get(outcome)||0)+1);
    find('peptides').textContent=[...counts].map(([k,v])=>k+' ('+v+')').join(' · ');
    find('confidence').textContent=row.model?row.model[0]+' pLDDT at site · '+row.plddt_window[0]+' mean across '+row.plddt_window[1]+' modeled residues (±5) · '+row.model[1]+' v'+row.model[2]:row.atlas_window?.[0]===row.residue?'No sequence-matched model confidence for this position.':'Reported residue could not be verified on the Atlas sequence.';
    const neighbors=protein.filter(other=>other.species===row.species && other.position!==position)
      .sort((a,b)=>Math.abs(a.position-position)-Math.abs(b.position-position)||a.position-b.position||a.residue.localeCompare(b.residue)).slice(0,10);
    find('neighbors').replaceChildren(...neighbors.map(other=>{
      const delta=other.position-position, a=node('a',(other.residue||'Position ')+other.position);
      a.href=link(other);
      const li=node('li','');li.append(a,' · '+(delta>0?'+':'')+delta+' residues · '+other.pmids.length+(other.pmids.length===1?' PMID':' PMIDs'));return li;
    }));
    find('neighbors-status').textContent=neighbors.length?'Closest reported positions on this protein in '+row.species+'.':'No other reported position for this protein and species.';
    find('compare').hidden=!Object.keys(row.pdb_entries).length;
    find('contacts').replaceChildren();
    const candidates=row.segment_candidates, confirmed=Object.keys(row.pdb_entries).length;
    find('progress').textContent=candidates==null || !/^[STY]$/.test(row.residue)?'Structure coverage unassessed for this site.':
      confirmed+' confirmed PDB entries · '+row.checked_candidates+' of '+candidates+' candidate entries checked.';
    const limits=find('limits'), reasons=[];
    if(numbering.some(item=>item.status==='unresolved')){
      const a=node('a','Review the unresolved isoform coordinates.');a.className='catalog-entry-link';a.href='#site-numbering';reasons.push(a);
    }
    if(!row.atlas_window || row.atlas_window[0]!==row.residue)reasons.push('The reported residue could not be verified on the Atlas sequence.');
    if(!counts.has('supports position'))reasons.push('No checked peptide uniquely supports this position.');
    else if(counts.size>1)reasons.push('Peptide records give different outcomes at this position.');
    if(!row.model)reasons.push('Site confidence is unavailable from a sequence-matched AlphaFold model.');
    if(candidates==null || !/^[STY]$/.test(row.residue))reasons.push('Experimental structure coverage is unassessed.');
    else if(candidates>row.checked_candidates)reasons.push('Some candidate PDB entries still need residue-level verification.');
    limits.hidden=!reasons.length;
    limits.querySelector('ul').replaceChildren(...reasons.map(reason=>{const li=node('li','');li.append(reason);return li;}));
    find('permalink').href=link(row);
  }
  async function load(){
    stop(); selected=null;body.hidden=true;identity.hidden=true;
    if(!root.open)return;
    if(!position){status.textContent='Select a reported position on the protein map.';return;}
    const current=revision;status.textContent='Loading site record…';
    try{
      const data=await OglcnacStaticData.loadSiteReview(accession);
      if(current!==revision)return;
      protein=data.rows;source=data.source;
      const rows=protein.filter(row=>row.position===position);
      identity.replaceChildren(...rows.map((row,i)=>new Option(row.species+' · '+(row.residue||'Position ')+position,i)));
      const query=new URLSearchParams(location.search);
      const exact=rows.findIndex(r=>query.get('organism')===r.species && query.get('residue')===r.residue);
      const exactRequested=query.has('organism') && query.has('residue') && Number(query.get('site'))===position;
      if(exactRequested)identity.selectedIndex=exact;
      else if(rows.some(r=>r.residue))identity.selectedIndex=rows.findIndex(r=>r.residue);
      identity.hidden=rows.length<=1 && !(exactRequested && exact<0);render();
    }catch{if(current===revision)status.textContent='Site record unavailable. Close and reopen to retry.';}
  }
  identity.onchange=()=>{
    render();
    if(selected){
      const url=new URL(location.href);
      url.searchParams.set('organism',selected.species);url.searchParams.set('residue',selected.residue);
      history.replaceState({},'',url);
    }
  };
  find('download').onclick=()=>{
    if(!selected)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}));
    const a=node('a','');a.href=url;a.download=accession+'-'+position+'-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  find('stop').onclick=()=>{stop();find('progress').textContent+=' · Comparison stopped.';};
  find('compare').onclick=async()=>{
    stop();const current=revision;
    const row=selected,ids=Object.keys(row.pdb_entries).sort(),list=find('contacts');
    list.replaceChildren();find('compare').disabled=true;find('stop').hidden=false;
    let highest=-1,leaders=[],measured=0,closest=null;
    let worker;
    try { worker=new Worker('/static/js/atlas-contact-worker.js?v=48d97d1eef773fef'); }
    catch {stop();find('progress').textContent='Coordinate reader unavailable in this browser.';return;}
    comparison=worker;
    for(const [i,pdb] of ids.entries()){
      find('progress').textContent='Checking '+pdb.toUpperCase()+' · '+(i+1)+' of '+ids.length;
      const data=await new Promise(resolve=>{
        settle=resolve;worker.onmessage=e=>resolve(e.data);worker.onerror=()=>resolve({error:'Coordinate reader failed'});
        worker.postMessage({pdb,accession,pos:position,residue:row.residue});
      });
      if(current!==revision)return;
      settle=null;
      const best=[...(data.rows||[])].sort((a,b)=>b.partnerAtoms-a.partnerAtoms || (a.nearest??Infinity)-(b.nearest??Infinity))[0];
      if(best){
        measured++;if(best.partnerAtoms>highest){highest=best.partnerAtoms;leaders=[];}
        if(best.partnerAtoms===highest)leaders.push(pdb.toUpperCase());
        for(const chain of data.rows){
          if(chain.nearest!=null && (!closest || chain.nearest<closest.distance))
            closest={entry:pdb.toUpperCase(),chain:chain.chain,distance:chain.nearest};
        }
      }
      const item=node('li',''),entryLink=node('a',pdb.toUpperCase());
      entryLink.href='https://www.rcsb.org/structure/'+pdb.toUpperCase();
      item.append(entryLink,' · '+(best?'Chain '+best.chain+' · '+best.partnerAtoms+' partner atoms within 5 Å ('+(best.contactTypes?.join(', ')||'none')+') · '+(best.nearest==null?'no other polymer observed':best.partnerType+' chain '+best.nearestChain+' at '+best.nearest.toFixed(2)+' Å'):data.error||'Side-chain oxygen unavailable'));list.append(item);
    }
    const lead=highest>0?' Highest measured contact count: '+highest+' ('+leaders.slice(0,4).join(', ')+(leaders.length>4?' and '+(leaders.length-4)+' more':'')+').':
      highest===0?' No measured side chain had a partner atom within 5 Å.':'';
    const nearest=closest?' Closest measured partner: '+closest.distance.toFixed(2)+' Å from chain '+closest.chain+' in '+closest.entry+'.':'';
    find('progress').textContent=measured+' of '+ids.length+' confirmed entries measured.'+lead+nearest;
    stop();
  };
  root.ontoggle=load;
  if(location.hash==='#site-record')root.open=true;
  return value=>{position=Number(value);load();};
};
