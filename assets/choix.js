/* ==========================================================================
   La Matrice Arcanique — sélecteurs visuels
   Remplace les menus déroulants des blocs par des cartes illustrées :
   icône, caractéristiques clés et description de chaque option.
   ========================================================================== */
const Choix = (() => {
  const M = Matrice, B = Blueprint;
  const pct = (x) => `${Math.round(x * 100)} %`;
  const nb = (x, d = 2) => M.formatNombre(x, d);

  // --- Icônes par paramètre (clé « bloc.param » ou « effet.param ») ----------
  const MAT = { air: '💨', eau: '💧', pierre: '🪨', bois: '🪵', charbon: '⚫', fer: '⚙️', huile: '🛢️', glace: '🧊', vapeur: '♨️', chair: '🥩', or: '🪙' };
  const LUM = { '0.05': '✨', '1': '🕯️', '10': '🔦', '60': '🏮', '1000': '💡', '100000': '☀️' };
  const BOU = { '100': '🏹', '500': '⚔️', '3000': '🔫', '50000': '🐎', '1000000': '💣' };
  const ICONES = {
    'ancrage.lieu': { main: '✋', mains: '🙌', doigt: '☝️', objet: '🪄', contact: '🫳', corps: '🌀', pieds: '🦶', devant: '🫴', dessus: '☁️', distance: '🔭', creature: '👁️', rune: '🔯', lien: '🔗' },
    'liberation.mode': { explosion: '💥', contact: '👊', perforation: '🎯', cone: '📢', onde: '🌊', implosion: '🫧', rayonnement: '☀️', eclats: '💠', arc: '⚡', brasier: '🔥', impregnation: '🗡️', reabsorption: '♻️', dissipation: '🌫️' },
    'rassembler.matiere': MAT, 'creer.matiere': MAT, 'thermique.materiau': MAT,
    'faconner.forme': { sphere: '⚪', lance: '🗡️', disque: '💿', cone: '🔺', mur: '🧱', nuage: '☁️' },
    'effet.effet': { thermique: '🔥', cinetique: '💨', elevation: '🪶', lumiere: '💡', son: '🔊', foudre: '⚡', protection: '🛡️', soin: '💚', psyche: '🧠', transmutation: '⚗️', translocation: '🌀', creation: '✨' },
    'etat.transition': { fondre: '🫠', solidifier: '❄️', vaporiser: '♨️', condenser: '💧' },
    'attendre.maintenir': { oui: '🌡️', non: '🍃' },
    'retardement.declencheur': { duree: '⏱️', contact: '✋', proximite: '👣', mot: '🗣️' },
    'illuminer.puissance': LUM, 'lumiere.puissance': LUM,
    'son.puissance': { '0.000001': '🤫', '0.00001': '🗣️', '0.001': '📣', '1': '📯', '1000': '🔊', '100000': '🌩️' },
    'protection.seuil': '🛡️', 'protelec.seuil': '⚡',
    'bouclier.capacite': BOU, 'protection.capacite': BOU,
    'soin.blessure': { '0.1': '🩹', '2': '🩹', '20': '🩸', '150': '🦴', '500': '🫀', '4000': '🦾' },
    'psyche.intensite': { '5': '💭', '50': '🗨️', '500': '🎭', '5000': '👑' },
    'transmutation.niveau': { '1000': '🫳', '10000000': '⚗️', '100000000000000': '☢️' },
  };

  // --- Caractéristiques et description de chaque option ------------------------
  function meta(cle, k) {
    const ic = ICONES[cle];
    const ico = typeof ic === 'string' ? ic : ic?.[k] || '';
    const tags = [];
    let note = '';
    if (cle === 'ancrage.lieu') {
      const a = B.ANCRAGES?.[k] || {};
      if (a.tol) tags.push(`supporte ${a.tol.haut} °C`);
      if (a.distanceFixe) tags.push(`à ${a.distanceFixe} m`);
      if (a.variable) tags.push('coût selon la distance');
      if (a.porteeMult) tags.push(`distance ÷${a.porteeMult}`);
      if (a.coef) tags.push(`énergie ×${nb(a.coef)}`);
      note = a.note || '';
    } else if (cle === 'liberation.mode') {
      const l = B.LIBERATIONS?.[k] || {};
      if (l.recup) tags.push(`récupère ${pct(l.recup)}`);
      else if (l.rend === 0) tags.push('aucun effet');
      else tags.push(`rendement ${pct(l.rend)}`);
      if (l.rend > 0) tags.push(l.retour === 0 ? 'aucun retour' : l.retour < 1 ? `retour ${pct(l.retour)}` : 'retour total si proche');
      if (l.rend > 0) tags.push(l.zone ? 'zone' : 'cible unique');
      note = l.note || '';
    } else if (/\.(matiere|materiau)$/.test(cle)) {
      const m = M.MATERIAUX[k];
      if (m) tags.push(`c = ${nb(m.c, 0)} J/kg·°C`);
      if (B.COMBUSTIBLES?.[k]) tags.push('combustible');
      const tr = B.TRANSITIONS?.[['eau', 'glace', 'vapeur'].includes(k) ? 'eau' : k];
      if (tr?.fusion) tags.push(`fond à ${nb(tr.fusion.T, 0)} °C`);
    } else if (cle === 'faconner.forme') {
      const f = B.FORMES?.[k];
      if (f) tags.push(`pertes de chaleur ×${nb(f.pertes, 1)}`);
    } else if (cle === 'effet.effet') {
      const e = M.EFFETS[k];
      if (e) { tags.push(e.ecole); note = e.description; }
    } else if (cle === 'protection.seuil') {
      tags.push(`entretien ${M.formatNombre(0.002 * Number(k) ** 2, 0)} W`);
    } else if (cle === 'protelec.seuil') {
      tags.push(`entretien ${M.formatNombre(5 * Math.log10(Number(k)) ** 2, 0)} W`);
    } else if (cle === 'etat.transition') {
      note = { fondre: 'Solide → liquide, au point de fusion.', solidifier: 'Liquide → solide : la chaleur latente doit être extraite.', vaporiser: 'Liquide → gaz, au point d\'ébullition.', condenser: 'Gaz → liquide : la chaleur latente doit être extraite.' }[k] || '';
    }
    return { ico, tags, note };
  }

  // --- Rendu du bouton ------------------------------------------------------------
  function boutonHTML({ id, cle, prm, valeur, data }) {
    const k = String(valeur);
    const m = meta(cle, k);
    return `<button type="button" class="choix-bouton" id="${id}" aria-haspopup="listbox" aria-expanded="false"
        data-choix="${cle}" ${data}>
      ${m.ico ? `<span class="choix-ico" aria-hidden="true">${m.ico}</span>` : ''}
      <span class="choix-txt"><span class="choix-nom">${echapper(prm.options[k] ?? k)}</span>${m.tags.length ? `<span class="choix-tags">${echapper(m.tags.join(' · '))}</span>` : ''}</span>
      <span class="choix-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>`;
  }

  // --- Panneau d'options ------------------------------------------------------------
  let panneau = null, bouton = null, rappel = null;

  function fermer(rendreFocus = false) {
    if (!panneau) return;
    panneau.remove(); panneau = null;
    if (bouton) { bouton.setAttribute('aria-expanded', 'false'); if (rendreFocus) bouton.focus(); }
    bouton = null; rappel = null;
    window.removeEventListener('scroll', surDefilement, true);
    window.removeEventListener('resize', placer);
  }

  // Défilement de la page : on suit le bouton. Défilement dans le panneau lui-même : on ne touche à rien.
  function surDefilement(ev) {
    if (panneau && ev.target instanceof Node && panneau.contains(ev.target)) return;
    placer();
  }

  function placer() {
    if (!panneau || !bouton) return;
    if (!document.body.contains(bouton)) return fermer();
    const r = bouton.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, marge = 12;
    const large = panneau.classList.contains('large');
    const w = Math.min(vw - 2 * marge, Math.max(r.width, large ? 640 : 300));
    panneau.style.width = `${w}px`;
    panneau.style.left = `${Math.min(Math.max(marge, r.left), vw - w - marge)}px`;
    const plafond = Math.max(marge, (document.querySelector('.barre')?.getBoundingClientRect().bottom || 0) + 6); // ne pas recouvrir la barre du haut
    const dessous = vh - r.bottom - marge, dessus = r.top - plafond;
    const defile = panneau.scrollTop;
    panneau.style.maxHeight = '';
    const h = panneau.scrollHeight;
    if (h > dessous && dessus > dessous) {
      const hm = Math.min(h, dessus - 6);
      panneau.style.maxHeight = `${hm}px`;
      panneau.style.top = `${r.top - hm - 6}px`;
    } else {
      panneau.style.maxHeight = `${Math.max(160, dessous - 6)}px`;
      panneau.style.top = `${r.bottom + 6}px`;
    }
    panneau.scrollTop = defile;
  }

  function ouvrir(btn, prm, valeur, surChoix) {
    const memeBouton = bouton === btn;
    fermer();
    if (memeBouton) return;
    bouton = btn; rappel = surChoix;
    const cle = btn.dataset.choix;
    const entrees = Object.entries(prm.options).map(([k, t]) => ({ k, t, ...meta(cle, k) }));
    const riche = entrees.some((e) => e.note) || entrees.length > 6;
    panneau = document.createElement('div');
    panneau.className = `choix-panneau${riche ? ' large' : ''}`;
    panneau.setAttribute('role', 'listbox');
    panneau.setAttribute('aria-label', prm.label);
    panneau.style.setProperty('--c', getComputedStyle(btn).getPropertyValue('--c') || 'var(--arcane)');
    panneau.innerHTML = `<div class="choix-titre">${echapper(prm.label)}</div><div class="choix-grille">${entrees.map((e) => `
      <button type="button" role="option" class="choix-option" data-k="${echapper(e.k)}" aria-selected="${e.k === String(valeur)}"${e.note ? ` title="${echapper(e.note)}"` : ''}>
        ${e.ico ? `<span class="choix-ico" aria-hidden="true">${e.ico}</span>` : ''}
        <span class="choix-txt">
          <span class="choix-nom">${echapper(e.t)}</span>
          ${e.tags.length ? `<span class="choix-tags">${echapper(e.tags.join(' · '))}</span>` : ''}
          ${e.note ? `<span class="choix-note">${echapper(e.note)}</span>` : ''}
        </span>
      </button>`).join('')}</div>`;
    document.body.append(panneau);
    btn.setAttribute('aria-expanded', 'true');
    placer();
    window.addEventListener('scroll', surDefilement, true);
    window.addEventListener('resize', placer);
    (panneau.querySelector('[aria-selected="true"]') || panneau.querySelector('.choix-option'))?.focus({ preventScroll: true });
    panneau.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });

    panneau.addEventListener('click', (ev) => {
      const o = ev.target.closest('.choix-option');
      if (!o) return;
      const f = rappel;
      fermer(true);
      f?.(o.dataset.k);
    });
    panneau.addEventListener('keydown', (ev) => {
      const opts = [...panneau.querySelectorAll('.choix-option')];
      const i = opts.indexOf(document.activeElement);
      const cols = Math.max(1, Math.round(panneau.querySelector('.choix-grille').clientWidth / (opts[0]?.offsetWidth || 1)));
      const aller = (j) => { ev.preventDefault(); opts[Math.max(0, Math.min(opts.length - 1, j))]?.focus(); };
      if (ev.key === 'Escape') { ev.preventDefault(); fermer(true); }
      else if (ev.key === 'Tab') fermer();
      else if (ev.key === 'ArrowDown') aller(i + cols);
      else if (ev.key === 'ArrowUp') aller(i - cols);
      else if (ev.key === 'ArrowRight') aller(i + 1);
      else if (ev.key === 'ArrowLeft') aller(i - 1);
      else if (ev.key === 'Home') aller(0);
      else if (ev.key === 'End') aller(opts.length - 1);
    });
  }

  document.addEventListener('pointerdown', (ev) => {
    if (panneau && !panneau.contains(ev.target) && !ev.target.closest('.choix-bouton')) fermer();
  });

  return { meta, boutonHTML, ouvrir, fermer };
})();
