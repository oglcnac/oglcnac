(() => {
  const root = document.getElementById('site-directory');
  const find = key => root.querySelector('[data-'+key+']');
  const species = find('species-filter'), residue = find('residue');
  const params = new URLSearchParams(location.search);
  const introduction = document.querySelector('.page-hero .page-lead');
  const recordIntro = introduction.textContent;
  let accession=params.get('accession');
  const scope=find('protein-scope');
  if(accession){
    const remove=document.createElement('button');remove.textContent='Show all proteins';remove.type='button';
    remove.onclick=()=>{accession=null;scope.hidden=true;if(rows)render();};
    scope.append(document.createTextNode('Sites on '+accession+' · '),remove);scope.hidden=false;
  }
  const recordButton = document.getElementById('browse-records'), siteButton = document.getElementById('browse-sites');
  const compare = OglcnacDirectoryCompare(document.getElementById('directory-comparison'),comparisonEvidence);
  let rows, table, context, texts, loading;
  let review, outcomes;
  const outcome=find('outcome'),band=find('band');
  const tags=['supports position','matches another position','multiple matches','residue conflict','peptide absent','peptide missing','invalid peptide or offset','reference unavailable','mixed outcomes'];
  for(const tag of tags)outcome.add(new Option(tag,tag));
  const confidence=value=>value==null?'Unavailable':value>=90?'Very high':value>=70?'Confident':value>=50?'Low':'Very low';
  const term=find('annotation-search');
  const controls = [...root.querySelectorAll('[data-context]')];
  const more = find('more');
  async function loadContext() {
    const [response,details] = await Promise.all([fetch('/static/data/site-context-v1/flags.json?v=12f26055f329a202'),OglcnacStaticData.loadReviewIndex('directory.json')]);
    if (!response.ok) throw Error();
    const data = await response.json();
    const keys = JSON.stringify(rows.map(row => row.slice(0,4)))+'\n';
    const buffer = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(keys));
    const digest = Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
    if (data.keys_sha256!==digest || data.rows.length!==rows.length) throw Error();
    if(details.keys_sha256!==digest || details.rows.length!==rows.length)throw Error();
    outcomes=details.outcomes;
    review=new Map(rows.map((row,i)=>[row,details.rows[i]]));
    texts=data.texts;
    context = data.rows;
    segmentCounts=new Map(rows.map((row,i)=>[row,context[i][6]]));
  }
  async function comparisonEvidence(sites) {
    if(!context) {
      loading ??= loadContext();
      try { await loading; } finally { loading=null; }
    }
    const wanted=new Set(sites.map(s=>JSON.stringify([s.species,s.id,s.pos,s.aa])));
    const result=new Map();
    rows.forEach((row,i)=>{
      const key=JSON.stringify(row.slice(0,4));
      if(wanted.has(key)){
        const [masks,score]=review.get(row);
        result.set(key,{flags:context[i],score,pdb:pdbCount(row).text,
          peptides:outcomes.filter((_,bit)=>masks[0] & (1<<bit))});
      }
    });
    return result;
  }
  async function enableFilters() {
    if (!rows || !more.open || context) return;
    controls.forEach(el=>el.disabled=true);
    try {
      loading ??= loadContext();
      await loading;
      controls.forEach(el=>el.disabled=false);
      find('context-status').textContent='';
      render();
    } catch {
      find('context-status').textContent='Evidence filters unavailable. Close and reopen to retry.';
    } finally { loading=null; }
  }
  more.addEventListener('toggle',enableFilters);
  const speciesName = value => value.charAt(0).toUpperCase()+value.slice(1);
  function matchesOutcome(mask){
    if(outcome.value==='mixed outcomes')return Boolean(mask & (mask-1));
    if(controls[0].checked && outcome.value!=='supports position')return false;
    return Boolean(mask & (1<<outcomes.indexOf(outcome.value)));
  }
  function render() {
    const mut=find('mut').checked, clear=find('clear').checked;
    const index = 4 + Number(mut) + 2*Number(clear);
    const search=term.value.trim().toLowerCase();
    const matches = rows.filter((row,i) => (!accession || accession===row[1]) && (!band.value || (review && confidence(review.get(row)[1])===band.value)) &&
      (!outcome.value || (review && matchesOutcome(review.get(row)[0][index-4]))) && (!search || (context && [row[1],String(row[3])+row[2],texts[context[i].at(-1)]].join(' ').toLowerCase().includes(search))) && controls.every((el,j)=>!el.checked ||
      (j===0 ? context?.[i][0][index-4]>0 : j===7 ? review?.get(row)[2]>0 && context?.[i][6]>0 : context?.[i][j]>0)) && row[index] && (!species.value || row[0] === species.value) &&
      (!residue.value || (row[3] || 'Unreported') === residue.value));
    const query = new URLSearchParams({view:'sites'});
    if(table.filterInput.value)query.set('q',table.filterInput.value);
    if(accession)query.set('accession',accession);
    if(band.value)query.set('band',band.value);
    if(outcome.value)query.set('outcome',outcome.value);
    if(search)query.set('annotation',term.value.trim());
    for(const el of controls) if(el.checked) query.set(el.dataset.context,'1');
    for(const key of new URLSearchParams(location.search).getAll('sel'))query.append('sel',key);
    if(species.value) query.set('species',species.value);
    if(residue.value) query.set('residue',residue.value);
    if(mut) query.set('mutagenesis','1');
    if(clear) query.set('unambiguous','1');
    history.replaceState({},'',location.pathname+'?'+query);
    table.setRows(matches.map(row => {
      const [organism,id,pos,aa,...counts]=row;
      const detail = new URLSearchParams({id,site:pos,organism,residue:aa});
      if(mut)detail.set('papers','mutagenesis');
      if(clear)detail.set('ambiguity','unambiguous');
      const link = '/atlas/detail/?'+detail+(mut?'#atlas-publications':'#site-record');
      const siteName=/^[A-Z]$/.test(aa)?aa+pos:'Position '+pos+(aa?' (reported: '+aa+')':'');
      return [{text:id,href:link},{text:siteName,render:cell=>compare.cellRenderer(cell,{id,pos,aa,species:organism,name:siteName,link})},speciesName(organism),counts[index-4],counts[index],{text:review?.get(row)[1]??'—',sortNumber:review?.get(row)[1]??null},pdbCount(row)];
    }),{preserveState:true});
    find('status').textContent = matches.length.toLocaleString()+(matches.length===1?' reported site entry.':' reported site entries.')+' Peptide outcomes reflect records meeting the method and assignment filters.';
  }
  function pdbCount(row){
    const missing={text:'—',sortNumber:null};
    if(!review || !context)return missing;
    const [, ,confirmed,checked]=review.get(row);
    const segments=segmentCounts.get(row);
    if(segments==='' || segments==null || !/^[STY]$/.test(row[3]))return missing;
    if(checked===Number(segments))return {text:confirmed,sortNumber:confirmed};
    return checked?{text:confirmed+'+',sortNumber:confirmed}:missing;
  }
  let segmentCounts;
  function options(select,values,initial,label) {
    select.replaceChildren(new Option(label,''));
    for(const value of [...new Set(values)].sort()) select.add(new Option(select===species?speciesName(value):value,value));
    if([...select.options].some(o=>o.value===initial)) select.value=initial;
  }
  async function show(sites) {
    root.hidden=!sites;
    introduction.textContent=sites?'Explore reported residue positions across proteins. Filter by species, residue and experimental evidence.':recordIntro;
    document.querySelector('.page-hero h1').textContent=sites?'Browse Atlas sites':'Browse Atlas by species';
    document.querySelector('.species-filter').hidden=sites;
    document.getElementById('browse-record-results').hidden=sites;
    siteButton.setAttribute('aria-pressed',String(sites));recordButton.setAttribute('aria-pressed',String(!sites));
    if(!sites){loadBrowse(species.value || params.get('species') || 'Human');return;}

    if(!table) table=OglcnacTables.create('site-directory-table',{filename:'atlas-sites.csv',mobileColumns:[0,1,2,3,4]});
    if(!rows){
      table.filterInput.value=params.get('q')||'';
      find('status').textContent='Loading the current site directory…';
      try {
        const response=await fetch('/static/data/atlas-sites-v1.json?v=5f22487a85f20ec4');
        if(!response.ok)throw Error();
        rows=await response.json();
        for(const el of controls) el.checked=params.get(el.dataset.context)==='1';
        term.value=params.get('annotation')||'';
        outcome.value=params.get('outcome')||'';band.value=params.get('band')||'';
        if(outcome.value || band.value || term.value || controls.some(el=>el.checked)) more.open=true;
        loading ??= loadContext();
        try { await loading; } catch {find('context-status').textContent='Supplementary evidence unavailable. Reopen More filters to retry.';} finally {loading=null;}
        compare.restore(rows,params);
        options(species,rows.map(r=>r[0]),params.get('species'),'All species');
        options(residue,rows.map(r=>r[3]||'Unreported'),params.get('residue'),'All residues');
        find('mut').checked=params.get('mutagenesis')==='1'; find('clear').checked=params.get('unambiguous')==='1';
      }catch{find('status').textContent='Site directory unavailable. Select Sites to retry.';return;}
    }
    if(!root.hidden)render();
  }
  let timer;
  term.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(context)render();},160);});
  root.addEventListener('change',event=>{if(event.target.closest('.record-actions')&&rows)render();});
  function syncTableSearch(){
    if(!table || root.hidden)return;
    const url=new URL(location.href);
    if(table.filterInput.value)url.searchParams.set('q',table.filterInput.value);
    else url.searchParams.delete('q');
    history.replaceState({},'',url);
  }
  root.addEventListener('input',event=>{if(event.target===table?.filterInput)syncTableSearch();});
  root.addEventListener('click',event=>{if(event.target===table?.resetButton)syncTableSearch();});
  window.addEventListener('popstate',()=>location.reload());
  siteButton.onclick=()=>show(true);recordButton.onclick=()=>show(false);
  if(params.get('view')==='sites')show(true);
})();
