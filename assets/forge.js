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
      if (s.aimant && !s.libere) puces.push(`<span class="puce">🧲 ${M.formatNombre(s.aimant, 2)} T</span>`);
      if (s.silence && !s.libere) puces.push('<span class="puce ok">silencieux</span>');
      if (s.percoit && !s.lance) puces.push(`<span class="puce ok">perçoit la magie (${s.percoit} m)</span>`);
      if (s.rempart && !s.lance) puces.push('<span class="puce ok">esprit fermé</span>');
      if (s.diag) puces.push('<span class="puce ok">diagnostiqué</span>');
      if (s.anesthesie && !s.libere) puces.push('<span class="puce ok">anesthésié</span>');
      if (s.soin) puces.push(`<span class="puce ok">💚 ${M.formatNombre(s.soin, s.soin < 1 ? 1 : 0)} g soignés</span>`);
      if (s.purge) puces.push('<span class="puce ok">poison purgé</span>');
      if (s.psyche) puces.push('<span class="puce">esprit touché</span>');
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
    $('res-livree').textContent = r.livraison ? M.formatEnergie(r.livraison.total) : r.etatFinal.soin ? `${M.formatNombre(r.etatFinal.soin, r.etatFinal.soin < 1 ? 1 : 0)} g soignés` : '—';
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

  // --- Courbes du sort : température, électricité, énergie ------------------------------
  let onglet = null;          // onglet choisi par l'utilisateur (null = automatique)
  let dernierGraph = null;    // données du dernier graphique pour le survol
  const DENSITES = B.DENSITES;
  const EPS0 = 8.854e-12;

  document.querySelector('.onglets').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-onglet]');
    if (!b) return;
    onglet = b.dataset.onglet;
    if (dernier) dessinerCourbe(dernier);
  });

  // Données électriques du sort (charge stockée ou effet direct « foudre »)
  function analyseElec(r) {
    const qMax = Math.max(0, ...r.courbe.map((p) => p.q || 0));
    const foudres = sort.blocs.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'effet' && b.params?.effet === 'foudre');
    if (qMax <= 0 && !foudres.length) return null;
    const ef = r.etatFinal;
    // rayon de la sphère chargée : volume de la matière du sort (au moins 5 cm)
    const m = ef.matiere;
    const vol = m ? m.masse / (DENSITES[m.type] || 1000) : 0;
    const rayon = Math.max(0.05, Math.cbrt((3 * vol) / (4 * Math.PI)) || 0);
    const C = 4 * Math.PI * EPS0 * rayon;
    const tau = 50e-6; // durée d'une décharge type foudre
    const res = { qMax, rayon, C, tau, foudres };
    if (qMax > 0) {
      res.V = Math.sqrt((2 * qMax) / C);
      res.Q = C * res.V;
      res.I = res.Q / tau;
      res.Pcrete = qMax / tau;
      res.arc = res.V / 1e6; // claquage de l'air sur de longues distances ~1 MV/m
      res.fuite = ef.fuite || 0;
      res.danger = r.courbe.some((p) => p.proche && p.q > 10 && p.iso < p.q);
      res.isoMax = Math.max(0, ...r.courbe.map((p) => p.iso || 0));
      res.delivre = r.livraison?.electrique ?? null;
    }
    if (foudres.length) {
      const p = B.valeurs(foudres[0].b);
      res.direct = { U: p.tension, I: p.intensite, t: p.duree, E: p.tension * p.intensite * p.duree, P: p.tension * p.intensite };
    }
    return res;
  }

  const fmtUnite = (x, u) => {
    const pref = [['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]];
    for (const [s, v] of pref) if (Math.abs(x) >= v) return `${M.formatNombre(x / v, x / v < 10 ? 2 : x / v < 100 ? 1 : 0)} ${s}${u}`;
    return `0 ${u}`;
  };
  const MONO = 'font-family="IBM Plex Mono, monospace"';

  function cadre(W, H, g, d, h, b, r, x, extra = '') {
    const reperes = r.etapes.filter((e) => e.duree > 0 || e.type === 'liberation').map((e) =>
      `<line x1="${x(e.debut)}" x2="${x(e.debut)}" y1="${h}" y2="${H - b}" stroke="#2b3045" stroke-dasharray="2 3"/><text x="${x(e.debut) + 2}" y="${h + 8}" font-size="8" fill="#6f6d80" ${MONO}>${e.index + 1}</text>`).join('');
    return `<line x1="${g}" x2="${W - d}" y1="${H - b}" y2="${H - b}" stroke="#3c4361"/>
      <line x1="${g}" x2="${g}" y1="${h}" y2="${H - b}" stroke="#3c4361"/>${reperes}${extra}
      <text x="${g}" y="${H - 6}" font-size="9" fill="#6f6d80" ${MONO}>0 s</text>
      <text x="${W - d}" y="${H - 6}" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${fmtS(r.duree)}</text>`;
  }

  function dessinerCourbe(r) {
    const elec = analyseElec(r);
    const aMatiere = r.etapes.some((e) => e.etat.matiere);
    const btn = (k) => document.querySelector(`.onglets [data-onglet="${k}"]`);
    btn('elec').hidden = !elec;
    let actif = onglet || (elec ? 'elec' : aMatiere ? 'temp' : 'energie');
    if (actif === 'elec' && !elec) actif = aMatiere ? 'temp' : 'energie';
    document.querySelectorAll('.onglets [data-onglet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === actif)));
    $('elec-stats').innerHTML = '';
    $('courbe-info').textContent = '';
    if (!sort.blocs.length || r.duree <= 0) {
      $('courbe').innerHTML = '<div class="vide" style="padding:1.2rem;font-size:.85rem">Ajoute des blocs pour voir les courbes du sort.</div>';
      $('courbe-leg').innerHTML = ''; dernierGraph = null; return;
    }
    if (actif === 'elec') dessinerElec(r, elec);
    else if (actif === 'energie') dessinerEnergie(r);
    else dessinerTemp(r);
  }

  const legende = (items) => { $('courbe-leg').innerHTML = items.map(([c, t, pointille]) => `<span><i style="background:${c}${pointille ? ';height:0;border-top:2px dashed ' + c + ';background:none' : ''}"></i>${t}</span>`).join(''); };

  function dessinerTemp(r) {
    const W = 340, H = 170, g = 34, d = 10, h = 8, b = 22;
    const pts = r.courbe;
    if (!r.etapes.some((e) => e.etat.matiere)) {
      $('courbe').innerHTML = '<div class="vide" style="padding:1.2rem;font-size:.85rem">La courbe de température apparaît dès qu\'une matière est rassemblée.</div>';
      $('courbe-leg').innerHTML = ''; dernierGraph = null; return;
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
    const tick = (T) => `<text x="${g - 4}" y="${y(T) + 3}" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${Math.round(T)}°</text>`;
    const lim = limite !== null && limite <= tMax ? `<line x1="${g}" x2="${x(r.tempsCharge)}" y1="${y(limite)}" y2="${y(limite)}" stroke="#e2565a" stroke-width="1.2" stroke-dasharray="5 3"/>` : '';
    const lance = fin.lance ? `<line x1="${x(r.tempsCharge)}" x2="${x(r.tempsCharge)}" y1="${h}" y2="${H - b}" stroke="#62d6c6" stroke-width="1.2"/>` : '';
    $('courbe').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Température du sort au cours du temps">
      ${cadre(W, H, g, d, h, b, r, x, lim + lance)}${tick(tMax - pad)}${tick(B.AMBIANTE)}
      <path d="${chemin}" fill="none" stroke="#f0a46b" stroke-width="2" stroke-linejoin="round"/>
      <g class="guide"></g>
    </svg>`;
    legende([['#f0a46b', 'température'], ['#e2565a', 'limite du lanceur', true], ['#62d6c6', 'lancement']]);
    activerSurvol(r, x, W, H, g, d, h, b, (p) => `t = ${fmtS(p.t)} · ${M.formatNombre(p.T, 0)} °C`);
  }

  function dessinerEnergie(r) {
    const W = 340, H = 170, g = 40, d = 10, h = 8, b = 22;
    const pts = r.courbe;
    const Emax = Math.max(1, ...pts.map((p) => p.E || 0)) * 1.08;
    const x = (t) => g + (t / r.duree) * (W - g - d);
    const y = (E) => h + (1 - E / Emax) * (H - h - b);
    const ligne = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.E || 0).toFixed(1)}`).join('');
    const aire = `${ligne}L${x(r.duree).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
    const lance = r.etatFinal.lance ? `<line x1="${x(r.tempsCharge)}" x2="${x(r.tempsCharge)}" y1="${h}" y2="${H - b}" stroke="#62d6c6" stroke-width="1.2"/>` : '';
    $('courbe').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Énergie dépensée au cours du temps">
      <defs><linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#62d6c6" stop-opacity=".35"/><stop offset="1" stop-color="#62d6c6" stop-opacity="0"/></linearGradient></defs>
      ${cadre(W, H, g, d, h, b, r, x, lance)}
      <text x="${g - 4}" y="${y(Emax / 1.08) + 3}" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${M.formatEnergie(Emax / 1.08).replace(' ', '')}</text>
      <path d="${aire}" fill="url(#gE)"/><path d="${ligne}" fill="none" stroke="#62d6c6" stroke-width="2"/>
      <g class="guide"></g>
    </svg>`;
    legende([['#62d6c6', 'énergie dépensée (cumulée, avant rendement)'], ['#62d6c6', 'lancement']]);
    activerSurvol(r, x, W, H, g, d, h, b, (p) => `t = ${fmtS(p.t)} · ${M.formatEnergie(p.E || 0)} dépensés · entretiens ${fmtUnite(p.P || 0, 'W')}`);
  }

  function dessinerElec(r, el) {
    const W = 340, H = 190, g = 40, d = 10, h = 10, b = 22;
    const pts = r.courbe;
    const x = (t) => g + (t / r.duree) * (W - g - d);
    if (el.qMax > 0) {
      const isoVisibles = pts.filter((p) => p.proche && p.iso > 0).map((p) => p.iso);
      let top = el.qMax;
      if (isoVisibles.length && Math.min(...isoVisibles) < el.qMax * 3) top = Math.max(top, Math.min(...isoVisibles));
      top *= 1.15;
      const y = (q) => h + (1 - Math.min(q, top) / top) * (H - h - b);
      // charge en paliers (aire)
      let ch = `M${x(0)},${y(0)}`;
      for (let i = 1; i < pts.length; i++) ch += `L${x(pts[i].t).toFixed(1)},${y(pts[i - 1].q || 0).toFixed(1)}L${x(pts[i].t).toFixed(1)},${y(pts[i].q || 0).toFixed(1)}`;
      const aire = `${ch}L${x(r.duree)},${y(0)}Z`;
      // isolation (seulement tant que le sort est près du lanceur)
      let iso = '', zones = '';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i];
        if (a.proche && a.iso > 0) iso += `<line x1="${x(a.t)}" x2="${x(c.t)}" y1="${y(a.iso)}" y2="${y(a.iso)}" stroke="#6fa8e8" stroke-width="1.3" stroke-dasharray="5 3"/>`;
        if (a.proche && a.q > 10 && a.iso < a.q) zones += `<rect x="${x(a.t)}" y="${h}" width="${Math.max(0.5, x(c.t) - x(a.t))}" height="${H - h - b}" fill="#e2565a" opacity=".16"/>`;
      }
      const lance = r.etatFinal.lance ? `<line x1="${x(r.tempsCharge)}" x2="${x(r.tempsCharge)}" y1="${h}" y2="${H - b}" stroke="#62d6c6" stroke-width="1.2"/><text x="${x(r.tempsCharge) + 3}" y="${H - b - 4}" font-size="8" fill="#62d6c6" ${MONO}>lancé</text>` : '';
      const lib = r.etapes.find((e) => e.type === 'liberation' && e.etat.libere);
      const decharge = lib ? `<g transform="translate(${x(lib.debut)},${y(el.qMax) - 2})"><path d="M-4,-14 L2,-6 L-2,-6 L4,2" fill="none" stroke="#e0d35a" stroke-width="1.6" stroke-linejoin="round"/></g><text x="${x(lib.debut) > W - 90 ? x(lib.debut) - 9 : x(lib.debut) + 7}" y="${Math.max(h + 8, y(el.qMax) - 6)}" font-size="8" fill="#e0d35a" text-anchor="${x(lib.debut) > W - 90 ? 'end' : 'start'}" ${MONO}>décharge ${fmtUnite(el.Pcrete, 'W')}</text>` : '';
      $('courbe').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Charge électrique du sort au cours du temps">
        <defs><linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0d35a" stop-opacity=".45"/><stop offset="1" stop-color="#e0d35a" stop-opacity=".03"/></linearGradient></defs>
        ${zones}${cadre(W, H, g, d, h, b, r, x, iso + lance)}
        <text x="${g - 4}" y="${y(el.qMax) + 3}" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${M.formatEnergie(el.qMax).replace(' ', '')}</text>
        <path d="${aire}" fill="url(#gQ)"/><path d="${ch}" fill="none" stroke="#e0d35a" stroke-width="2" stroke-linejoin="round"/>
        ${decharge}<g class="guide"></g>
      </svg>`;
      legende([['#e0d35a', 'énergie électrique stockée'], ['#6fa8e8', 'isolation du lanceur', true], ['rgba(226,86,90,.6)', 'zone d\'électrocution'], ['#62d6c6', 'lancement']]);
      activerSurvol(r, x, W, H, g, d, h, b, (p) => `t = ${fmtS(p.t)} · charge ${M.formatEnergie(p.q || 0)}${p.proche && p.iso ? ` · isolation ${M.formatEnergie(p.iso)}` : ''} · fuite ${fmtUnite(0.02 * (p.q || 0), 'W')}`);
      const tuile = (lbl, val, alerte = false) => `<div class="chiffre${alerte ? ' alerte' : ''}"><small>${lbl}</small><b>${val}</b></div>`;
      $('elec-stats').innerHTML = [
        tuile('Charge maximale', M.formatEnergie(el.qMax)),
        tuile('Isolation du lanceur', el.isoMax ? M.formatEnergie(el.isoMax) : 'aucune', el.danger),
        tuile('Tension estimée', fmtUnite(el.V, 'V')),
        tuile('Charge électrique', fmtUnite(el.Q, 'C')),
        tuile('Arc possible dans l\'air', `≈ ${M.formatNombre(el.arc, el.arc < 10 ? 1 : 0)} m`),
        tuile('Fuite totale', M.formatEnergie(el.fuite)),
        tuile('Courant de décharge', `≈ ${fmtUnite(el.I, 'A')}`),
        tuile('Puissance crête', `≈ ${fmtUnite(el.Pcrete, 'W')}`),
        el.delivre !== null ? tuile('Délivrée à la cible', M.formatEnergie(el.delivre)) : tuile('Délivrée', 'pas de libération'),
        tuile('Rayon de la sphère', `${M.formatNombre(el.rayon * 100, 0)} cm`),
        `<p class="note">Modèle : sphère conductrice de capacité C = 4πε₀r (${fmtUnite(el.C, 'F')}), tension V = √(2E/C), décharge en ~50 µs comme un coup de foudre. La charge fuit de 2 % par seconde : c'est l'entretien payé tant que le sort existe.</p>`,
      ].join('');
      if (el.danger) $('courbe-info').innerHTML = '<span style="color:#f2b5b6">⚠ La charge dépasse l\'isolation pendant que le sort est près de toi.</span>';
    } else {
      // effet direct « foudre » : pas de stockage, une décharge instantanée
      const f = el.direct;
      $('courbe').innerHTML = `<svg viewBox="0 0 340 110" role="img" aria-label="Profil de la décharge">
        <line x1="40" x2="330" y1="88" y2="88" stroke="#3c4361"/><line x1="40" x2="40" y1="10" y2="88" stroke="#3c4361"/>
        <path d="M40,88 L120,88 L124,16 L132,40 L138,22 L150,70 L170,84 L330,88" fill="none" stroke="#e0d35a" stroke-width="2" stroke-linejoin="round"/>
        <text x="36" y="20" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${fmtUnite(f.P, 'W')}</text>
        <text x="40" y="104" font-size="9" fill="#6f6d80" ${MONO}>0</text><text x="330" y="104" font-size="9" text-anchor="end" fill="#6f6d80" ${MONO}>${fmtUnite(f.t, 's')}</text>
      </svg>`;
      legende([['#e0d35a', 'puissance de la décharge (allure)']]);
      const tuile = (lbl, val) => `<div class="chiffre"><small>${lbl}</small><b>${val}</b></div>`;
      $('elec-stats').innerHTML = [tuile('Tension', fmtUnite(f.U, 'V')), tuile('Intensité', fmtUnite(f.I, 'A')), tuile('Durée', fmtUnite(f.t, 's')), tuile('Énergie', M.formatEnergie(f.E)), tuile('Puissance', fmtUnite(f.P, 'W')), tuile('Arc possible', `≈ ${M.formatNombre(f.U / 1e6, 2)} m`),
        '<p class="note">Effet direct : la décharge naît d\'un coup au point d\'ancrage, sans charge stockée ni fuite. Pour un sort qui accumule sa charge, utilise le bloc « Charger électriquement ».</p>'].join('');
      dernierGraph = null;
    }
  }

  // Survol : ligne-guide et valeurs à l'instant pointé
  function activerSurvol(r, x, W, H, g, d, h, b, texte) {
    const svg = $('courbe').querySelector('svg');
    const guide = svg.querySelector('.guide');
    const pts = r.courbe;
    dernierGraph = { r };
    const surPoint = (ev) => {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      const t = Math.max(0, Math.min(r.duree, ((px - g) / (W - g - d)) * r.duree));
      let p = pts[0];
      for (const q of pts) { if (q.t <= t) p = q; else break; }
      guide.innerHTML = `<line x1="${x(t)}" x2="${x(t)}" y1="${h}" y2="${H - b}" stroke="#e8e4d6" stroke-opacity=".35"/>`;
      $('courbe-info').textContent = texte({ ...p, t });
    };
    svg.addEventListener('pointermove', surPoint);
    svg.addEventListener('pointerleave', () => { guide.innerHTML = ''; });
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
  {
    const groupes = new Map();
    for (const ex of EXEMPLES) { const k = ex.ecole || 'Divers'; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(ex); }
    $('nb-exemples').textContent = `(${EXEMPLES.length})`;
    $('exemples-forge').innerHTML = [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([ecole, liste]) =>
      `<div class="ex-groupe"><h4>${echapper(ecole)}</h4><div class="actions">${liste.map((ex) => `<button class="bouton petit" type="button" data-ex="${echapper(ex.id)}" title="${echapper(ex.description || '')}">${echapper(ex.nom)}</button>`).join('')}</div></div>`).join('');
  }
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
    $('exemples-details').open = false;
  });

  if (sort.blocs.length <= 1) insertion = sort.blocs.length;
  rendreReglages();
  rendreNiveaux();
  rendrePlan();
  maj();
})();
