/* La Forge — constructeur de sorts */
(() => {
  const M = Matrice;
  const $ = (id) => document.getElementById(id);
  let R = M.reglages();

  // --- Chargement du sort --------------------------------------------------
  const params = new URLSearchParams(location.search);
  let sort = null;
  if (params.get('id')) sort = M.grimoire().find((s) => s.id === params.get('id')) || null;
  if (!sort && params.get('exemple')) {
    const ex = EXEMPLES.find((s) => s.id === params.get('exemple'));
    if (ex) { sort = structuredClone(ex); sort.id = M.nouveauSort().id; }
  }
  if (!sort) sort = M.store.get('matrice.brouillon', null) || M.nouveauSort();
  sort = { ...M.nouveauSort(), ...structuredClone(sort) };
  sort.modificateurs = { ...M.nouveauSort().modificateurs, ...sort.modificateurs };
  sort.lanceur = { ...M.nouveauSort().lanceur, ...sort.lanceur };
  if (params.size) history.replaceState(null, '', location.pathname);

  const remplirSelect = (el, obj, cle = 'nom') => {
    el.innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${echapper(typeof v === 'string' ? v : v[cle])}</option>`).join('');
  };

  // --- Identité ----------------------------------------------------------------
  $('ecoles').innerHTML = [...new Set(Object.values(M.EFFETS).flatMap((e) => e.ecole.split(' / ')))]
    .map((e) => `<option value="${echapper(e)}">`).join('');
  for (const id of ['nom', 'ecole', 'description']) {
    $(id).value = sort[id] || '';
    $(id).addEventListener('input', () => { sort[id] = $(id).value; maj(); });
  }

  // --- Composantes ---------------------------------------------------------------
  $('ajout').innerHTML = Object.entries(M.EFFETS)
    .map(([k, e]) => `<button type="button" data-type="${k}">+ ${echapper(e.nom)}</button>`).join('');
  $('ajout').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-type]');
    if (!b) return;
    const def = M.EFFETS[b.dataset.type];
    sort.composantes.push({ type: b.dataset.type, params: Object.fromEntries(def.params.map((p) => [p.id, p.def])) });
    rendreComposantes();
    maj();
  });

  const NATURE = { rigoureux: 'physique réelle', mixte: 'physique + inspiration', inspire: 'loi inventée' };

  function champHTML(prm, valeur, i) {
    const id = `c${i}-${prm.id}`;
    if (prm.type === 'select') {
      const o = Object.entries(prm.options).map(([k, t]) => `<option value="${k}"${String(valeur) === k ? ' selected' : ''}>${echapper(t)}</option>`).join('');
      return `<div class="champ"><label for="${id}">${echapper(prm.label)}</label><select id="${id}" data-i="${i}" data-p="${prm.id}">${o}</select></div>`;
    }
    const attrs = `type="number" ${prm.min !== undefined ? `min="${prm.min}"` : ''} step="${prm.step ?? 1}"`;
    const input = `<input id="${id}" ${attrs} value="${echapper(valeur)}" data-i="${i}" data-p="${prm.id}">`;
    return `<div class="champ"><label for="${id}">${echapper(prm.label)}</label>${prm.unite ? `<div class="avec-unite">${input}<span class="unite">${echapper(prm.unite)}</span></div>` : input}</div>`;
  }

  function rendreComposantes() {
    const zone = $('composantes');
    if (!sort.composantes.length) {
      zone.innerHTML = '<div class="vide" style="margin-bottom:1rem">Aucune composante. Choisis un premier effet ci-dessous.</div>';
    } else {
      zone.innerHTML = sort.composantes.map((c, i) => {
        const def = M.EFFETS[c.type];
        if (!def) return '';
        return `<div class="compo">
          <div class="compo-tete">
            <div><h3>${echapper(def.nom)} <span class="pastille ${def.nature}">${NATURE[def.nature]}</span></h3></div>
            <div style="display:flex;gap:.6rem;align-items:center">
              <span class="compo-energie" id="e-${i}"></span>
              <button class="bouton petit danger" type="button" data-suppr="${i}" aria-label="Retirer ${echapper(def.nom)}">✕</button>
            </div>
          </div>
          <p class="compo-desc">${echapper(def.description)}</p>
          <div class="formule">${echapper(def.formule)}</div>
          <div class="champs">${def.params.map((p) => champHTML(p, c.params?.[p.id] ?? p.def, i)).join('')}</div>
        </div>`;
      }).join('');
    }
    const n = sort.composantes.length;
    $('nb-compo').textContent = n > 1 ? `${n} composantes · complexité ×${M.formatNombre(1 + R.complexite * (n - 1), 2)}` : '';
  }

  $('composantes').addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset.p) return;
    const c = sort.composantes[Number(el.dataset.i)];
    c.params[el.dataset.p] = el.tagName === 'SELECT' ? el.value : (el.value === '' ? 0 : Number(el.value));
    maj();
  });
  $('composantes').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-suppr]');
    if (!b) return;
    sort.composantes.splice(Number(b.dataset.suppr), 1);
    rendreComposantes();
    maj();
  });

  // --- Tissage & lanceur -----------------------------------------------------------
  remplirSelect($('precision'), Object.fromEntries(Object.entries(M.PRECISION).map(([k, v]) => [k, `${v.nom} (×${M.formatNombre(v.f, 2)})`])));
  remplirSelect($('incantation'), Object.fromEntries(Object.entries(M.INCANTATION).map(([k, v]) => [k, `${v.nom} (×${M.formatNombre(v.f, 2)})`])));
  remplirSelect($('focalisateur'), Object.fromEntries(Object.entries(M.FOCALISATEUR).map(([k, v]) => [k, `${v.nom} (×${M.formatNombre(v.f, 2)})`])));

  for (const id of ['portee', 'cibles', 'precision', 'incantation', 'focalisateur']) {
    $(id).value = sort.modificateurs[id];
    $(id).addEventListener('input', () => {
      sort.modificateurs[id] = $(id).type === 'number' ? Number($(id).value) : $(id).value;
      maj();
    });
  }

  function rendreNiveaux() {
    remplirSelect($('niveau'), Object.fromEntries(Object.entries(R.niveaux).map(([k, v]) => [k, `${v.nom} — rendement ${Math.round(v.rendement * 100)} %`])));
    $('niveau').value = R.niveaux[sort.lanceur.niveau] ? sort.lanceur.niveau : 'adepte';
    sort.lanceur.niveau = $('niveau').value;
    $('reserve').placeholder = R.niveaux[sort.lanceur.niveau].reserve;
    $('reserve').value = sort.lanceur.reserve ?? '';
    const n = R.niveaux[sort.lanceur.niveau];
    $('aide-niveau').textContent = `Un ${n.nom.toLowerCase()} ne transmet que ${Math.round(n.rendement * 100)} % de l'énergie qu'il puise. Réserve par défaut : ${n.reserve} Éther (laisser vide pour l'utiliser).`;
  }
  $('niveau').addEventListener('input', () => { sort.lanceur.niveau = $('niveau').value; rendreNiveaux(); maj(); });
  $('reserve').addEventListener('input', () => { sort.lanceur.reserve = $('reserve').value === '' ? null : Number($('reserve').value); maj(); });

  // --- Réglages de table -------------------------------------------------------------
  function rendreReglages() {
    $('r-base').value = R.base;
    $('r-portee').value = R.porteeRef;
    $('r-complexite').value = R.complexite;
    $('r-niveaux').innerHTML = Object.entries(R.niveaux).map(([k, n]) => `
      <div class="champ"><label for="rr-${k}">${echapper(n.nom)} — rendement</label><div class="avec-unite"><input id="rr-${k}" type="number" min="1" max="100" step="1" value="${Math.round(n.rendement * 100)}" data-niv="${k}" data-champ="rendement"><span class="unite">%</span></div></div>
      <div class="champ"><label for="rv-${k}">${echapper(n.nom)} — réserve</label><input id="rv-${k}" type="number" min="1" step="1" value="${n.reserve}" data-niv="${k}" data-champ="reserve"></div>`).join('');
  }
  function sauverReglages() { M.store.set('matrice.reglages', R); rendreNiveaux(); rendreComposantes(); maj(); }
  $('r-base').addEventListener('input', () => { const v = Number($('r-base').value); if (v > 1) { R.base = v; sauverReglages(); } });
  $('r-portee').addEventListener('input', () => { const v = Number($('r-portee').value); if (v > 0) { R.porteeRef = v; sauverReglages(); } });
  $('r-complexite').addEventListener('input', () => { const v = Number($('r-complexite').value); if (v >= 0) { R.complexite = v; sauverReglages(); } });
  $('r-niveaux').addEventListener('input', (ev) => {
    const el = ev.target, v = Number(el.value);
    if (!el.dataset.niv || !(v > 0)) return;
    R.niveaux[el.dataset.niv][el.dataset.champ] = el.dataset.champ === 'rendement' ? Math.min(v, 100) / 100 : v;
    sauverReglages();
  });
  $('r-reset').addEventListener('click', () => {
    R = structuredClone(M.REGLAGES_DEFAUT);
    M.store.set('matrice.reglages', R);
    rendreReglages(); rendreNiveaux(); rendreComposantes(); maj();
    notifier('Réglages par défaut rétablis.');
  });

  // --- Résultat ------------------------------------------------------------------------
  const COULEURS = { sur: 'var(--sur)', modere: 'var(--modere)', eleve: 'var(--eleve)', critique: 'var(--critique)', nul: 'var(--ligne-forte)' };
  let dernier = null;

  function maj() {
    const r = M.evaluer(sort, R);
    dernier = r;
    r.details.forEach((d, i) => { const el = $(`e-${i}`); if (el) el.textContent = M.formatEnergie(d.energie); });

    $('res-ether').textContent = M.formatNombre(r.ether);
    $('res-cercle').textContent = r.ether ? r.cercle : '—';
    $('res-reserve').textContent = `réserve ${r.reserve}`;
    const jauge = $('res-jauge');
    jauge.style.width = `${Math.min(100, r.ratio * 100)}%`;
    jauge.style.backgroundColor = COULEURS[r.risque.niv];
    $('res-risque').className = `risque ${r.risque.niv}`;
    $('res-risque').textContent = sort.composantes.length ? r.risque.txt : 'Ajoute une composante pour commencer.';

    const f = r.facteurs, x = (v) => `×${M.formatNombre(v, v < 10 ? 2 : 1)}`;
    const lignes = [
      ['Énergie des effets', M.formatEnergie(r.eEffet)],
      [`Portée (${sort.modificateurs.portee || 0} m)`, x(f.portee)],
      f.cibles > 1 ? [`Cibles`, x(f.cibles)] : null,
      ['Précision', x(f.precision)],
      f.complexite > 1 ? ['Complexité', x(f.complexite)] : null,
      ['Incantation', x(f.incantation)],
      f.focalisateur < 1 ? ['Focalisateur', x(f.focalisateur)] : null,
      ['Énergie tissée', M.formatEnergie(r.eTissee)],
      [`Rendement (${Math.round(r.rendement * 100)} %)`, `÷${M.formatNombre(r.rendement, 2)}`],
    ].filter(Boolean);
    $('res-decompte').innerHTML = lignes.map(([a, b]) => `<tr><td>${echapper(a)}</td><td>${echapper(b)}</td></tr>`).join('')
      + `<tr class="total"><td>Énergie puisée</td><td>${M.formatEnergie(r.ePuisee)}</td></tr>`;
    $('res-comparaison').textContent = r.ePuisee > 0 ? `${r.comparaison} · ${M.formatNombre(r.kcal, r.kcal < 10 ? 1 : 0)} kcal` : '';

    M.store.set('matrice.brouillon', sort);
  }

  // --- Actions -------------------------------------------------------------------------
  function fiche() {
    const r = dernier;
    const lignes = [
      `✦ ${sort.nom || 'Sort sans nom'}${sort.ecole ? ` — ${sort.ecole}` : ''}`,
      `${r.cercle} · ${r.ether} Éther (lanceur ${R.niveaux[sort.lanceur.niveau].nom.toLowerCase()}, réserve ${r.reserve})`,
      `Portée : ${sort.modificateurs.portee ? sort.modificateurs.portee + ' m' : 'contact'} · Cibles : ${sort.modificateurs.cibles} · Incantation : ${M.INCANTATION[sort.modificateurs.incantation].nom}`,
      '',
      ...sort.composantes.map((c, i) => {
        const def = M.EFFETS[c.type];
        const p = def.params.map((prm) => {
          const v = c.params[prm.id];
          return `${prm.label.toLowerCase()} ${prm.type === 'select' ? prm.options[v] : v + (prm.unite ? ' ' + prm.unite : '')}`;
        }).join(', ');
        return `• ${def.nom} : ${p} → ${M.formatEnergie(r.details[i].energie)}`;
      }),
      '',
      sort.description || '',
      `Énergie puisée : ${M.formatEnergie(r.ePuisee)} (${r.comparaison})`,
      `Risque : ${r.risque.txt}`,
    ];
    return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  $('b-enregistrer').addEventListener('click', () => {
    if (!sort.composantes.length) return notifier('Ajoute au moins une composante avant d\'enregistrer.');
    if (!sort.nom.trim()) { $('nom').focus(); return notifier('Donne un nom à ton sort.'); }
    notifier(M.enregistrer(sort) ? `« ${sort.nom} » est inscrit au grimoire.` : 'Impossible d\'enregistrer : le stockage du navigateur est indisponible.');
  });
  $('b-copier').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(fiche()); notifier('Fiche copiée dans le presse-papiers.'); }
    catch { telecharger(`${sort.nom || 'sort'}.txt`, fiche(), 'text/plain'); notifier('Fiche téléchargée.'); }
  });
  $('b-exporter').addEventListener('click', () => {
    telecharger(`${(sort.nom || 'sort').replace(/[^\p{L}\p{N}-]+/gu, '_')}.json`, JSON.stringify(sort, null, 2));
  });
  $('b-nouveau').addEventListener('click', () => {
    if (sort.composantes.length && !confirm('Commencer un nouveau sort ? Le sort en cours non enregistré sera perdu.')) return;
    sort = M.nouveauSort();
    for (const id of ['nom', 'ecole', 'description']) $(id).value = '';
    for (const id of ['portee', 'cibles', 'precision', 'incantation', 'focalisateur']) $(id).value = sort.modificateurs[id];
    rendreNiveaux(); rendreComposantes(); maj();
  });

  rendreReglages();
  rendreNiveaux();
  rendreComposantes();
  maj();
})();
