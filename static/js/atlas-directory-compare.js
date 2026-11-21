window.OglcnacDirectoryCompare = function(panel) {
  const chosen=new Map(), button=panel.querySelector('[data-run]'), output=panel.querySelector('[data-output]');
  const chips=panel.querySelector('[data-chosen]'),status=panel.querySelector('[role=status]');
  let revision=0;
  const make=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  function sync() {
    revision++;output.replaceChildren();status.textContent='';
    button.disabled=chosen.size<2;chips.replaceChildren();panel.hidden=!chosen.size;
    for(const [key,s] of chosen){
      const remove=make('button',s.id+' '+s.name+' ×');remove.type='button';
      remove.setAttribute('aria-label','Remove '+s.id+' '+s.name);remove.onclick=()=>{chosen.delete(key);sync();};
      chips.append(remove);
    }
    for(const box of document.querySelectorAll('#site-directory-table [data-site-key]')){
      box.checked=chosen.has(box.dataset.siteKey);box.disabled=!box.checked && chosen.size>=6;
    }
  }
  button.onclick=async()=>{
    const current=++revision,sites=[...chosen.values()];button.disabled=true;status.textContent='Loading original evidence…';output.replaceChildren();
    try{
      const records=await OglcnacStaticData.loadAtlasRecordsForAccessions([...new Set(sites.map(s=>s.id))]);
      if(current!==revision)return;
      const table=document.createElement('table'),head=table.createTHead().insertRow();
      for(const field of ['Site','Source records','Publications','Unambiguous records','Reported methods']) head.append(make('th',field));
      const body=table.createTBody();
      for(const s of sites){
        const rows=records.filter(r=>r.accession===s.id && Number(r.position_in_protein)===s.pos &&
          (String(r.species||'').trim().toLowerCase()||'unreported')===s.species && String(r.site_residue||'').trim().toUpperCase()===s.aa);
        const tr=body.insertRow(), link=make('a',s.id+' · '+s.name);
        link.href='/atlas/detail/?'+new URLSearchParams({id:s.id,site:s.pos})+'#atlas-landscape';
        tr.insertCell().append(link);
        tr.insertCell().textContent=rows.length;
        tr.insertCell().textContent=OglcnacRecordView.publications(rows).length;
        tr.insertCell().textContent=rows.filter(r=>String(r.ambiguous).trim().toLowerCase()==='unambiguous').length;
        tr.insertCell().textContent=OglcnacRecordView.values(rows,'method').join(' · ')||'Not reported';
      }
      output.append(table);status.textContent='Complete evidence for the selected sites, in selection order.';
    }catch{if(current===revision)status.textContent='Evidence unavailable. Select Compare to retry.';}
    finally{if(current===revision)button.disabled=chosen.size<2;}
  };
  return function(cell,s){
    const key=JSON.stringify([s.species,s.id,s.pos,s.aa]);
    const box=document.createElement('input');box.type='checkbox';box.dataset.siteKey=key;
    box.checked=chosen.has(key);box.disabled=!box.checked && chosen.size>=6;
    box.setAttribute('aria-label','Compare '+s.id+' '+s.name);
    box.onchange=()=>{if(box.checked)chosen.set(key,s);else chosen.delete(key);sync();};
    const link=make('a',s.name);link.href=s.link;cell.append(box,' ',link);
  };
};
