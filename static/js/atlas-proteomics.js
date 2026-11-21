// Dataset-reported peptide evidence has a different origin from curated UniProt features.
window.OglcnacProteomics=function(panel,accession){
  const summary=panel.querySelector('p'),body=panel.querySelector('tbody');
  let site,sequence,revision=0;
  async function render(){
    const token=++revision;
    body.replaceChildren();
    if(!panel.open)return;
    if(!site?.mapped || site.mismatch){summary.textContent='Select a sequence-verified site.';return;}
    summary.textContent='Loading captured proteomics observations…';
    try{
      const record=await OglcnacStaticData.loadProteomics(accession);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sequence));
      if(token!==revision)return;
      const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(record?.sequence_sha256!==hash){summary.textContent='A compatible proteomics snapshot is unavailable.';return;}
      const rows=record.sites.filter(r=>Math.abs(r[0]-site.position)<=5);
      summary.textContent=rows.length+' dataset observations within five residues of '+site.residue+site.position+'.';
      for(const [pos,type,dataset,pmid,confidence,unique] of rows){
        const tr=body.insertRow();
        for(const value of [sequence[pos-1]+pos,type])tr.insertCell().textContent=value;
        const cell=tr.insertCell();
        if(/^PXD\d+$/.test(dataset)){
          const link=document.createElement('a');link.href='https://proteomecentral.proteomexchange.org/cgi/GetDataset?ID='+dataset;link.textContent=dataset;cell.append(link);
        }else cell.textContent=dataset||'Unreported';
        tr.insertCell().textContent=confidence||'Unreported';
        tr.insertCell().textContent=unique?'Unique':'Shared or unreported';
        const citation=tr.insertCell();
        if(/^\d+$/.test(pmid)){
          const link=document.createElement('a');link.href='https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/';link.textContent=pmid;citation.append(link);
        }else citation.textContent=pmid||'Unreported';
      }
    }catch{if(token===revision)summary.textContent='Could not load proteomics observations. Close and reopen to retry.';}
  }
  panel.addEventListener('toggle',render);
  return (value,reference)=>{site=value;sequence=reference;render();};
};
