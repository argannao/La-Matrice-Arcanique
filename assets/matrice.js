/* ==========================================================================
   La Matrice Arcanique — moteur de calcul
   Principe : la physique réelle donne l'énergie d'un effet (en joules),
   puis des règles d'inspiration (réglables) la convertissent en coût jouable.
   ========================================================================== */
const Matrice = (() => {
  const G = 9.81;            // m/s²
  const C = 299792458;       // m/s
  const J_PAR_KCAL = 4184;

  // --- Données de référence ------------------------------------------------
  const MATERIAUX = {
    eau:    { nom: 'Eau',            c: 4186 },
    air:    { nom: 'Air',            c: 1005 },
    chair:  { nom: 'Chair / corps',  c: 3500 },
    bois:   { nom: 'Bois',           c: 1700 },
    glace:  { nom: 'Glace',          c: 2100 },
    pierre: { nom: 'Pierre',         c: 800 },
    fer:    { nom: 'Fer / acier',    c: 450 },
    or:     { nom: 'Or',             c: 129 },
  };

  const opts = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.nom]));

  // --- Composantes (effets élémentaires) ------------------------------------
  // nature : 'rigoureux' = formule physique réelle, 'inspire' = loi inventée mais cohérente
  const EFFETS = {
    thermique: {
      nom: 'Thermique', ecole: 'Pyromancie / Cryomancie', nature: 'rigoureux',
      description: 'Chauffer ou refroidir une masse de matière.',
      formule: 'E = m · c · |ΔT|',
      params: [
        { id: 'masse', label: 'Masse affectée', unite: 'kg', def: 1, min: 0, step: 0.1 },
        { id: 'materiau', label: 'Matériau', type: 'select', options: opts(MATERIAUX), def: 'air' },
        { id: 'deltaT', label: 'Variation de température', unite: '°C', def: 500, step: 10 },
      ],
      calcul: (p) => p.masse * MATERIAUX[p.materiau].c * Math.abs(p.deltaT),
    },
    cinetique: {
      nom: 'Cinétique', ecole: 'Kinésie', nature: 'rigoureux',
      description: 'Mettre en mouvement un objet ou une cible (projeter, pousser).',
      formule: 'E = ½ · m · v²',
      params: [
        { id: 'masse', label: 'Masse projetée', unite: 'kg', def: 1, min: 0, step: 0.1 },
        { id: 'vitesse', label: 'Vitesse', unite: 'm/s', def: 30, min: 0 },
      ],
      calcul: (p) => 0.5 * p.masse * p.vitesse ** 2,
    },
    elevation: {
      nom: 'Élévation', ecole: 'Kinésie', nature: 'mixte',
      description: 'Soulever et maintenir en l\'air. Le maintien coûte (loi de la Matrice : la magie résiste au repos).',
      formule: 'E = m·g·h + m·g·k·t   (k = 0,1 m/s)',
      params: [
        { id: 'masse', label: 'Masse soulevée', unite: 'kg', def: 70, min: 0 },
        { id: 'hauteur', label: 'Hauteur', unite: 'm', def: 3, min: 0, step: 0.5 },
        { id: 'duree', label: 'Durée de maintien', unite: 's', def: 60, min: 0 },
      ],
      calcul: (p) => p.masse * G * p.hauteur + p.masse * G * 0.1 * p.duree,
    },
    lumiere: {
      nom: 'Lumière', ecole: 'Lumen', nature: 'rigoureux',
      description: 'Émettre de la lumière pendant une durée.',
      formule: 'E = P · t',
      params: [
        { id: 'puissance', label: 'Intensité', type: 'select', def: '10',
          options: { '0.05': 'Luciole (0,05 W)', '1': 'Bougie (1 W)', '10': 'Torche (10 W)', '60': 'Lanterne (60 W)',
                     '1000': 'Projecteur (1 kW)', '100000': 'Aveuglant (100 kW)' } },
        { id: 'duree', label: 'Durée', unite: 's', def: 600, min: 0 },
      ],
      calcul: (p) => Number(p.puissance) * p.duree,
    },
    son: {
      nom: 'Son', ecole: 'Lumen', nature: 'rigoureux',
      description: 'Produire un son. La puissance acoustique réelle est très faible : le son est bon marché.',
      formule: 'E = P · t',
      params: [
        { id: 'puissance', label: 'Volume', type: 'select', def: '0.001',
          options: { '0.000001': 'Murmure', '0.00001': 'Voix', '0.001': 'Cri', '1': 'Cor de guerre',
                     '1000': 'Assourdissant', '100000': 'Coup de tonnerre' } },
        { id: 'duree', label: 'Durée', unite: 's', def: 10, min: 0 },
      ],
      calcul: (p) => Number(p.puissance) * p.duree,
    },
    foudre: {
      nom: 'Foudre', ecole: 'Électromancie', nature: 'rigoureux',
      description: 'Générer une décharge électrique.',
      formule: 'E = U · I · t',
      params: [
        { id: 'tension', label: 'Tension', unite: 'V', def: 50000, min: 0, step: 1000 },
        { id: 'intensite', label: 'Intensité', unite: 'A', def: 20, min: 0 },
        { id: 'duree', label: 'Durée de la décharge', unite: 's', def: 0.01, min: 0, step: 0.001 },
      ],
      calcul: (p) => p.tension * p.intensite * p.duree,
    },
    protection: {
      nom: 'Protection', ecole: 'Abjuration', nature: 'mixte',
      description: 'Un champ qui absorbe l\'énergie des coups. Il faut stocker l\'énergie à absorber et entretenir la surface.',
      formule: 'E = Capacité + S · 5 W/m² · t',
      params: [
        { id: 'capacite', label: 'Énergie absorbable', type: 'select', def: '500',
          options: { '100': 'Flèche (100 J)', '500': 'Coup d\'épée (500 J)', '3000': 'Balle de mousquet (3 kJ)',
                     '50000': 'Charge de cavalerie (50 kJ)', '1000000': 'Boulet de canon (1 MJ)' } },
        { id: 'surface', label: 'Surface du champ', unite: 'm²', def: 2, min: 0, step: 0.5 },
        { id: 'duree', label: 'Durée', unite: 's', def: 60, min: 0 },
      ],
      calcul: (p) => Number(p.capacite) + p.surface * 5 * p.duree,
    },
    soin: {
      nom: 'Soin', ecole: 'Biomancie', nature: 'mixte',
      description: 'Reconstruire des tissus. Coût calqué sur la biosynthèse (~25 kJ par gramme reconstitué).',
      formule: 'E = masse de tissu (g) × 25 000 J',
      params: [
        { id: 'blessure', label: 'Blessure', type: 'select', def: '2',
          options: { '0.1': 'Égratignure (0,1 g)', '2': 'Coupure (2 g)', '20': 'Plaie profonde (20 g)',
                     '150': 'Fracture (150 g)', '500': 'Organe touché (500 g)', '4000': 'Membre perdu (4 kg)' } },
        { id: 'nombre', label: 'Nombre de blessures', def: 1, min: 1 },
      ],
      calcul: (p) => Number(p.blessure) * p.nombre * 25000,
    },
    psyche: {
      nom: 'Psyché', ecole: 'Psychomancie', nature: 'inspire',
      description: 'Agir sur l\'esprit : percevoir, suggérer, dominer. Loi inventée : l\'esprit coûte cher à forcer.',
      formule: 'E = intensité · t',
      params: [
        { id: 'intensite', label: 'Intensité', type: 'select', def: '50',
          options: { '5': 'Percevoir les émotions (5 W)', '50': 'Suggestion (50 W)', '500': 'Illusion (500 W)',
                     '5000': 'Domination (5 kW)' } },
        { id: 'duree', label: 'Durée', unite: 's', def: 60, min: 0 },
      ],
      calcul: (p) => Number(p.intensite) * p.duree,
    },
    transmutation: {
      nom: 'Transmutation', ecole: 'Transmutation', nature: 'mixte',
      description: 'Changer la forme, la composition ou l\'élément d\'une matière. Changer d\'élément touche aux énergies nucléaires.',
      formule: 'E = m · e(niveau)',
      params: [
        { id: 'masse', label: 'Masse transformée', unite: 'kg', def: 1, min: 0, step: 0.1 },
        { id: 'niveau', label: 'Niveau', type: 'select', def: '1000',
          options: { '1000': 'Forme (modeler, ~1 kJ/kg)', '10000000': 'Composé (pierre → verre, ~10 MJ/kg)',
                     '100000000000000': 'Élément (plomb → or, ~10¹⁴ J/kg)' } },
      ],
      calcul: (p) => p.masse * Number(p.niveau),
    },
    translocation: {
      nom: 'Translocation', ecole: 'Translocation', nature: 'inspire',
      description: 'Téléporter une masse. Loi inventée : 50 J par kilogramme et par mètre franchi.',
      formule: 'E = m · d · 50',
      params: [
        { id: 'masse', label: 'Masse déplacée', unite: 'kg', def: 70, min: 0 },
        { id: 'distance', label: 'Distance', unite: 'm', def: 10, min: 0 },
      ],
      calcul: (p) => p.masse * p.distance * 50,
    },
    creation: {
      nom: 'Création', ecole: 'Genèse', nature: 'rigoureux',
      description: 'Faire apparaître de la matière ex nihilo. Relativité stricte : quasi impossible.',
      formule: 'E = m · c²',
      params: [
        { id: 'masse', label: 'Masse créée', unite: 'g', def: 1, min: 0, step: 0.1 },
      ],
      calcul: (p) => (p.masse / 1000) * C * C,
    },
  };

  // --- Modificateurs globaux du sort ----------------------------------------
  const PRECISION = { brut: { nom: 'Brut', f: 1 }, precis: { nom: 'Précis', f: 1.5 }, chirurgical: { nom: 'Chirurgical', f: 2.5 } };
  const INCANTATION = {
    instantanee: { nom: 'Instantanée', f: 1.5 },
    normale: { nom: 'Normale', f: 1 },
    rituel: { nom: 'Rituel (10 min)', f: 0.5 },
  };
  const FOCALISATEUR = {
    aucun: { nom: 'Aucun', f: 1 }, simple: { nom: 'Simple (baguette)', f: 0.9 },
    ouvrage: { nom: 'Ouvragé (cristal)', f: 0.8 }, relique: { nom: 'Relique', f: 0.65 },
  };

  // --- Réglages de table (modifiables par le MJ) ----------------------------
  const REGLAGES_DEFAUT = {
    base: 1.6,          // multiplicateur du coût en Éther par ordre de grandeur d'énergie
    porteeRef: 10,      // distance (m) à laquelle le coût est multiplié par 4
    complexite: 0.25,   // surcoût par composante au-delà de la première
    dureeMentale: 1,    // multiplicateur des durées des opérations mentales (ancrage, protection…)
    niveaux: {
      novice:    { nom: 'Novice',    rendement: 0.05, reserve: 20 },
      adepte:    { nom: 'Adepte',    rendement: 0.15, reserve: 40 },
      maitre:    { nom: 'Maître',    rendement: 0.30, reserve: 80 },
      archimage: { nom: 'Archimage', rendement: 0.50, reserve: 160 },
    },
  };

  const CERCLES = [
    { max: 1e2,  nom: 'Cercle 0 — Étincelle' },
    { max: 1e4,  nom: 'Cercle I — Mineur' },
    { max: 1e6,  nom: 'Cercle II — Modéré' },
    { max: 1e8,  nom: 'Cercle III — Majeur' },
    { max: 1e10, nom: 'Cercle IV — Légendaire' },
    { max: Infinity, nom: 'Cercle V — Cataclysmique' },
  ];

  const ECHELLE = [
    { e: 1,      txt: 'soulever une pomme d\'un mètre' },
    { e: 4184,   txt: 'une kilocalorie' },
    { e: 3.3e5,  txt: 'faire bouillir un litre d\'eau' },
    { e: 1e6,    txt: 'un bâton de dynamite' },
    { e: 1e7,    txt: 'une journée de nourriture humaine' },
    { e: 1e9,    txt: 'un éclair d\'orage' },
    { e: 4.2e9,  txt: 'une tonne de TNT' },
    { e: 6.3e13, txt: 'la bombe d\'Hiroshima' },
  ];

  // --- Stockage local (toujours protégé) ------------------------------------
  const store = {
    get(cle, defaut) {
      try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
    },
    set(cle, val) { try { localStorage.setItem(cle, JSON.stringify(val)); return true; } catch { return false; } },
  };

  function reglages() {
    const r = store.get('matrice.reglages', null);
    if (!r) return structuredClone(REGLAGES_DEFAUT);
    return { ...structuredClone(REGLAGES_DEFAUT), ...r, niveaux: { ...structuredClone(REGLAGES_DEFAUT.niveaux), ...(r.niveaux || {}) } };
  }

  // --- Calcul -----------------------------------------------------------------
  function energieComposante(c) {
    const def = EFFETS[c.type];
    if (!def) return 0;
    const p = {};
    for (const prm of def.params) {
      const brut = c.params?.[prm.id] ?? prm.def;
      p[prm.id] = prm.type === 'select' ? brut : Math.max(prm.min ?? -Infinity, Number(brut) || 0);
    }
    const e = def.calcul(p);
    return Number.isFinite(e) && e > 0 ? e : 0;
  }

  function evaluer(sort, R = reglages()) {
    const comps = sort.composantes || [];
    const m = sort.modificateurs || {};
    const details = comps.map((c) => ({ type: c.type, nom: EFFETS[c.type]?.nom, energie: energieComposante(c) }));
    const eEffet = details.reduce((s, d) => s + d.energie, 0);

    const portee = Math.max(0, Number(m.portee) || 0);
    const facteurs = {
      portee: (1 + portee / R.porteeRef) ** 2,
      cibles: Math.max(1, Math.round(Number(m.cibles) || 1)),
      precision: PRECISION[m.precision]?.f ?? 1,
      complexite: 1 + R.complexite * Math.max(0, comps.length - 1),
      incantation: INCANTATION[m.incantation]?.f ?? 1,
      focalisateur: FOCALISATEUR[m.focalisateur]?.f ?? 1,
    };
    const multiplicateur = Object.values(facteurs).reduce((a, b) => a * b, 1);
    const eTissee = eEffet * multiplicateur;

    const niveau = R.niveaux[sort.lanceur?.niveau] || R.niveaux.adepte;
    const rendement = niveau.rendement;
    const reserve = Number(sort.lanceur?.reserve) || niveau.reserve;
    const ePuisee = eTissee / rendement;

    const ether = ePuisee <= 0 ? 0 : Math.max(1, Math.round(R.base ** Math.log10(Math.max(ePuisee, 1))));
    const cercle = CERCLES.find((c) => ePuisee < c.max).nom;
    const ratio = reserve > 0 ? ether / reserve : Infinity;
    let risque;
    if (ether === 0) risque = { niv: 'nul', txt: 'Aucun effet tissé.' };
    else if (ratio <= 0.25) risque = { niv: 'sur', txt: 'Sans danger : le lanceur garde l\'essentiel de ses forces.' };
    else if (ratio <= 0.6) risque = { niv: 'modere', txt: 'Éprouvant : fatigue notable après le lancement.' };
    else if (ratio <= 1) risque = { niv: 'eleve', txt: 'Épuisant : le lanceur est vidé, au bord de la syncope.' };
    else risque = { niv: 'critique', txt: `Contrecoup : la réserve est dépassée de ${ether - reserve} Éther. Le surplus est payé en blessures, voire en vie.` };

    return {
      details, eEffet, facteurs, multiplicateur, eTissee, rendement, ePuisee,
      ether, reserve, ratio, cercle, risque,
      kcal: ePuisee / J_PAR_KCAL,
      comparaison: comparer(ePuisee),
    };
  }

  function comparer(e) {
    if (e <= 0) return '';
    let ref = ECHELLE[0];
    for (const r of ECHELLE) if (r.e <= e) ref = r;
    const n = e / ref.e;
    return `≈ ${n < 10 ? formatNombre(n, 1) : formatNombre(n, 0)} × ${ref.txt}`;
  }

  // --- Formatage ---------------------------------------------------------------
  function formatNombre(n, dec = 0) {
    return n.toLocaleString('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  }
  function formatEnergie(j) {
    if (!Number.isFinite(j)) return '∞';
    if (j === 0) return '0 J';
    const u = [['EJ', 1e18], ['PJ', 1e15], ['TJ', 1e12], ['GJ', 1e9], ['MJ', 1e6], ['kJ', 1e3], ['J', 1], ['mJ', 1e-3], ['µJ', 1e-6]];
    for (const [s, v] of u) if (Math.abs(j) >= v) return `${formatNombre(j / v, j / v < 10 ? 2 : j / v < 100 ? 1 : 0)} ${s}`;
    return `${j.toExponential(1)} J`;
  }

  function nouveauSort() {
    return {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nom: '', ecole: '', description: '',
      blocs: [{ type: 'ancrage', params: { lieu: 'main', distance: 10 } }],
      lanceur: { niveau: 'adepte', reserve: null, focalisateur: 'aucun' },
      version: 2,
    };
  }

  function grimoire() { return store.get('matrice.grimoire', []); }
  function enregistrer(sort) {
    const g = grimoire();
    const i = g.findIndex((s) => s.id === sort.id);
    const copie = structuredClone(sort);
    copie.modifie = new Date().toISOString();
    if (i >= 0) g[i] = copie; else g.push(copie);
    return store.set('matrice.grimoire', g);
  }
  function supprimer(id) { return store.set('matrice.grimoire', grimoire().filter((s) => s.id !== id)); }

  return {
    G, C, MATERIAUX, EFFETS, PRECISION, INCANTATION, FOCALISATEUR, CERCLES, ECHELLE, REGLAGES_DEFAUT,
    store, reglages, evaluer, energieComposante, formatEnergie, formatNombre, nouveauSort,
    grimoire, enregistrer, supprimer,
  };
})();

if (typeof module !== 'undefined') module.exports = { Matrice };
