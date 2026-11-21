/* Parse the current public coordinate files off the UI thread. */
importScripts('/static/vendor/molstar-cif/parser.js?v=8ac32dfd37db882b');

async function coordinateBlock(url, gzipped) {
  const response = await fetch(url, {signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw Error('Coordinate download unavailable ('+response.status+'). Try another entry.');
  const stream = gzipped ? response.body.pipeThrough(new DecompressionStream('gzip')) : response.body;
  const reader = stream.getReader(), decoder = new TextDecoder(), chunks = [];
  let bytes = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64*1024*1024) {
      await reader.cancel(); throw Error('This coordinate file exceeds the 64 MiB browser limit. Choose a smaller structure.');
    }
    chunks.push(decoder.decode(value,{stream:true}));
  }
  chunks.push(decoder.decode());
  const parsed = await AtlasCif.parseCifText(chunks.join('')).run();
  if (parsed.isError || !parsed.result.blocks[0]) throw Error('The coordinate file could not be read.');
  return parsed.result.blocks[0].categories;
}

const oxygen = {S:['SER','OG'], T:['THR','OG1'], Y:['TYR','OH']};
function fields(category, names) {
  const result = {};
  for (const name of names.split(' ')) {
    const field = category?.getField(name);
    if (!field) throw Error('The deposited coordinates lack a required mapping or atom field ('+name+').');
    result[name] = field;
  }
  return result;
}
function usable(f,i) {
  const alt = f.label_alt_id.str(i);
  return f.pdbx_PDB_model_num.int(i) === 1 && f.occupancy.float(i)>0 && ['', '.', 'A','1'].includes(alt);
}
async function mappedSites(pdb, accession, pos, residue) {
  const cif = await coordinateBlock('https://www.ebi.ac.uk/pdbe/entry-files/download/'+pdb+'_updated.cif',false);
  const atom = cif.atom_site, f = fields(atom,'pdbx_sifts_xref_db_name pdbx_sifts_xref_db_acc pdbx_sifts_xref_db_num pdbx_sifts_xref_db_res label_asym_id label_seq_id label_comp_id label_atom_id label_alt_id occupancy pdbx_PDB_model_num');
  const sites = new Map();
  for (let i=0;i<atom.rowCount;i++) {
    if (f.pdbx_sifts_xref_db_acc.str(i)!==accession || f.pdbx_sifts_xref_db_name.str(i)!=='UNP' ||
        f.pdbx_sifts_xref_db_num.str(i)!==String(pos) || f.pdbx_sifts_xref_db_res.str(i)!==residue ||
        f.label_comp_id.str(i)!==oxygen[residue][0] || f.label_atom_id.str(i)!==oxygen[residue][1] || !usable(f,i)) continue;
    sites.set(f.label_asym_id.str(i),f.label_seq_id.str(i));
  }
  return sites;
}
async function measure({pdb,accession,pos,residue}) {
  const mapped = await mappedSites(pdb,accession,pos,residue);
  if (!mapped.size) return [];
  const cif = await coordinateBlock('https://files.rcsb.org/download/'+pdb.toUpperCase()+'-assembly1.cif.gz',true);
  const poly = fields(cif.entity_poly,'entity_id type'), polymers = new Map();
  for (let i=0;i<cif.entity_poly.rowCount;i++) polymers.set(poly.entity_id.str(i),poly.type.str(i));
  const remap = fields(cif.pdbx_chain_remapping,'label_asym_id orig_label_asym_id'), chains = new Map();
  for(let i=0;i<cif.pdbx_chain_remapping.rowCount;i++) chains.set(remap.label_asym_id.str(i),remap.orig_label_asym_id.str(i));
  const atom = cif.atom_site, f = fields(atom,'label_asym_id label_seq_id label_entity_id label_comp_id label_atom_id type_symbol Cartn_x Cartn_y Cartn_z occupancy label_alt_id pdbx_PDB_model_num');
  const targets = new Map();
  for(let i=0;i<atom.rowCount;i++) {
    const chain = f.label_asym_id.str(i);
    if(mapped.get(chains.get(chain))!==f.label_seq_id.str(i) || f.label_atom_id.str(i)!==oxygen[residue][1] ||
       f.label_comp_id.str(i)!==oxygen[residue][0] || !usable(f,i)) continue;
    if (!targets.has(chain) || f.occupancy.float(i)>targets.get(chain).occupancy) {
      targets.set(chain,{chain,x:f.Cartn_x.float(i),y:f.Cartn_y.float(i),z:f.Cartn_z.float(i),occupancy:f.occupancy.float(i),distance:Infinity,partner:'',partnerAtoms:0,nucleic:false});
    }
  }
  for(let i=0;i<atom.rowCount;i++) {
    const type=polymers.get(f.label_entity_id.str(i))||'';
    const protein=type.startsWith('polypeptide'), nucleic=type.includes('ribonucleotide');
    if ((!protein && !nucleic) || !usable(f,i) || ['H','D'].includes(f.type_symbol.str(i))) continue;
    const chain=f.label_asym_id.str(i);
    const x=f.Cartn_x.float(i),y=f.Cartn_y.float(i),z=f.Cartn_z.float(i);
    for(const target of targets.values()) {
      if(chain===target.chain) continue;
      const squared=(x-target.x)**2+(y-target.y)**2+(z-target.z)**2;
      if(squared<=25)target.partnerAtoms++;
      if(protein && squared<target.distance){target.distance=squared;target.partner=chain;}
      if(nucleic && squared<=25)target.nucleic=true;
    }
  }
  return Array.from(targets.values(), t=>({chain:t.chain,partner:t.partner,partnerAtoms:t.partnerAtoms,
    distance:Number.isFinite(t.distance)?Math.sqrt(t.distance):null,nucleic:t.nucleic}));
}
onmessage=async ({data})=>{
  try {postMessage({rows:await measure(data)});}
  catch(error){postMessage({error:error.message||'Coordinates unavailable.'});}
};
