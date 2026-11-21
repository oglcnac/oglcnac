(() => {
  const panel=document.querySelector('#protein-text-search');
  const form=panel.querySelector('form'), input=form.elements.namedItem('text');
  const list=panel.querySelector('ol'), status=panel.querySelector('[role=status]'), more=panel.querySelector('[data-more]');
  let matches=[],offset=0,query='',generation=0;
  function append(){
    const end=Math.min(matches.length,offset+15);
    for(;offset<end;offset++){
      const [acc,section,passage,start]=matches[offset], li=document.createElement('li');
      const a=document.createElement('a');a.href='/atlas/detail/?'+new URLSearchParams({id:acc})+'#atlas-'+section;
      a.textContent=acc+' · '+section;
      const first=Math.max(0,start-55),last=Math.min(passage.length,start+query.length+95),mark=document.createElement('mark');
      mark.textContent=passage.slice(start,start+query.length);
      li.append(a,' — '+(first?'…':'')+passage.slice(first,start),mark,passage.slice(start+query.length,last)+(last<passage.length?'…':''));list.append(li);
    }
    more.hidden=offset>=matches.length;
  }
  async function search(push=false){
    const current=++generation;
    query=input.value.trim();list.replaceChildren();more.hidden=true;
    const url=new URL(location.href);
    if(query)url.searchParams.set('text',query);else url.searchParams.delete('text');
    if(push && url.href!==location.href)history.pushState({},'',url);
    if(!query){status.textContent='Enter a word or phrase.';return;}
    status.textContent='Searching protein records…';
    try{
      const index=await OglcnacStaticData.loadReviewIndex('text.json');
      if(current!==generation)return;
      const needle=query.toLowerCase(),hits=new Map();
      index.passages.forEach(([section,text],i)=>{
        const start=text.toLowerCase().indexOf(needle);
        if(start>=0)hits.set(i,[section,text,start]);
      });
      matches=[];
      for(const [acc,ids] of Object.entries(index.proteins)){
        const id=ids.find(i=>hits.has(i));
        if(id!==undefined)matches.push([acc,...hits.get(id)]);
        else if(acc.toLowerCase().includes(needle))matches.push([acc,'overview',acc,acc.toLowerCase().indexOf(needle)]);
      }
      offset=0;append();status.textContent=matches.length.toLocaleString()+' matching protein records.';
    }catch{if(current===generation)status.textContent='Search index unavailable. Submit again to retry.';}
  }
  more.onclick=append;form.onsubmit=e=>{e.preventDefault();search(true);};
  window.addEventListener('popstate',()=>{
    input.value=new URLSearchParams(location.search).get('text')||'';
    if(input.value)panel.open=true;
    search();
  });
  input.value=new URLSearchParams(location.search).get('text')||'';
  if(input.value){panel.open=true;search();}
})();
