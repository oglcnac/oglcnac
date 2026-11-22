window.OglcnacDirectoryCompare = function(panel,comparisonEvidence) {
  const chosen=new Map(), button=panel.querySelector('[data-run]'), output=panel.querySelector('[data-output]');
  const chips=panel.querySelector('[data-chosen]'),status=panel.querySelector('[role=status]');
  let revision=0, comparisonData, exportRows=[];
  const make=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const missing=new Set();
  const download=panel.querySelector('[data-export]');
  function saveSelection(){
    const url=new URL(location.href);
    url.searchParams.delete('sel');
    for(const key of [...chosen.keys(),...missing])url.searchParams.append('sel',key);
    if(url.href!==location.href)history.pushState({},'',url);
  }
  panel.querySelector('[data-share]').onclick=async()=>{
    try {await navigator.clipboard.writeText(location.href);status.textContent='Comparison link copied.';}
    catch {status.textContent=location.href;}
  };
  download.onclick=()=>{
    const rows=exportRows;
    if(!rows.length)return;
    const url=URL.createObjectURL(new Blob([OglcnacTables.rowsToText(rows[0],rows.slice(1),',')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='atlas-site-comparison.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function sync(persist=true) {
    if(persist)saveSelection();
    suggestions.replaceChildren();
    search.value='';
    search.disabled=chosen.size+missing.size>=6;
    feedback.textContent=search.disabled?'Six sites selected. Remove a site to add another.':'';
    download.hidden=true;

    revision++;output.replaceChildren();status.textContent='';
    button.disabled=chosen.size<2;chips.replaceChildren();panel.hidden=!chosen.size && !missing.size;
    const notice=panel.querySelector('[data-missing]');
    notice.replaceChildren();
    if(missing.size){
      notice.append(document.createTextNode(missing.size+' shared selections are unavailable in this release. '));
      const clear=make('button','Remove unavailable selections');
      clear.type='button';clear.onclick=()=>{missing.clear();sync();};notice.append(clear);
    }
    for(const [key,s] of chosen){
      const remove=make('button',s.id+' '+s.name+' ×');remove.type='button';
      remove.setAttribute('aria-label','Remove '+s.id+' '+s.name);remove.onclick=()=>{chosen.delete(key);sync();};
      chips.append(remove);
    }
    for(const box of document.querySelectorAll('#site-directory [data-site-key]')){
      box.checked=chosen.has(box.dataset.siteKey);box.disabled=!box.checked && chosen.size+missing.size>=6;
    }
  }
  button.onclick=async()=>{
    const current=++revision,sites=[...chosen.values()];button.disabled=true;status.textContent='Loading original evidence…';output.replaceChildren();
    try{
      const records=await OglcnacStaticData.loadAtlasRecordsForAccessions([...new Set(sites.map(s=>s.id))]);
      let context;
      try {context=await comparisonEvidence(sites);} catch {context=new Map();}
      let extended;
      try{
        comparisonData??=fetch('/static/data/atlas-comparison-context.json?v=e70c8370c6a29491').then(response=>{
          if(!response.ok)throw Error();
          return response.json();
        });
        extended=await comparisonData;
      }catch{comparisonData=null;}
      if(current!==revision)return;
      const table=document.createElement('table'),head=table.createTHead().insertRow();
      for(const field of ['Site','Source records','Publications','Unambiguous records','Reported methods','Rows with unique peptide support','Phosphorylation at residue','Nearby phosphorylation','Nearby acetylation','Nearby ubiquitination','Parent protein low-throughput OGT-PIN evidence','Observed PDB segment entries','Confirmed PDB entries','Site pLDDT','Mean pLDDT (±5)','Modeled residues in window','AlphaFold model','Peptide outcomes']) head.append(make('th',field));
      const body=table.createTBody();
      for(const s of sites){
        const rows=records.filter(r=>r.accession===s.id && Number(r.position_in_protein)===s.pos &&
          (String(r.species||'').trim().toLowerCase()||'unreported')===s.species && String(r.site_residue||'').trim().toUpperCase()===s.aa);
        const tr=body.insertRow(), link=make('a',s.id+' · '+s.name);
        link.href='/atlas/detail/?'+new URLSearchParams({id:s.id,site:s.pos,organism:s.species,residue:s.aa})+'#site-record';
        tr.insertCell().append(link);
        tr.insertCell().textContent=rows.length;
        tr.insertCell().textContent=OglcnacRecordView.publications(rows).length;
        tr.insertCell().textContent=rows.filter(r=>String(r.ambiguous).trim().toLowerCase()==='unambiguous').length;
        tr.insertCell().textContent=OglcnacRecordView.values(rows,'method').join(' · ')||'Not reported';
        const review=context.get(JSON.stringify([s.species,s.id,s.pos,s.aa]));
        const flags=review?.flags;
        tr.insertCell().textContent=flags?.[0][0]??'Unavailable';
        for(let i=1;i<=5;i++){
          const value=flags?.[i];
          tr.insertCell().textContent=value===1?'Reported':value===0?'No match in snapshot':'Unassessed';
        }
        tr.insertCell().textContent=Number.isInteger(flags?.[6])?flags[6]:'Unassessed';
        tr.insertCell().textContent=review?.pdb??'Unassessed';
        tr.insertCell().textContent=review?.score??'Unassessed';
        tr.insertCell().textContent=review?.window?.[0]??'Unassessed';
        tr.insertCell().textContent=review?.window?.[1]??'Unassessed';
        tr.insertCell().textContent=review?.model?.join(' v')??'Unassessed';
        tr.insertCell().textContent=review?.peptides.join(' · ')||'Unassessed';
      }
      const details=document.createElement('details'), extra=document.createElement('table');
      details.append(make('summary','More evidence'));
      const extraFields=['Identical ortholog residues','Ortholog species assessed','Physical partners of the protein (BioGRID)'];
      const header=extra.createTHead().insertRow();
      for(const field of ['Site',...extraFields])header.append(make('th',field));
      const extraBody=extra.createTBody();
      exportRows=[[...head.cells].map(cell=>cell.textContent).concat(extraFields)];
      sites.forEach((s,i)=>{
        const values=extended?.[JSON.stringify([s.species,s.id,s.pos,s.aa])]??[null,null,null];
        const visible=values.map(v=>v??'Unassessed');
        const tr=extraBody.insertRow();
        for(const value of [body.rows[i].cells[0].textContent,...visible])tr.insertCell().textContent=value;
        exportRows.push([...body.rows[i].cells].map(cell=>cell.textContent).concat(visible));
      });
      details.append(make('p','Compare identical residues with the number of ortholog species assessed. BioGRID partner counts apply to the protein as a whole.'),extra);
      output.append(table,details);download.hidden=false;
      status.textContent=extended?'Evidence for the selected sites, in selection order.':'Additional evidence could not load. Select Compare to retry.';
    }catch{if(current===revision)status.textContent='Evidence unavailable. Select Compare to retry.';}
    finally{if(current===revision)button.disabled=chosen.size<2;}
  };
  const search=panel.querySelector('[data-add-site]');
  const suggestions=panel.querySelector('[data-add-results]');
  const feedback=panel.querySelector('[data-add-status]');
  let directory=[];
  search.addEventListener('input',()=>{
    suggestions.replaceChildren();
    feedback.textContent='';
    const tokens=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if(!tokens.length)return;
    let displayed=0;
    for(const row of directory){
      const [species,id,pos,aa]=row;
      const key=JSON.stringify(row.slice(0,4));
      const name=/^[A-Z]$/.test(aa)?aa+pos:'Position '+pos+(aa?' (reported: '+aa+')':'');
      const genes=row[12];
      const label=[id,name,genes,species].filter(Boolean).join(' · ');
      if(chosen.has(key) || !tokens.every(token=>label.toLowerCase().includes(token)))continue;
      const add=make('button',label);
      add.type='button';
      add.onclick=()=>{
        if(chosen.size+missing.size>=6)return;
        chosen.set(key,{species,id,pos,aa,name});
        search.value='';
        sync();
        if(!search.disabled)search.focus();
        else button.focus();
      };
      suggestions.append(add);
      if(++displayed===8)break;
    }
    feedback.textContent=displayed?'Showing '+displayed+(displayed===1?' matching site.':' matching sites.'):'No matching sites available to add.';
  });
  function restore(rows,params){
    directory=rows;
    const keys=[...new Set(params.getAll('sel'))].slice(0,6);
    if(!keys.length)return;
    const available=new Map(rows.map(row=>[JSON.stringify(row.slice(0,4)),row]));
    for(const key of keys){
      const row=available.get(key);
      if(!row){missing.add(key);continue;}
      const [species,id,pos,aa]=row;
      const name=/^[A-Z]$/.test(aa)?aa+pos:'Position '+pos+(aa?' (reported: '+aa+')':'');
      chosen.set(key,{species,id,pos,aa,name});
    }
    sync(false);
    if(chosen.size>=2)button.click();
  }
  function cellRenderer(cell,s){
    const key=JSON.stringify([s.species,s.id,s.pos,s.aa]);
    const box=document.createElement('input');box.type='checkbox';box.dataset.siteKey=key;
    box.checked=chosen.has(key);box.disabled=!box.checked && chosen.size+missing.size>=6;
    box.setAttribute('aria-label','Compare '+s.id+' '+s.name);
    box.onchange=()=>{if(box.checked)chosen.set(key,s);else chosen.delete(key);sync();};
    const link=make('a',s.name);link.href=s.link;cell.append(box,' ',link);
  }
  return {cellRenderer,restore};
};
