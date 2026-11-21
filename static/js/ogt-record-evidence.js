window.OglcnacPinEvidence = async function(records, accession, table, makeRow) {
  const panel=document.getElementById('pin-filter'), summary=document.getElementById('pin-filter-summary');
  const view=window.OglcnacRecordView;
  const fields=[['detection_method','Detection method'],['analytic_throughput','Throughput'],['high_stringency_interactor','High stringency'],['source','Source']];
  const controls=panel.querySelector('.record-actions');
  controls.replaceChildren();
  const selectors=fields.map(([field,name])=>{
    const label=document.createElement('label'),select=document.createElement('select');
    select.setAttribute('aria-label',name);label.textContent=name+' ';select.add(new Option('All',''));
    for(const value of view.values(records,field).sort())select.add(new Option(value,value));
    if(records.some(r=>!String(r[field]??'').trim()))select.add(new Option('Not reported','__missing'));
    label.append(select);controls.append(label);return select;
  });
  function render() {
    const matches=records.filter(r=>fields.every(([field],i)=>!selectors[i].value || selectors[i].value===(String(r[field]??'').trim()||'__missing')));
    table.setRows(matches.map(makeRow),{preserveState:false});
    const papers=view.publications(matches);
    summary.textContent=matches.length+' of '+records.length+' interaction records · '+papers.length+' distinct publications';
    document.getElementById('ogt-publication-summary').textContent=papers.length+' distinct source '+(papers.length===1?'publication':'publications')+' in the matching evidence.';
    const list=document.getElementById('ogt-publication-list');list.replaceChildren();
    for(const pmid of papers){
      const rows=matches.filter(r=>view.publications([r]).includes(pmid));
      const link=document.createElement('a');link.href='https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/';link.textContent='PMID '+pmid;
      const item=document.createElement('li');item.append(link,' · '+rows.length+' '+(rows.length===1?'record':'records')+' · '+(view.values(rows,'detection_method').join(' / ')||'Method not reported'));
      const throughput=view.values(rows,'analytic_throughput').join(' / ');
      if(throughput)item.append(' · '+throughput);
      const study=document.createElement('a');study.href='/ogt-pin/search/?'+new URLSearchParams({field:'pmid',q:pmid});study.textContent='Browse interactors in this study';
      item.append(' · ',study);list.append(item);
    }
  }
  for(const select of selectors)select.onchange=render;
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset evidence filters';reset.onclick=()=>{selectors.forEach(s=>s.value='');render();};controls.append(reset);
  render();
  const atlas=document.getElementById('pin-atlas');
  atlas.hidden=true;
  try{
    const rows=await OglcnacStaticData.loadAtlasRecordsForAccessions([accession]);
    if(rows.length){
      const positions=new Set(rows.map(r=>String(r.position_in_protein??'').trim()).filter(p=>/^\d+$/.test(p)&&Number(p)>0).map(Number));
      atlas.textContent='O-GlcNAcAtlas · '+positions.size+' reported positions';
      atlas.href='/atlas/detail/?id='+encodeURIComponent(accession);atlas.hidden=false;
    }
  }catch{atlas.textContent='Look up this accession in O-GlcNAcAtlas';atlas.href='/atlas/detail/?id='+encodeURIComponent(accession);atlas.hidden=false;}
};
