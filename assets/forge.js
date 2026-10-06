/* La Forge — éditeur de blueprints */
(() => {
  const M = Matrice, B = Blueprint;
  const $ = (id) => document.getElementById(id);
  let R = M.reglages();
  let insertion = null; // index où insérer le prochain bloc (palette ouverte)
  let dernier = null;

  // --- Chargement ------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  let sort = null;
  if (params.get('id')) sort = M.grimoire().find((s) => s.id === params.get('id')) || null;
  if (!sort && params.get('exemple')) {
    const ex = EXEMPLES.find((s) => s.id === params.get('exemple'));
    if (ex) { sort = structuredClone(ex); sort.id = M.nouveauSort().id; }
  }
  if (!sort) sort = M.store.get('matrice.brouillon', null) || M.nouveauSort();
  sort = B.normaliser(sort);
  if ([...params.keys()].length) history.replaceState(null, '', location.pathname);

  // --- Identité ----------------------------------------------------------------
  const ecoles = new Set(['Pyromancie', 'Cryomancie', 'Kinésie', 'Abjuration', 'Géomancie', 'Hydromancie', 'Lumen', 'Biomancie', 'Électromancie', 'Psychomancie', 'Transmutation', 'Translocation', 'Genèse']);
  $('ecoles').innerHTML = [...ecoles].map((e) => `<option value="${echapper(e)}">`).join('');
  for (const id of ['nom', 'ecole', 'description']) {
    $(id).value = sort[id] || '';
    $(id).addEventListener('input', () => { sort[id] = $(id).value; maj(); });
  }

  // --- Plan (blocs) -----------------------------------------------------------------
  const NATURE = { rigoureux: 'physique réelle', mixte: 'physique + inspiration', inspire: 'loi inventée' };

  const cleChoix = (bloc, prm) => (bloc.type === 'effet' && prm.id !== 'effet' ? `${bloc.params?.effet || 'lumiere'}.${prm.id}` : `${bloc.type}.${prm.id}`);

  function champHTML(prm, valeur, i, bloc) {
    const id = `b${i}-${prm.id}`;
    if (prm.type === 'select') {
      const large = Object.keys(prm.options).length > 6 ? ' champ-large' : '';
      return `<div class="champ${large}"><label for="${id}">${echapper(prm.label)}</label>${
        Choix.boutonHTML({ id, cle: cleChoix(bloc, prm), prm, valeur, data: `data-i="${i}" data-p="${prm.id}"` })}</div>`;
    }
    const input = `<input id="${id}" type="number" ${prm.min !== undefined ? `min="${prm.min}"` : ''} step="${prm.step ?? 1}" value="${echapper(valeur)}" data-i="${i}" data-p="${prm.id}">`;
    return `<div class="champ"><label for="${id}">${echapper(prm.label)}</label>${prm.unite ? `<div class="avec-unite">${input}<span class="unite">${echapper(prm.unite)}</span></div>` : input}</div>`;
  }

  function noeudHTML(bloc, i, n) {
    const def = B.BLOCS[bloc.type];
    if (!def) return '';
    const vals = B.valeurs(bloc);
    const champs = B.parametres(bloc).filter((p) => !p.si || p.si(vals)).map((p) => champHTML(p, bloc.params?.[p.id] ?? p.def, i, bloc)).join('');
    const sousEffet = bloc.type === 'effet' ? M.EFFETS[vals.effet] : null;
    const formule = sousEffet ? sousEffet.formule : def.formule;
    return `<article class="noeud" id="n-${i}" style="--c:${def.couleur}">
      <div class="noeud-tete">
        <h3><span class="num">${String(i + 1).padStart(2, '0')}</span>${echapper(def.nom)}<span class="pastille ${def.nature}">${NATURE[def.nature]}</span></h3>
        <div class="noeud-outils">
          <button type="button" data-act="haut" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">▲</button>
          <button type="button" data-act="bas" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">▼</button>
          <button type="button" data-act="suppr" data-i="${i}" aria-label="Retirer">✕</button>
        </div>
      </div>
      <p class="noeud-desc">${echapper(sousEffet ? sousEffet.description : def.description)}</p>
      ${formule ? `<div class="formule">${echapper(formule)}</div>` : ''}
      ${champs ? `<div class="champs">${champs}</div>` : ''}
      <div class="etat" id="etat-${i}"></div>
      <ul class="alertes" id="al-${i}"></ul>
    </article>`;
  }

  function paletteHTML(index) {
    const n = sort.blocs.length;
    const titre = n === 0 ? 'Commence par un bloc (l\'Ancrage est le point de départ) :' : index >= n ? 'Ajouter un bloc à la fin :' : `Insérer un bloc en position ${index + 1} :`;
    const groupes = Object.entries(B.FAMILLES).map(([fam, nomFam]) => {
      const blocs = Object.entries(B.BLOCS).filter(([, d]) => d.fam === fam);
      if (!blocs.length) return '';
      return `<div class="palette-famille"><h4>${echapper(nomFam)}</h4><div class="palette-grille">${
        blocs.map(([k, d]) => `<button type="button" data-ajout="${k}" style="--c:${d.couleur}" title="${echapper(d.description)}">${echapper(d.nom)}<small>${echapper(d.ecole)}</small></button>`).join('')
      }</div></div>`;
    }).join('');
    return `<div class="palette" id="palette"><div class="palette-tete"><p>${titre}</p><input type="search" id="palette-filtre" placeholder="Filtrer les blocs…" aria-label="Filtrer les blocs"></div>${groupes}</div>`;
  }

  function rendrePlan() {
    const n = sort.blocs.length;
    let html = '';
    if (n === 0) html = paletteHTML(0);
    sort.blocs.forEach((b, i) => {
      html += noeudHTML(b, i, n);
      const fin = i === n - 1;
      html += `<div class="lien"><span class="dt" id="dt-${i}"></span><button type="button" data-ins="${i + 1}" class="${insertion === i + 1 ? 'actif' : ''}" aria-label="${fin ? 'Ajouter un bloc' : 'Insérer un bloc ici'}">${insertion === i + 1 ? '×' : '+'}</button></div>`;
      if (insertion === i + 1) html += paletteHTML(i + 1) + (fin ? '' : '<div class="lien"></div>');
    });
    $('plan').innerHTML = html;
  }

  function choisir(i, pId, valeur) {
    const bloc = sort.blocs[i];
    if (!bloc) return;
    bloc.params[pId] = valeur;
    if (bloc.type === 'effet' && pId === 'effet') {
      bloc.params = { effet: valeur };
      for (const prm of B.parametres(bloc)) bloc.params[prm.id] ??= prm.def;
    }
    rendrePlan();
    maj();
    document.getElementById(`b${i}-${pId}`)?.focus({ preventScroll: true });
  }

  $('plan').addEventListener('click', (ev) => {
    const cb = ev.target.closest('.choix-bouton');
    if (cb) {
      const i = Number(cb.dataset.i), pId = cb.dataset.p, bloc = sort.blocs[i];
      const prm = B.parametres(bloc).find((x) => x.id === pId);
      if (prm) Choix.ouvrir(cb, prm, bloc.params?.[pId] ?? prm.def, (k) => choisir(i, pId, k));
      return;
    }
    const ins = ev.target.closest('[data-ins]');
    if (ins) { const k = Number(ins.dataset.ins); insertion = insertion === k ? null : k; rendrePlan(); maj(); return; }
    const aj = ev.target.closest('[data-ajout]');
    if (aj) {
      const idx = insertion ?? sort.blocs.length;
      sort.blocs.splice(idx, 0, B.nouveauBloc(aj.dataset.ajout));
      insertion = null;
      rendrePlan(); maj();
      document.getElementById(`n-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const act = ev.target.closest('[data-act]');
    if (act) {
      const i = Number(act.dataset.i);
      if (act.dataset.act === 'suppr') sort.blocs.splice(i, 1);
      if (act.dataset.act === 'haut' && i > 0) [sort.blocs[i - 1], sort.blocs[i]] = [sort.blocs[i], sort.blocs[i - 1]];
      if (act.dataset.act === 'bas' && i < sort.blocs.length - 1) [sort.blocs[i + 1], sort.blocs[i]] = [sort.blocs[i], sort.blocs[i + 1]];
      insertion = null;
      rendrePlan(); maj();
    }
  });

  $('plan').addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'palette-filtre') {
      const q = el.value.trim().toLowerCase();
      document.querySelectorAll('#palette [data-ajout]').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q) && !(b.title || '').toLowerCase().includes(q); });
      document.querySelectorAll('#palette .palette-famille').forEach((f) => { f.hidden = ![...f.querySelectorAll('[data-ajout]')].some((b) => !b.hidden); });
      return;
    }
    if (!el.dataset.p) return;
    const bloc = sort.blocs[Number(el.dataset.i)];
    if (el.tagName === 'SELECT') {
      bloc.params[el.dataset.p] = el.value;
      if (bloc.type === 'effet' && el.dataset.p === 'effet') {
        bloc.params = { effet: el.value };
        for (const prm of B.parametres(bloc)) bloc.params[prm.id] ??= prm.def;
      }
      rendrePlan();
      document.getElementById(el.id)?.focus();
    } else {
      bloc.params[el.dataset.p] = el.value === '' ? 0 : Number(el.value);
    }
    maj();
  });

  // --- Lanceur -----------------------------------------------------------------------
  const remplir = (el, obj) => { el.innerHTML = Object.entries(obj).map(([k, t]) => `<option value="${k}">${echapper(t)}</option>`).join(''); };
  remplir($('focalisateur'), Object.fromEntries(Object.entries(M.FOCALISATEUR).map(([k, v]) => [k, `${v.nom} (×${M.formatNombre(v.f, 2)})`])));
  $('focalisateur').value = sort.lanceur.focalisateur;
  $('focalisateur').addEventListener('input', () => { sort.lanceur.focalisateur = $('focalisateur').value; maj(); });

  function rendreNiveaux() {
    remplir($('niveau'), Object.fromEntries(Object.entries(R.niveaux).map(([k, v]) => [k, `${v.nom} — rendement ${Math.round(v.rendement * 100)} %`])));
    if (!R.niveaux[sort.lanceur.niveau]) sort.lanceur.niveau = 'adepte';
    $('niveau').value = sort.lanceur.niveau;
    $('reserve').placeholder = `${R.niveaux[sort.lanceur.niveau].reserve} (défaut)`;
    $('reserve').value = sort.lanceur.reserve ?? '';
  }
  $('niveau').addEventListener('input', () => { sort.lanceur.niveau = $('niveau').value; rendreNiveaux(); maj(); });
  $('reserve').addEventListener('input', () => { sort.lanceur.reserve = $('reserve').value === '' ? null : Number($('reserve').value); maj(); });

  // --- Réglages de table --------------------------------------------------------------
  function rendreReglages() {
    $('r-base').value = R.base;
    $('r-portee').value = R.porteeRef;
    $('r-mental').value = R.dureeMentale ?? 1;
    $('r-niveaux').innerHTML = Object.entries(R.niveaux).map(([k, n]) => `
      <div class="champ"><label for="rr-${k}">${echapper(n.nom)} — rendement</label><div class="avec-unite"><input id="rr-${k}" type="number" min="1" max="100" step="1" value="${Math.round(n.rendement * 100)}" data-niv="${k}" data-champ="rendement"><span class="unite">%</span></div></div>
      <div class="champ"><label for="rv-${k}">${echapper(n.nom)} — réserve</label><input id="rv-${k}" type="number" min="1" step="1" value="${n.reserve}" data-niv="${k}" data-champ="reserve"></div>`).join('');
  }
  const sauverReglages = () => { M.store.set('matrice.reglages', R); rendreNiveaux(); maj(); };
  $('r-base').addEventListener('input', () => { const v = Number($('r-base').value); if (v > 1) { R.base = v; sauverReglages(); } });
  $('r-portee').addEventListener('input', () => { const v = Number($('r-portee').value); if (v > 0) { R.porteeRef = v; sauverReglages(); } });
  $('r-mental').addEventListener('input', () => { const v = Number($('r-mental').value); if (v >= 0 && $('r-mental').value !== '') { R.dureeMentale = v; sauverReglages(); } });
  $('r-niveaux').addEventListener('input', (ev) => {
    const el = ev.target, v = Number(el.value);
    if (!el.dataset.niv || !(v > 0)) return;
    R.niveaux[el.dataset.niv][el.dataset.champ] = el.dataset.champ === 'rendement' ? Math.min(v, 100) / 100 : v;
    sauverReglages();
  });
  $('r-reset').addEventListener('click', () => {
    R = structuredClone(M.REGLAGES_DEFAUT);
    M.store.set('matrice.reglages', R);
    rendreReglages(); rendreNiveaux(); maj();
    notifier('Réglages par défaut rétablis.');
  });

  // --- Mise à jour du résultat ----------------------------------------------------------
  const COULEURS = { sur: 'var(--sur)', modere: 'var(--modere)', eleve: 'var(--eleve)', critique: 'var(--critique)', nul: 'var(--ligne-forte)' };
  const fmtT = (T) => `${M.formatNombre(T, 0)} °C`;
  const fmtS = (s) => s < 60 ? `${M.formatNombre(s, s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;

  function maj() {
    const r = B.simuler(sort, R);
    dernier = r;

    r.etapes.forEach((et, i) => {
      const s = et.etat, z = $(`etat-${i}`);
      if (!z) return;
      const puces = [`<span class="puce e">+${M.formatEnergie(et.energie)}</span>`, `<span class="puce">t = ${fmtS(s.t)}</span>`];
      if (s.matiere) {
        const ecart = s.T - B.AMBIANTE;
        puces.push(`<span class="puce ${ecart > 30 ? 'chaud' : ecart < -15 ? 'froid' : ''}">${fmtT(s.T)}</span>`);
        puces.push(`<span class="puce">${echapper(M.MATERIAUX[s.matiere.type].nom)} ${M.formatNombre(s.matiere.masse, s.matiere.masse < 1 ? 3 : 1)} kg</span>`);
      }
      if (s.matiere && s.matiere.phase && s.matiere.phase !== 'solide' && !['air', 'eau', 'vapeur', 'huile'].includes(s.matiere.type)) puces.push(`<span class="puce chaud">${s.matiere.phase}</span>`);
      if (s.pression > 1.05) puces.push(`<span class="puce">${M.formatNombre(s.pression, 0)} atm</span>`);
      if (s.forme && s.forme !== 'sphere') puces.push(`<span class="puce">${echapper(B.FORMES[s.forme].nom.toLowerCase())}</span>`);
      if (s.fragments > 1) puces.push(`<span class="puce">×${s.fragments} fragments</span>`);
      if (s.charge > 0 && !s.libere) puces.push(`<span class="puce chaud">⚡ ${M.formatEnergie(s.charge)}</span>`);
      if (s.protection && !s.lance) puces.push(`<span class="puce ok">protégé ±${s.protection} °C</span>`);
      if (s.protElec && !s.lance) puces.push(`<span class="puce ok">isolé ${M.formatEnergie(s.protElec)}</span>`);
      if (s.bouclier && !s.lance) puces.push(`<span class="puce ok">bouclier ${M.formatEnergie(s.bouclier)}</span>`);
      if (s.vise) puces.push('<span class="puce ok">cible verrouillée</span>');
      if (s.guide && !s.libere) puces.push('<span class="puce ok">guidé</span>');
      if (s.cache && !s.libere) puces.push('<span class="puce ok">invisible</span>');
      if (s.lumiere && !s.libere) puces.push(`<span class="puce">lumineux</span>`);
      if (s.piege && !s.libere) puces.push('<span class="puce">en attente</span>');
      if (s.confine && !s.libere) puces.push('<span class="puce ok">confiné</span>');
      if (s.lance && !s.libere) puces.push(`<span class="puce">en vol · ${s.v} m/s</span>`);
      if (s.libere) puces.push('<span class="puce">libéré</span>');
      z.innerHTML = puces.join('');
      $(`al-${i}`).innerHTML = et.alertes.map((a) => `<li class="${a.niv}">${echapper(a.txt)}</li>`).join('');
      $(`n-${i}`).classList.toggle('danger', et.alertes.some((a) => a.niv === 'danger'));
      const dt = $(`dt-${i}`);
      if (dt) dt.textContent = et.duree > 0 ? `${fmtS(et.duree)}` : '';
    });

    const n = sort.blocs.length;
    $('resume-blocs').textContent = n ? `${n} bloc${n > 1 ? 's' : ''} · durée ${fmtS(r.duree)}` : '';

    $('res-ether').textContent = M.formatNombre(r.ether);
    $('res-cercle').textContent = r.ether ? r.cercle : '—';
    $('res-reserve').textContent = `réserve ${r.reserve}`;
    $('res-jauge').style.width = `${Math.min(100, r.ratio * 100)}%`;
    $('res-jauge').style.backgroundColor = COULEURS[r.risque.niv];
    $('res-risque').className = `risque ${r.risque.niv}`;
    $('res-risque').textContent = r.risque.txt;
    $('res-charge').textContent = n ? fmtS(r.tempsCharge) : '—';
    $('res-puisee').textContent = M.formatEnergie(r.ePuisee);
    $('res-entretien').textContent = M.formatEnergie(r.eEntretien * r.focal / r.rendement);
    $('res-livree').textContent = r.livraison ? M.formatEnergie(r.livraison.total) : '—';
    $('res-comparaison').textContent = r.livraison && r.livraison.total > 0
      ? `À l'impact : ${comparer(r.livraison.total)}.`
      : r.ePuisee > 0 ? `Le lanceur puise ${comparer(r.ePuisee)}.` : '';

    const nd = r.alertes.filter((a) => a.niv === 'danger').length, na = r.alertes.filter((a) => a.niv === 'attention').length;
    const ba = $('res-alertes');
    if (!n) { ba.className = 'bilan-alertes'; ba.textContent = ''; }
    else if (nd + na === 0) { ba.className = 'bilan-alertes ok'; ba.textContent = '✓ Blueprint cohérent : aucun danger détecté.'; }
    else { ba.className = 'bilan-alertes ko'; ba.textContent = `${nd ? `⚠ ${nd} danger${nd > 1 ? 's' : ''}` : ''}${nd && na ? ' · ' : ''}${na ? `${na} point${na > 1 ? 's' : ''} d'attention` : ''} — voir les blocs signalés.`; }

    dessinerCourbe(r);
    M.store.set('matrice.brouillon', sort);
  }

  function comparer(e) {
    let ref = M.ECHELLE[0];
    for (const x of M.ECHELLE) if (x.e <= e) ref = x;
    const k = e / ref.e;
    return `≈ ${M.formatNombre(k, k < 10 ? 1 : 0)} × ${ref.txt}`;
  }

  function dessinerCourbe(r) {
    const W = 340, H = 170, g = 34, d = 10, h = 8, b = 22;
    const pts = r.courbe;
    if (!pts.length || r.duree <= 0 || !r.etapes.some((e) => e.etat.matiere)) {
      $('courbe').innerHTML = '<div class="vide" style="padding:1.2rem;font-size:.85rem">La courbe apparaît dès qu\'une matière est rassemblée.</div>';
      return;
    }
    const fin = r.etatFinal;
    const avant = r.etapes.filter((e) => !e.etat.lance);
    const protMax = Math.max(0, ...avant.map((e) => e.etat.protection));
    const tol = B.TOLERANCE[fin.ancre];
    const limite = tol ? Math.max(tol.haut, protMax) : null;
    const Ts = pts.map((p) => p.T).concat([B.AMBIANTE]);
    let tMin = Math.min(...Ts), tMax = Math.max(...Ts);
    if (limite !== null && limite < tMax * 1.6) tMax = Math.max(tMax, limite);
    if (tMax - tMin < 20) tMax = tMin + 20;
    const pad = (tMax - tMin) * 0.08; tMax += pad; tMin -= pad;
    const x = (t) => g + (t / r.duree) * (W - g - d);
    const y = (T) => h + (1 - (T - tMin) / (tMax - tMin)) * (H - h - b);
    const chemin = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.T).toFixed(1)}`).join('');
    const reperes = r.etapes.filter((e) => e.duree > 0).map((e) => `<line x1="${x(e.debut)}" x2="${x(e.debut)}" y1="${h}" y2="${H - b}" stroke="#2b3045" stroke-dasharray="2 3"/><text x="${x(e.debut) + 2}" y="${h + 8}" font-size="8" fill="#6f6d80" font-family="IBM Plex Mono, monospace">${e.index + 1}</text>`).join('');
    const tick = (T) => `<text x="${g - 4}" y="${y(T) + 3}" font-size="9" text-anchor="end" fill="#6f6d80" font-family="IBM Plex Mono, monospace">${Math.round(T)}°</text>`;
    const lim = limite !== null && limite <= tMax ? `<line x1="${g}" x2="${x(r.tempsCharge)}" y1="${y(limite)}" y2="${y(limite)}" stroke="#e2565a" stroke-width="1.2" stroke-dasharray="5 3"/>` : '';
    const lance = fin.lance ? `<line x1="${x(r.tempsCharge)}" x2="${x(r.tempsCharge)}" y1="${h}" y2="${H - b}" stroke="#62d6c6" stroke-width="1.2"/>` : '';
    $('courbe').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Température du sort au cours du temps">
      <line x1="${g}" x2="${W - d}" y1="${H - b}" y2="${H - b}" stroke="#3c4361"/>
      <line x1="${g}" x2="${g}" y1="${h}" y2="${H - b}" stroke="#3c4361"/>
      ${reperes}${lim}${lance}
      ${tick(tMax - pad)}${tick(B.AMBIANTE)}
      <path d="${chemin}" fill="none" stroke="#f0a46b" stroke-width="2" stroke-linejoin="round"/>
      <text x="${g}" y="${H - 6}" font-size="9" fill="#6f6d80" font-family="IBM Plex Mono, monospace">0 s</text>
      <text x="${W - d}" y="${H - 6}" font-size="9" text-anchor="end" fill="#6f6d80" font-family="IBM Plex Mono, monospace">${fmtS(r.duree)}</text>
    </svg>`;
  }

  // --- Actions -------------------------------------------------------------------------
  function fiche() {
    const r = dernier;
    const L = [
      `✦ ${sort.nom || 'Sort sans nom'}${sort.ecole ? ` — ${sort.ecole}` : ''}`,
      `${r.cercle} · ${r.ether} Éther (${R.niveaux[sort.lanceur.niveau].nom.toLowerCase()}, réserve ${r.reserve}) · charge ${fmtS(r.tempsCharge)}`,
      '',
      ...sort.blocs.map((b, i) => {
        const def = B.BLOCS[b.type];
        const vals = B.valeurs(b);
        const p = B.parametres(b).filter((prm) => !prm.si || prm.si(vals)).map((prm) => {
          const v = b.params[prm.id] ?? prm.def;
          return prm.type === 'select' ? prm.options[v] : `${v} ${prm.unite || ''}`.trim();
        }).join(', ');
        return `${i + 1}. ${def.nom}${p ? ` (${p})` : ''}`;
      }),
      '',
      sort.description || '',
      r.livraison ? `Énergie délivrée : ${M.formatEnergie(r.livraison.total)}` : '',
      `Risque : ${r.risque.txt}`,
    ];
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  $('b-enregistrer').addEventListener('click', () => {
    if (!sort.blocs.length) return notifier('Le blueprint est vide.');
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
    if (sort.blocs.length > 1 && !confirm('Commencer un nouveau sort ? Le blueprint en cours non enregistré sera perdu.')) return;
    sort = B.normaliser(M.nouveauSort());
    for (const id of ['nom', 'ecole', 'description']) $(id).value = '';
    $('focalisateur').value = sort.lanceur.focalisateur;
    insertion = 1;
    rendreNiveaux(); rendrePlan(); maj();
  });

  // --- Exemples accessibles depuis la Forge ---------------------------------------------
  $('exemples-forge').innerHTML = EXEMPLES.map((ex) => `<button class="bouton petit" type="button" data-ex="${echapper(ex.id)}">${echapper(ex.nom)}</button>`).join('');
  $('exemples-forge').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ex]');
    if (!btn) return;
    const ex = EXEMPLES.find((x) => x.id === btn.dataset.ex);
    if (!ex) return;
    if (sort.blocs.length > 1 && !confirm(`Charger l'exemple « ${ex.nom} » ? Le blueprint en cours non enregistré sera remplacé.`)) return;
    sort = B.normaliser({ ...structuredClone(ex), id: M.nouveauSort().id });
    for (const id of ['nom', 'ecole', 'description']) $(id).value = sort[id] || '';
    $('focalisateur').value = sort.lanceur.focalisateur;
    insertion = null;
    rendreNiveaux(); rendrePlan(); maj();
    notifier(`Exemple « ${ex.nom} » chargé.`);
  });

  if (sort.blocs.length <= 1) insertion = sort.blocs.length;
  rendreReglages();
  rendreNiveaux();
  rendrePlan();
  maj();
})();
