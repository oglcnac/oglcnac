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
  let rows, table, context, texts, loading, observations;
  const term=find('annotation-search');
  const controls = [...root.querySelectorAll('[data-context]')];
  const more = find('more');
  async function loadContext() {
    const [response,observed] = await Promise.all([fetch('/static/data/site-context-v1/flags.json?v=12f26055f329a202'),fetch('/static/data/site-context-v1/observed.json?v=9dd2b81a36019e09')]);
    if(!observed.ok)throw Error();
    observations=(await observed.json()).verified;
    if (!response.ok) throw Error();
    const data = await response.json();
    const keys = JSON.stringify(rows.map(row => row.slice(0,4)))+'\n';
    const buffer = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(keys));
    const digest = Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
    if (data.keys_sha256!==digest || data.rows.length!==rows.length) throw Error();
    texts=data.texts;
    context = data.rows;
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
      if(wanted.has(key)) result.set(key,context[i]);
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
  function render() {
    const mut=find('mut').checked, clear=find('clear').checked;
    const index = 4 + Number(mut) + 2*Number(clear);
    const search=term.value.trim().toLowerCase();
    const matches = rows.filter((row,i) => (!accession || accession===row[1]) && (!search || (context && [row[1],String(row[3])+row[2],texts[context[i].at(-1)]].join(' ').toLowerCase().includes(search))) && controls.every((el,j)=>!el.checked ||
      (j===0 ? context?.[i][0][index-4]>0 : j===7 ? !!observations?.[row[1]]?.[row[3]+row[2]] && context?.[i][6]>0 : context?.[i][j]>0)) && row[index] && (!species.value || row[0] === species.value) &&
      (!residue.value || (row[3] || 'Unreported') === residue.value));
    const query = new URLSearchParams({view:'sites'});
    if(table.filterInput.value)query.set('q',table.filterInput.value);
    if(accession)query.set('accession',accession);
    if(search)query.set('annotation',term.value.trim());
    for(const el of controls) if(el.checked) query.set(el.dataset.context,'1');
    for(const key of new URLSearchParams(location.search).getAll('sel'))query.append('sel',key);
    if(species.value) query.set('species',species.value);
    if(residue.value) query.set('residue',residue.value);
    if(mut) query.set('mutagenesis','1');
    if(clear) query.set('unambiguous','1');
    history.replaceState({},'',location.pathname+'?'+query);
    table.setRows(matches.map(([organism,id,pos,aa,...counts]) => {
      const detail = new URLSearchParams({id,site:pos});
      if(mut)detail.set('papers','mutagenesis');
      if(clear)detail.set('ambiguity','unambiguous');
      const link = '/atlas/detail/?'+detail+(mut?'#atlas-publications':'#atlas-landscape');
      const siteName=/^[A-Z]$/.test(aa)?aa+pos:'Position '+pos+(aa?' (reported: '+aa+')':'');
      return [{text:id,href:link},{text:siteName,render:cell=>compare.cellRenderer(cell,{id,pos,aa,species:organism,name:siteName,link})},speciesName(organism),counts[index-4]];
    }),{preserveState:true});
    find('status').textContent = matches.length.toLocaleString()+(matches.length===1?' reported site entry.':' reported site entries.')+' Filters apply to the same source record.';
  }
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

    if(!table) table=OglcnacTables.create('site-directory-table',{filename:'atlas-sites.csv',mobileColumns:[0,1,2,3]});
    if(!rows){
      table.filterInput.value=params.get('q')||'';
      find('status').textContent='Loading the current site directory…';
      try {
        const response=await fetch('/static/data/atlas-sites-v1.json?v=6c5bcf7a19b87aad');
        if(!response.ok)throw Error();
        rows=await response.json();
        for(const el of controls) el.checked=params.get(el.dataset.context)==='1';
        term.value=params.get('annotation')||'';
        if(term.value || controls.some(el=>el.checked)) more.open=true;
        await enableFilters();
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
