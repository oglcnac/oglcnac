(() => {
  const root = document.getElementById('site-directory');
  const find = key => root.querySelector('[data-'+key+']');
  const species = find('species-filter'), residue = find('residue');
  const params = new URLSearchParams(location.search);
  const introduction = document.querySelector('.page-hero .page-lead');
  const recordIntro = introduction.textContent;
  const recordButton = document.getElementById('browse-records'), siteButton = document.getElementById('browse-sites');
  let rows, table;
  const speciesName = value => value.charAt(0).toUpperCase()+value.slice(1);
  function render() {
    const mut=find('mut').checked, clear=find('clear').checked;
    const index = 4 + Number(mut) + 2*Number(clear);
    const matches = rows.filter(row => row[index] && (!species.value || row[0] === species.value) &&
      (!residue.value || (row[3] || 'Unreported') === residue.value));
    const query = new URLSearchParams({view:'sites'});
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
      return [{text:id,href:link},{text:siteName,href:link},speciesName(organism),counts[index-4]];
    }),{preserveState:false});
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
    history.replaceState({},'',location.pathname+'?view=sites');
    if(!table) table=OglcnacTables.create('site-directory-table',{filename:'atlas-sites.csv',mobileColumns:[0,1,2,3]});
    if(!rows){
      find('status').textContent='Loading the current site directory…';
      try {
        const response=await fetch('/static/data/atlas-sites-v1.json?v=6c5bcf7a19b87aad');
        if(!response.ok)throw Error();
        rows=await response.json();
        options(species,rows.map(r=>r[0]),params.get('species'),'All species');
        options(residue,rows.map(r=>r[3]||'Unreported'),params.get('residue'),'All residues');
        find('mut').checked=params.get('mutagenesis')==='1'; find('clear').checked=params.get('unambiguous')==='1';
      }catch{find('status').textContent='Site directory unavailable. Select Sites to retry.';return;}
    }
    if(!root.hidden)render();
  }
  root.addEventListener('change',event=>{if(event.target.closest('.record-actions')&&rows)render();});
  siteButton.onclick=()=>show(true);recordButton.onclick=()=>show(false);
  if(params.get('view')==='sites')show(true);
})();
