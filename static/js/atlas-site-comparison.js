/* Each comparison is derived from the current protein, sequence and evidence filters. */
window.OglcnacSiteComparison = {
  create(root) {
    const find = selector => root.querySelector(selector);
    const make = (tag, text) => {
      const element = document.createElement(tag);
      element.textContent = text;
      return element;
    };
    const selected = new Set();
    const pageSize = 15, limit = 4;
    let sites = [], sequence = '', page = 0, comparing = false;

    function evidenceLink(site, count, section, unambiguous = false) {
      if (!count) return make('span', '0');
      const url = new URL(location.href);
      url.searchParams.set('site', site.position);
      if (unambiguous) url.searchParams.set('ambiguity', 'unambiguous');
      url.hash = section;
      const link = make('a', count);
      link.href = url.href;
      link.setAttribute('aria-label', site.label + ', ' + count + ' ' + (unambiguous ? 'publications with unambiguous assignments' : section === 'atlas-evidence' ? 'records' : 'publications'));
      return link;
    }

    function renderComparison() {
      const output = find('[data-result]');
      output.replaceChildren();
      if (!comparing || selected.size < 2) return;
      const chosen = Array.from(selected, pos => sites.find(site => site.position === pos));
      const region = make('div', '');
      region.className = 'table-scroll';
      region.tabIndex = 0;
      region.setAttribute('role','region');
      region.setAttribute('aria-label','Selected site evidence');
      const table = document.createElement('table');
      table.append(make('caption','Selected site evidence'));
      const head = table.createTHead().insertRow();
      for (const value of ['Evidence', ...chosen.map(s => s.label)]) head.append(make('th', value));
      const body = table.createTBody();
      const fields = [
        ['Source records', s => evidenceLink(s,s.records.length,'atlas-evidence')],
        ['Distinct publications', s => evidenceLink(s,s.publications.length,'atlas-publications')],
        ['Publications with unambiguous assignments', s => evidenceLink(s,s.clear,'atlas-publications',true)],
        ['Assignment counts', s => s.assignments.unambiguous + ' unambiguous · ' + s.assignments.ambiguous + ' ambiguous · ' + s.assignments.other + ' other or unreported'],
        ['Reported methods', s => [...new Set(s.records.map(r => String(r.method || '').trim() || 'Not reported'))].join(' · ')],
        ['Reported residue', s => s.reportedResidues.join(', ') || 'Not reported'],
        ['Reference sequence (±5 residues)', s => {
          if (!s.mapped) return 'Unavailable';
          const pos = s.position - 1;
          return sequence.slice(Math.max(0,pos-5),pos) + '[' + sequence[pos] + ']' + sequence.slice(pos+1,pos+6) + (s.mismatch ? ' · reported residue differs' : '');
        }]
      ];
      for (const [name, value] of fields) {
        const row = body.insertRow();
        const heading = make('th', name); heading.scope = 'row'; row.append(heading);
        for (const site of chosen) row.insertCell().append(value(site));
      }
      region.append(table); output.append(region);
      if (region.scrollWidth > region.clientWidth) output.append(make('small','Scroll sideways to see all selected sites.'));
    }

    function actions() {
      const compare = find('[data-compare]');
      compare.disabled = selected.size < 2;
      compare.textContent = 'Compare selected sites' + (selected.size ? ' (' + selected.size + ')' : '');
      find('[data-clear]').hidden = !selected.size;
      for (const box of root.querySelectorAll('tbody input')) box.disabled = selected.size >= limit && !box.checked;
    }

    function render() {
      if (!root.open) return;
      const order = find('[data-sort]').value;
      const score = s => ({records:s.records.length, papers:s.publications.length, clear:s.clear})[order] || 0;
      const sorted = sites.slice().sort((a,b) => score(b)-score(a) || a.position-b.position);
      const pages = Math.max(1, Math.ceil(sorted.length/pageSize));
      page = Math.min(page,pages-1);
      const body = root.querySelector('.table-scroll[aria-label="Sites on this protein"] tbody');
      body.replaceChildren();
      for (const site of sorted.slice(page*pageSize,(page+1)*pageSize)) {
        const row = body.insertRow();
        const box = document.createElement('input');
        box.type = 'checkbox'; box.checked = selected.has(site.position);
        box.setAttribute('aria-label','Select ' + site.label);
        box.onchange = () => {
          if (box.checked) selected.add(site.position); else selected.delete(site.position);
          if (selected.size < 2) comparing = false;
          actions(); renderComparison();
        };
        const hitArea = document.createElement('label'); hitArea.className = 'site-select';
        hitArea.append(box); row.insertCell().append(hitArea);
        const name = make('th',site.label); name.scope = 'row'; row.append(name);
        row.insertCell().append(evidenceLink(site,site.records.length,'atlas-evidence'));
        row.insertCell().append(evidenceLink(site,site.publications.length,'atlas-publications'));
        row.insertCell().append(evidenceLink(site,site.clear,'atlas-publications',true));
      }
      find('[data-pager]').hidden = pages === 1;
      find('[data-page]').textContent = (page+1) + ' of ' + pages;
      find('[data-prev]').disabled = page === 0;
      find('[data-next]').disabled = page+1 >= pages;
      actions(); renderComparison();
    }
    find('[data-sort]').onchange = () => { page = 0; render(); };
    find('[data-prev]').onclick = () => { page--; render(); };
    find('[data-next]').onclick = () => { page++; render(); };
    find('[data-compare]').onclick = () => { comparing = true; renderComparison(); };
    find('[data-clear]').onclick = () => { selected.clear(); comparing = false; render(); };
    root.addEventListener('toggle', render);
    return { update(records, reference) {
      sequence = reference;
      const model = OglcnacProteinViewer.summarize(records, reference);
      sites = model.sites.map(s => ({...s, label:s.mapped && !s.mismatch ? s.residue+s.position : 'Position '+s.position,
        clear:OglcnacProteinViewer.publications(s.records.filter(r => String(r.ambiguous).trim().toLowerCase() === 'unambiguous')).length}));
      const available = new Set(sites.map(s => s.position));
      for (const pos of selected) if (!available.has(pos)) selected.delete(pos);
      if (selected.size < 2) comparing = false;
      find('[data-count]').textContent = '· ' + sites.length;
      find('[data-note]').textContent = (sites.length ? 'Select up to four positions to compare their evidence. Counts follow the evidence filters.' : 'No numeric positions in the matching records.') +
        (model.unplaced ? ' Records without a numeric position: '+model.unplaced+'.' : '');
      page = 0; render();
    }};
  }
};
