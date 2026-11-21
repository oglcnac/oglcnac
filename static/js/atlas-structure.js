/* Atlas positions use UniProt numbering. Mol* label_seq_id is local to the model. */
window.OglcnacStructure = (() => {
  const assets = '/static/vendor/pdbe-molstar/';
  const amino = Object.fromEntries('ALA:A ARG:R ASN:N ASP:D CYS:C GLU:E GLN:Q GLY:G HIS:H ILE:I LEU:L LYS:K MET:M PHE:F PRO:P SER:S THR:T TRP:W TYR:Y VAL:V SEC:U'.split(' ').map(pair => pair.split(':')));
  let library;
  function loadLibrary() {
    if (!library) library = Promise.all([
      ['link', 'pdbe-molstar-light.css'], ['script', 'pdbe-molstar-plugin.js']
    ].map(([tag, file]) => new Promise((resolve, reject) => {
      const el = document.createElement(tag);
      if (tag === 'link') { el.rel = 'stylesheet'; el.href = assets + file; }
      else el.src = assets + file;
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error('The structure viewer could not be loaded.')); };
      document.head.append(el);
    }))).catch(error => { library = null; throw error; });
    return library;
  }

  function create(root, accession) {
    const button = root.querySelector('[data-load]'), canvas = root.querySelector('[data-canvas]');
    const status = root.querySelector('[data-status]'), source = root.querySelector('[data-source]');
    let sequence = '', selection = {}, viewer, entry, ready = false, revision = 0;
    let queue = Promise.resolve();
    const controls = root.querySelector('[data-camera-controls]');
    const focus = controls.querySelector('[data-focus]');
    let anchor, label, overview = true;
    function wholeProtein() {
      const structure = viewer.plugin.managers.structure.hierarchy.current.structures[0].cell.obj.data;
      const camera = viewer.plugin.canvas3d.camera;
      const {origin, dirA, dirB, dirC} = structure.constructor.getPrincipalAxes(structure).boxAxes;
      const screen = canvas.querySelector('canvas').getBoundingClientRect();
      if (!screen.width || !screen.height) return;
      const wide = screen.width >= screen.height;
      const up = wide ? dirB : dirA;
      const horizontal = wide ? dirA : dirB;
      const length = v => Math.hypot(...v);
      if (!(length(dirC) > 0 && length(up) > 0)) {
        viewer.visual.reset({camera:true});
        return;
      }
      // Fit the projected oriented box. Reserve space for the controls along either edge.
      const halfHeight = Math.max(length(up) / 0.85, length(horizontal) * screen.height / (screen.width * 0.80));
      const distance = halfHeight / Math.tan(camera.state.fov / 2);
      camera.setState({mode:'orthographic', target:origin, up:up.map(x => x / length(up)),
        position:origin.map((x,i) => x + dirC[i] * distance / length(dirC)),
        radius:structure.boundary.sphere.radius * 1.5}, 0);
      camera.update();
      viewer.plugin.canvas3d.requestDraw();
      overview = true;
    }
    function placeLabel() {
      if (!label || !anchor) return;
      const camera = viewer.plugin.canvas3d.camera;
      const point = camera.project([], anchor);
      const x = point[0] / camera.viewport.width;
      const y = 1 - point[1] / camera.viewport.height;
      label.hidden = x < 0 || x > 1 || y < 0 || y > 1 || point[2] < 0 || point[2] > 1;
      label.style.left = 'clamp(4px,' + (100*x) + '%,calc(100% - 88px))';
      label.style.top = 'clamp(4px,' + (100*y) + '%,calc(100% - 24px))';
    }
    controls.querySelector('[data-overview]').onclick = wholeProtein;
    focus.onclick = () => {
      if (!anchor) return;
      overview = false;
      viewer.plugin.managers.camera.focusSphere({center:anchor,radius:16},{extraRadius:0,durationMs:0});
    };
    function refresh() {
      const current = ++revision;
      queue = queue.then(async () => {
        if (!ready || current !== revision) return;
        const { position, site } = selection;
        anchor = null; focus.disabled = true; label.hidden = true;
        await viewer.visual.clearSelection();
        if (!position) { status.textContent = 'Select a site on the protein map to inspect its local confidence.'; return; }
        const local = position - entry.start + 1;
        const model = viewer.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj.data.models[0];
        const h = model?.atomicHierarchy;
        let atom;
        for (let i = 0; i < (h?.residues._rowCount || 0); i++) {
          if (h.residues.label_seq_id.value(i) === local) { atom = h.residueAtomSegments.offsets[i]; break; }
        }
        if (atom === undefined || site?.mismatch || amino[h.atoms.label_comp_id.value(atom)] !== sequence[position - 1]) {
          status.textContent = 'Position ' + position + ' could not be mapped confidently to this model.'; return;
        }
        const score = model.atomicConformation.B_iso_or_equiv.value(atom);
        await viewer.visual.select({data:[{label_seq_id:local, color:{r:190,g:34,b:104}, sideChain:true}]});
        if (current !== revision) return;
        const coordinates = model.atomicConformation;
        anchor = [coordinates.x[atom],coordinates.y[atom],coordinates.z[atom]];
        label.textContent = sequence[position - 1] + position;
        focus.disabled = false; placeLabel();
        status.textContent = sequence[position - 1] + position + ' · pLDDT ' + score.toFixed(2) + ' / 100 · ' +
          (score >= 90 ? 'Very high' : score >= 70 ? 'Confident' : score >= 50 ? 'Low' : 'Very low') + ' local confidence';
      }).catch(() => { status.textContent = 'The viewer could not display the selected site.'; });
    }
    button.onclick = async () => {
      button.disabled = true;
      status.textContent = 'Looking up the AlphaFold model…';
      try {
        const res = await fetch('https://alphafold.ebi.ac.uk/api/prediction/' + encodeURIComponent(accession), {signal:AbortSignal.timeout(20000)});
        if (res.status === 404) throw new Error('AlphaFold DB has no model for this accession.');
        if (!res.ok) throw new Error('AlphaFold DB could not be reached.');
        const entries = (await res.json()).filter(e => e.uniprotAccession === accession && e.bcifUrl?.startsWith('https://alphafold.ebi.ac.uk/files/'));
        if (!entries.length) throw new Error('No AlphaFold model matches this exact accession.');
        const verified = entries.map(e => ({...e, start:Number(e.uniprotStart), end:Number(e.uniprotEnd)}))
          .filter(e => e.start >= 1 && e.end <= sequence.length && e.end >= e.start && sequence.slice(e.start-1,e.end) === e.sequence);
        entry = verified.find(e => selection.position >= e.start && selection.position <= e.end) || verified[0];
        if (!entry) throw new Error('The model sequence could not be verified against the Atlas sequence.');
        source.href = 'https://alphafold.ebi.ac.uk/entry/' + encodeURIComponent(accession);
        source.hidden = false;
        await loadLibrary();
        let coordinates;
        const urls = [entry.bcifUrl];
        if (/^AF-[A-Z0-9-]+-F[0-9]+$/.test(entry.entryId)) {
          urls.push('https://models.rcsb.org/AF_' + entry.entryId.replaceAll('-', '') + '.bcif');
        }
        for (const url of urls) {
          try {
            const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
            if (response.ok) { coordinates = await response.blob(); break; }
          } catch { /* Try the public mirror when the primary download fails. */ }
        }
        if (!coordinates) throw new Error('The coordinates could not be downloaded. Try again or open AlphaFold DB.');
        const modelUrl = URL.createObjectURL(coordinates);
        canvas.style.visibility = 'hidden'; canvas.hidden = false;
        viewer = new PDBeMolstarPlugin();
        status.textContent = 'Loading predicted coordinates…';
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => finish(false), 60000);
          const sub = viewer.events.loadComplete.subscribe(finish);
          function finish(ok) {
            clearTimeout(timer); sub.unsubscribe();
            if (ok) resolve(); else reject(new Error('The 3D model could not be displayed. Check WebGL or open AlphaFold DB.'));
          }
          Promise.resolve(viewer.render(canvas,{customData:{url:modelUrl,format:'cif',binary:true},alphafoldView:true,hideControls:true,sequencePanel:false,pdbeLink:false,loadingOverlay:false,bgColor:{r:255,g:255,b:255}})).catch(() => finish(false));
        }).finally(() => URL.revokeObjectURL(modelUrl));
        const hierarchy = viewer.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj.data.models[0]?.atomicHierarchy;
        const residues = hierarchy?.residues;
        if (residues?._rowCount !== entry.sequence.length) throw new Error('The loaded coordinates have different sequence coverage.');
        for (let i = 0; i < residues._rowCount; i++) {
          const symbol = amino[hierarchy.atoms.label_comp_id.value(hierarchy.residueAtomSegments.offsets[i])];
          if (residues.label_seq_id.value(i) !== i + 1 || symbol !== entry.sequence[i]) {
            throw new Error('The loaded coordinates differ from the Atlas sequence.');
          }
        }
        viewer.plugin.canvas3d.setProps({camera:{manualReset:true}});
        const surface = canvas.querySelector('canvas');
        label = document.createElement('span');
        label.hidden = true;
        label.style.cssText = 'position:absolute;z-index:2;pointer-events:none;background:#801849;color:white;padding:1px 5px;border-radius:3px;font:600 12px/18px system-ui';
        surface.parentElement.append(label);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        wholeProtein();
        viewer.plugin.canvas3d.didDraw.subscribe(placeLabel);
        surface.addEventListener('pointerdown', () => { overview = false; });
        surface.addEventListener('wheel', () => { overview = false; }, {passive:true});
        const size = new ResizeObserver(() => { if (overview) wholeProtein(); });
        size.observe(surface);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        canvas.style.visibility = ''; controls.hidden = false;
        ready = true; button.hidden = true; root.querySelector('[data-legend]').hidden = false; refresh();
      } catch (error) {
        viewer?.plugin?.dispose(); viewer = null; canvas.replaceChildren(); canvas.hidden = true;
        status.textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'The model request failed. Check your connection and try again.' : error.message;
        button.disabled = false; button.textContent = 'Retry 3D structure';
      }
    };
    return {
      select(value) { selection = value; refresh(); },
      setSequence(value) {
        sequence = value; button.disabled = !sequence;
        if (!sequence) status.textContent = 'A protein sequence is required to verify structure coordinates.';
      },
      evidence({position, records}) {
        const unambiguous = records.filter(row => String(row.ambiguous).toLowerCase().trim() === 'unambiguous');
        root.querySelector('[data-evidence]').textContent = position
          ? 'Position ' + position + ' · ' + records.length + ' matching records across ' + OglcnacAtlasEvidence.pmids(records).length +
            ' publications. Unambiguous assignments: ' + unambiguous.length + ' records across ' + OglcnacAtlasEvidence.pmids(unambiguous).length + ' publications.'
          : '';
      }
    };
  }
  return {create};
})();
