/* ==========================================================================
   La Matrice Arcanique — moteur de blueprints
   Un sort est une suite de blocs exécutés dans l'ordre. Une simulation suit
   l'état du sort (matière, température, phase, charge, temps, lancement…)
   bloc après bloc, compte l'énergie dépensée et signale les erreurs.
   ========================================================================== */
const Blueprint = (() => {
  const M = Matrice;
  const AMBIANTE = 20; // °C

  const opts = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.nom]));
  const nomMat = (t) => M.MATERIAUX[t]?.nom || t;

  // --- Ancrages ------------------------------------------------------------
  // zone : « tenu » (dans la main ou un objet tenu), « contact » (cible touchée), « corps » (autour de soi),
  //        « proche » (près de soi), « loin » (à distance, coût selon la distance).
  // tol : ce que le corps supporte sans protection · coef : multiplicateur d'énergie des blocs suivants
  // mental : concentration supplémentaire (s) · porteeMult : la distance pèse « porteeMult » fois moins
  const ANCRAGES = {
    main:     { nom: 'Dans la main', zone: 'tenu', tol: { haut: 50, bas: -10 }, qui: 'ta main', ou: 'dans ta main' },
    mains:    { nom: 'Entre les deux mains', zone: 'tenu', tol: { haut: 50, bas: -10 }, qui: 'tes mains', ou: 'entre tes mains', coef: 0.9, mental: 0.1,
                note: 'Les deux mains encadrent le sort : contrôle plus fin (énergie ×0,9), mais elles sont toutes les deux occupées.' },
    doigt:    { nom: 'Au bout du doigt', zone: 'tenu', tol: { haut: 40, bas: -5 }, qui: 'ton doigt', ou: 'au bout de ton doigt',
                note: 'Très précis, idéal pour un trait fin ou une petite quantité ; la peau du doigt supporte moins la chaleur que la paume.' },
    objet:    { nom: 'Dans un objet tenu (arme, bâton…)', zone: 'tenu', tol: { haut: 150, bas: -40 }, qui: 'ta main (à travers l\'objet)', ou: 'dans l\'objet que tu tiens', mental: 0.1,
                note: 'L\'objet fait tampon : la main supporte jusqu\'à 150 °C, mais l\'objet lui-même peut s\'abîmer.' },
    contact:  { nom: 'Sur une cible touchée', zone: 'contact', tol: { haut: 50, bas: -10 }, qui: 'ta main', ou: 'sur ta cible, sous ta main', mental: 0.2,
                note: 'Le sort naît dans ce que tu touches : aucune perte de distance, mais il faut atteindre la cible, et ta main reste au contact.' },
    corps:    { nom: 'Autour de soi (aura)', zone: 'corps', tol: { haut: 45, bas: -5 }, qui: 'ton corps', ou: 'tout autour de toi', coef: 1.2, mental: 0.2,
                note: 'Le sort enveloppe tout le corps (énergie ×1,2) : parfait pour une protection ou une lévitation, dangereux pour tout le reste.' },
    pieds:    { nom: 'Au sol, à ses pieds', zone: 'proche', tol: { haut: 150, bas: -40 }, qui: 'tes jambes', ou: 'à tes pieds',
                note: 'Le sol sert d\'appui et de réserve de matière ; le sort reste assez proche pour que les jambes en souffrent.' },
    devant:   { nom: 'Devant soi (1 m)', zone: 'proche', tol: { haut: 250, bas: -60 }, qui: 'ton corps', ou: 'à un mètre de toi' },
    dessus:   { nom: 'Au-dessus de soi (3 m)', zone: 'proche', tol: { haut: 600, bas: -150 }, qui: 'ton corps', ou: 'au-dessus de ta tête', distanceFixe: 3,
                note: 'Hors de portée de main, mais tout ce qui tombe ou rayonne vers le bas te concerne.' },
    distance: { nom: 'À distance (point visible)', zone: 'loin', variable: true, ou: 'à distance' },
    creature: { nom: 'Sur une créature visée', zone: 'loin', variable: true, coef: 1.15, mental: 0.3, ou: 'sur ta cible',
                note: 'Le sort suit la créature : il faut la garder en vue jusqu\'au lancement (énergie ×1,15). Elle peut tenter de résister.' },
    rune:     { nom: 'Sur une rune préparée', zone: 'loin', variable: true, porteeMult: 3, mental: 0.5, ou: 'sur la rune',
                note: 'Une rune tracée à l\'avance sert de relais : la distance pèse trois fois moins. Le tracé se fait avant, hors incantation.' },
    lien:     { nom: 'Sur un objet lié (focus personnel)', zone: 'loin', variable: true, porteeMult: 6, mental: 0.3, coef: 1.1, ou: 'sur l\'objet lié',
                note: 'Un objet longuement lié au lanceur : la distance pèse six fois moins, mais l\'entretien du lien coûte un peu (énergie ×1,1).' },
  };
  const ancrageDe = (cle) => ANCRAGES[cle] || ANCRAGES.main;

  // --- Modes de libération -----------------------------------------------------
  // rend : part de l'énergie contenue réellement délivrée · retour : part qui frappe le lanceur si le sort est encore près de lui
  // parts : composantes délivrées (thermique, cinétique, électrique) · zone : touche une zone plutôt qu'une cible
  const LIBERATIONS = {
    explosion:    { nom: 'Explosion (zone)', rend: 1, retour: 1, zone: true },
    contact:      { nom: 'Impact (une cible)', rend: 1, retour: 1 },
    perforation:  { nom: 'Perforation (point concentré)', rend: 0.9, retour: 0.5,
                    note: 'Toute l\'énergie se concentre sur quelques centimètres carrés : idéal pour traverser une armure ou une paroi, inutile pour toucher large.' },
    cone:         { nom: 'Souffle en cône', rend: 0.7, retour: 0.15, zone: true,
                    note: 'Projetée vers l\'avant : 30 % se perdent sur les côtés, mais très peu revient vers le lanceur.' },
    onde:         { nom: 'Onde de choc (renversement)', rend: 0.5, retour: 1, zone: true,
                    note: 'Tout est converti en poussée : seule la moitié de l\'énergie agit, mais tout ce qui est dans la zone est projeté au sol.' },
    implosion:    { nom: 'Implosion (écrasement)', rend: 0.8, retour: 0.1, confine: true,
                    note: 'Le confinement se referme au lieu de se rompre : la cible est écrasée vers le centre et presque rien ne s\'échappe autour.' },
    rayonnement:  { nom: 'Rayonnement (chaleur et lumière)', rend: 1, retour: 1, zone: true, parts: { th: 1, ci: 0, el: 0 },
                    note: 'Seule la chaleur est délivrée, en un éclair de rayonnement : brûle et éblouit toute la zone, sans souffle ni impact.' },
    eclats:       { nom: 'Éclats (fragmentation)', rend: 0.85, retour: 1, zone: true, solide: true, fragments: 20,
                    note: 'La matière solide vole en une vingtaine d\'éclats tranchants : moins d\'énergie par impact, beaucoup plus de cibles touchées.' },
    arc:          { nom: 'Arc électrique (en chaîne)', rend: 1, retour: 1, parts: { th: 0, ci: 0, el: 1 }, charge: true,
                    note: 'Seule la charge est délivrée, en un arc qui saute de cible en cible en perdant de sa force à chaque saut.' },
    brasier:      { nom: 'Combustion prolongée (brasier)', rend: 1, retour: 1, zone: true, duree: true,
                    note: 'L\'énergie s\'écoule pendant la durée choisie : moins violent qu\'une explosion, mais tout ce qui reste dans la zone brûle.' },
    impregnation: { nom: 'Imprégnation d\'un objet', rend: 0.9, retour: 0,
                    note: 'L\'énergie passe dans un objet touché (lame chauffée au rouge, pierre chargée…) au lieu d\'être relâchée : elle s\'en dissipera à son rythme.' },
    reabsorption: { nom: 'Réabsorption (récupérer l\'énergie)', rend: 0, retour: 0, recup: 0.3,
                    note: 'Le lanceur reprend le sort en lui : environ 30 % de l\'énergie contenue reviennent dans sa réserve, rien n\'est délivré.' },
    dissipation:  { nom: 'Dissipation douce', rend: 0, retour: 0,
                    note: 'L\'énergie se disperse lentement dans l\'environnement, sans effet notable.' },
  };
  const estProche = (cle) => ancrageDe(cle).zone !== 'loin';
  // Tolérance du corps sans protection, par ancrage (utilisée aussi par la courbe de la forge)
  const TOLERANCE = Object.fromEntries(Object.entries(ANCRAGES).filter(([, a]) => a.tol).map(([k, a]) => [k, a.tol]));

  // --- Familles de blocs (ordre de la palette) ------------------------------
  const FAMILLES = {
    fondation: 'Fondation',
    matiere: 'Matière',
    energie: 'Énergie',
    mouvement: 'Mouvement',
    protection: 'Protection',
    controle: 'Contrôle & perception',
  };

  // --- Physique de la matière -----------------------------------------------
  const PHASE_DEFAUT = { air: 'gaz', vapeur: 'gaz', eau: 'liquide', huile: 'liquide' }; // sinon solide
  const famille = (t) => (['eau', 'glace', 'vapeur'].includes(t) ? 'eau' : t);
  // Points de changement d'état et chaleurs latentes (J/kg)
  const TRANSITIONS = {
    eau:    { fusion: { T: 0, L: 334e3 },    ebullition: { T: 100, L: 2257e3 } },
    fer:    { fusion: { T: 1538, L: 247e3 }, ebullition: { T: 2862, L: 6090e3 } },
    or:     { fusion: { T: 1064, L: 64e3 },  ebullition: { T: 2856, L: 1645e3 } },
    pierre: { fusion: { T: 1200, L: 400e3 } },
    air:    { ebullition: { T: -194, L: 200e3 } },
    huile:  { ebullition: { T: 300, L: 300e3 } },
  };
  const COMBUSTIBLES = {
    bois:    { pci: 15e6, ignition: 300, flamme: 1100 },
    charbon: { pci: 30e6, ignition: 400, flamme: 1400 },
    huile:   { pci: 42e6, ignition: 250, flamme: 1900 },
  };
  const FORMES = {
    sphere: { nom: 'Sphère', pertes: 1, txt: 'une sphère' },
    lance:  { nom: 'Lance / javelot', pertes: 1.3, txt: 'une lance perforante' },
    disque: { nom: 'Disque tranchant', pertes: 1.8, txt: 'un disque tranchant' },
    cone:   { nom: 'Cône (souffle)', pertes: 3, txt: 'un cône de souffle' },
    mur:    { nom: 'Mur', pertes: 4, txt: 'un mur' },
    nuage:  { nom: 'Nuage', pertes: 6, txt: 'un nuage' },
  };
  const phaseDe = (m) => m.phase || PHASE_DEFAUT[m.type] || 'solide';

  // Prochain point de changement d'état rencontré en chauffant (sens +1) ou en refroidissant (sens −1)
  function barriere(e, sens) {
    if (!e.matiere) return null;
    const tr = TRANSITIONS[famille(e.matiere.type)];
    if (!tr) return null;
    const ph = phaseDe(e.matiere);
    if (sens > 0) {
      if (ph === 'solide' && tr.fusion) return { T: tr.fusion.T, txt: 'de fusion' };
      if (ph === 'liquide' && tr.ebullition) return { T: tr.ebullition.T, txt: 'd\'ébullition' };
    } else {
      if (ph === 'liquide' && tr.fusion) return { T: tr.fusion.T, txt: 'de solidification' };
      if (ph === 'gaz' && tr.ebullition) return { T: tr.ebullition.T, txt: 'de condensation' };
    }
    return null;
  }

  function changerPhase(m, phase) {
    m.phase = phase;
    if (famille(m.type) === 'eau') m.type = phase === 'solide' ? 'glace' : phase === 'gaz' ? 'vapeur' : 'eau';
  }

  function majConfinement(e) {
    if (e.confine && e.matiere) e.entretiens.confinement = 500 * Math.max(0.1, e.matiere.masse);
    if (e.cache) e.entretiens.dissimulation = 200 * Math.max(0.1, e.matiere?.masse || 0.1);
    if (e.levite) e.entretiens.levitation = 9.81 * (e.matiere?.masse || 0);
  }

  function nouvelleMatiere(e, type, masse) {
    if (e.matiere && famille(e.matiere.type) === famille(type) && phaseDe(e.matiere) === (PHASE_DEFAUT[type] || 'solide')) {
      // même matière : on mélange (température pondérée)
      const m0 = e.matiere.masse;
      e.T = (e.T * m0 + AMBIANTE * masse) / (m0 + masse);
      e.matiere.masse += masse;
    } else {
      e.matiere = { type, masse, phase: PHASE_DEFAUT[type] || 'solide' };
      e.T = AMBIANTE;
    }
    majConfinement(e);
  }

  // --- Blocs ---------------------------------------------------------------
  // appliquer(etat, params, ctx) : modifie l'état ; ctx.energie(), ctx.evoluer(), ctx.mental(), ctx.alerte()
  // ctx.mental() = opération de pure concentration : brève, ajustable par le réglage « durée des opérations mentales »
  const BLOCS = {
    /* ===================== FONDATION ===================== */
    ancrage: {
      fam: 'fondation', nom: 'Ancrage', ecole: 'Fondation', nature: 'inspire', couleur: '#8a93b8',
      description: 'Point d\'origine du sort. Tout blueprint commence ici. Plus l\'ancrage est loin, plus chaque bloc coûte cher.',
      formule: 'à distance : énergie × (1 + d / portée_ref)²',
      params: [
        { id: 'lieu', label: 'Lieu', type: 'select', def: 'main', options: opts(ANCRAGES) },
        { id: 'distance', label: 'Distance', unite: 'm', def: 10, min: 0, si: (p) => !!ancrageDe(p.lieu).variable },
      ],
      appliquer(e, p, ctx) {
        if (e.ancre) { ctx.alerte('attention', 'Ancrage répété : seul le premier compte.'); return; }
        const a = ancrageDe(p.lieu);
        e.ancre = ANCRAGES[p.lieu] ? p.lieu : 'main';
        const dist = a.variable ? (1 + p.distance / (ctx.R.porteeRef * (a.porteeMult || 1))) ** 2 : 1;
        e.facteurDistance = dist * (a.coef || 1);
        if (a.note) ctx.alerte('info', a.note);
        if (a.variable || a.coef) ctx.alerte('info', `Ancrage ${a.variable ? `à ${p.distance} m ` : ''}: tous les blocs suivants coûtent ×${M.formatNombre(e.facteurDistance, 2)} jusqu'au lancement.`);
        ctx.energie(10);
        ctx.mental(0.1 + (a.mental || 0));
      },
    },
    attendre: {
      fam: 'fondation', nom: 'Attendre', ecole: 'Fondation', nature: 'rigoureux', couleur: '#8a93b8',
      description: 'Laisser passer du temps. Sans maintien, la matière se rapproche de la température ambiante ; avec maintien, on compense les pertes.',
      formule: 'maintien : P = h · (T − T_amb)',
      params: [
        { id: 'duree', label: 'Durée', unite: 's', def: 5, min: 0 },
        { id: 'maintenir', label: 'Température', type: 'select', def: 'oui', options: { oui: 'Maintenue', non: 'Laissée libre' } },
      ],
      appliquer(e, p, ctx) {
        if (p.maintenir === 'oui' && e.matiere) {
          const P = ctx.pertes() * (e.T - AMBIANTE);
          ctx.energie(Math.abs(P) * p.duree);
          ctx.evoluer(p.duree, P);
        } else ctx.evoluer(p.duree);
      },
    },
    retardement: {
      fam: 'fondation', nom: 'Retardement / piège', ecole: 'Fondation', nature: 'mixte', couleur: '#8a93b8',
      description: 'Le sort reste en suspens jusqu\'à un déclencheur. Tout ce qui s\'entretient (confinement, charge…) continue de coûter pendant l\'attente : un piège coûteux à maintenir s\'épuise vite.',
      formule: 'E = Σ entretiens × attente',
      params: [
        { id: 'declencheur', label: 'Déclencheur', type: 'select', def: 'proximite', options: { duree: 'Après un délai', contact: 'Au contact', proximite: 'À l\'approche d\'un être vivant', mot: 'Sur un mot de commande' } },
        { id: 'attente', label: 'Attente prévue', unite: 's', def: 60, min: 0 },
      ],
      appliquer(e, p, ctx) {
        e.piege = p.declencheur;
        e.tempsCharge ??= e.t; // l'attente du piège ne compte pas dans le temps d'incantation
        const W = ctx.puissanceEntretien();
        if (W > 0) ctx.alerte('info', `Pendant l'attente, le sort consomme ${M.formatEnergie(W * 60)} par minute en entretiens.`);
        if (!e.lance && ['tenu', 'contact'].includes(ancrageDe(e.ancre).zone) && p.attente > 10) ctx.alerte('attention', `Un piège ancré ${ancrageDe(e.ancre).ou} immobilise le lanceur : ancre-le devant toi, au sol ou à distance.`);
        ctx.evoluer(p.attente);
      },
    },
    liberation: {
      fam: 'fondation', nom: 'Libération', ecole: 'Fondation', nature: 'rigoureux', couleur: '#e2565a',
      description: 'Relâche toute l\'énergie contenue dans le sort : le confinement se rompt, la chaleur, le mouvement et la charge se déchargent sur la cible.',
      formule: 'E délivrée = m·c·|T − T_amb| + ½·m·v² + charge',
      params: [
        { id: 'mode', label: 'Forme', type: 'select', def: 'explosion', options: opts(LIBERATIONS) },
        { id: 'duree', label: 'Durée du brasier', unite: 's', def: 10, min: 1, si: (p) => !!LIBERATIONS[p.mode]?.duree },
        { id: 'cibles', label: 'Cibles en chaîne', def: 3, min: 1, si: (p) => !!LIBERATIONS[p.mode]?.charge },
      ],
      appliquer(e, p, ctx) {
        const m = e.matiere?.masse || 0, c = e.matiere ? M.MATERIAUX[e.matiere.type].c : 0;
        const th = m * c * Math.abs(e.T - AMBIANTE), ci = e.lance ? 0.5 * m * e.v ** 2 : 0, el = e.charge;
        const contenu = th + ci + el;
        let cle = LIBERATIONS[p.mode] ? p.mode : 'explosion';
        // conditions : sinon on retombe sur une explosion
        if (LIBERATIONS[cle].confine && !e.confine) { ctx.alerte('attention', 'Sans confinement, rien ne peut se refermer : l\'implosion devient une simple explosion.'); cle = 'explosion'; }
        if (LIBERATIONS[cle].solide && phaseDe(e.matiere || {}) !== 'solide') { ctx.alerte('attention', 'Seule une matière solide peut voler en éclats : le sort explose normalement.'); cle = 'explosion'; }
        if (LIBERATIONS[cle].charge && !(el > 0)) ctx.alerte('attention', 'Le sort ne porte aucune charge électrique : l\'arc n\'a rien à transporter.');
        const L = LIBERATIONS[cle];
        const parts = L.parts || { th: 1, ci: 1, el: 1 };
        const total = (th * parts.th + ci * parts.ci + el * parts.el) * L.rend;
        const fragments = e.fragments * (L.fragments || 1);
        e.livraison = { thermique: th * parts.th * L.rend, cinetique: ci * parts.ci * L.rend, electrique: el * parts.el * L.rend, total, mode: cle, forme: e.forme, fragments };
        e.libere = true;
        e.tempsCharge ??= e.t;
        if (L.note) ctx.alerte('info', L.note);
        // ce que le lanceur encaisse s'il est encore au contact du sort
        const contactCible = ancrageDe(e.ancre).zone === 'contact' && ['contact', 'perforation', 'impregnation'].includes(cle);
        const subi = contenu * L.rend * L.retour;
        if (!e.lance && estProche(e.ancre) && !contactCible && subi > 1000)
          ctx.alerte('danger', `La libération a lieu ${ancrageDe(e.ancre).ou} : tu encaisses ${M.formatEnergie(subi)}.`);
        if (L.recup) {
          if (e.lance || !estProche(e.ancre)) ctx.alerte('attention', 'Le sort est trop loin de toi pour être réabsorbé : son énergie se perd.');
          else { ctx.rendre(contenu * L.recup); ctx.alerte('info', `Tu récupères environ ${M.formatEnergie(contenu * L.recup)}.`); }
        }
        if (L.duree && total > 0) ctx.alerte('info', `Le brasier délivre environ ${M.formatEnergie(total / p.duree)} par seconde pendant ${p.duree} s.`);
        if (L.charge && el > 0 && p.cibles > 1) {
          const k = 0.6, parts2 = Array.from({ length: p.cibles }, (_, i) => k ** i), somme = parts2.reduce((a, b) => a + b, 0);
          ctx.alerte('info', `Arc sur ${p.cibles} cibles : ${parts2.map((f) => M.formatEnergie(total * f / somme)).join(', ')}.`);
        }
        if (fragments > 1 && total > 0) ctx.alerte('info', `${fragments} impacts d'environ ${M.formatEnergie(total / fragments)} chacun.`);
        if (e.piege) ctx.alerte('info', `Se déclenche ${({ duree: 'après le délai', contact: 'au contact', proximite: 'à l\'approche d\'un être vivant', mot: 'sur le mot de commande' })[e.piege]}.`);
        e.entretiens = {};
      },
    },

    /* ===================== MATIÈRE ===================== */
    rassembler: {
      fam: 'matiere', nom: 'Rassembler la matière', ecole: 'Fondation', nature: 'inspire', couleur: '#a3a08a',
      description: 'Attirer et condenser de la matière ambiante au point d\'ancrage (air, eau d\'une source, pierre du sol, bois, charbon…). Loi inventée : 300 J par kilogramme.',
      formule: 'E = m · 300 J/kg',
      params: [
        { id: 'matiere', label: 'Matière', type: 'select', def: 'air', options: Object.fromEntries(['air', 'eau', 'pierre', 'bois', 'charbon', 'fer', 'huile'].map((k) => [k, nomMat(k)])) },
        { id: 'masse', label: 'Masse', unite: 'kg', def: 1, min: 0.001, step: 0.1 },
      ],
      appliquer(e, p, ctx) {
        if (e.matiere && famille(e.matiere.type) !== famille(p.matiere)) ctx.alerte('attention', `La matière déjà présente (${nomMat(e.matiere.type).toLowerCase()}) est remplacée.`);
        nouvelleMatiere(e, p.matiere, p.masse);
        ctx.energie(p.masse * 300);
        ctx.mental(0.2 + 0.05 * p.masse);
      },
    },
    condenser: {
      fam: 'matiere', nom: 'Condenser l\'humidité', ecole: 'Hydromancie', nature: 'rigoureux', couleur: '#5fa8d3',
      description: 'Extraire l\'eau contenue dans l\'air (environ 10 g par m³). Il faut évacuer la chaleur latente de condensation : faire apparaître de l\'eau dans un désert coûte cher.',
      formule: 'E = m · (2 257 kJ/kg + 30 kJ/kg)',
      params: [{ id: 'masse', label: 'Masse d\'eau', unite: 'g', def: 300, min: 1, step: 10 }],
      appliquer(e, p, ctx) {
        const kg = p.masse / 1000;
        nouvelleMatiere(e, 'eau', kg);
        ctx.energie(kg * (2257e3 + 30e3));
        ctx.alerte('info', `Environ ${M.formatNombre(kg * 100, 0)} m³ d'air sont asséchés autour du point d'ancrage.`);
        ctx.mental(0.3 + 0.5 * kg);
      },
    },
    creer: {
      fam: 'matiere', nom: 'Créer la matière', ecole: 'Genèse', nature: 'rigoureux', couleur: '#c79bf0',
      description: 'Faire apparaître de la matière ex nihilo. Relativité stricte : un gramme coûte autant qu\'une bombe atomique.',
      formule: 'E = m · c²',
      params: [
        { id: 'matiere', label: 'Matière', type: 'select', def: 'eau', options: opts(M.MATERIAUX) },
        { id: 'masse', label: 'Masse', unite: 'g', def: 1, min: 0, step: 0.1 },
      ],
      appliquer(e, p, ctx) {
        const kg = p.masse / 1000;
        nouvelleMatiere(e, p.matiere, kg);
        ctx.energie(kg * M.C * M.C);
        ctx.mental(0.3);
      },
    },
    etat: {
      fam: 'matiere', nom: 'Changer d\'état', ecole: 'Transmutation', nature: 'rigoureux', couleur: '#5fa8d3',
      description: 'Faire fondre, geler, vaporiser ou condenser la matière. Il faut d\'abord l\'amener à son point de changement d\'état ; la température reste fixe pendant la transformation.',
      formule: 'E = m · L   ·   durée = m · L / P',
      params: [
        { id: 'transition', label: 'Transformation', type: 'select', def: 'solidifier', options: { fondre: 'Fondre (solide → liquide)', solidifier: 'Geler / solidifier (liquide → solide)', vaporiser: 'Vaporiser (liquide → gaz)', condenser: 'Condenser (gaz → liquide)' } },
        { id: 'puissance', label: 'Puissance', unite: 'kW', def: 20, min: 0.001, step: 5 },
      ],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Aucune matière à transformer.'); return; }
        const def = { fondre: ['solide', 'liquide', 'fusion'], solidifier: ['liquide', 'solide', 'fusion'], vaporiser: ['liquide', 'gaz', 'ebullition'], condenser: ['gaz', 'liquide', 'ebullition'] }[p.transition];
        const tr = TRANSITIONS[famille(e.matiere.type)]?.[def[2]];
        const ph = phaseDe(e.matiere);
        if (!tr) { ctx.alerte('danger', `${nomMat(e.matiere.type)} ne connaît pas cette transformation (elle brûle ou se décompose avant).`); return; }
        if (ph !== def[0]) { ctx.alerte('danger', `La matière est ${ph}, pas ${def[0]} : transformation impossible.`); return; }
        if (Math.abs(e.T - tr.T) > 2) { ctx.alerte('danger', `Il faut d'abord porter la matière à ${M.formatNombre(tr.T, 0)} °C (elle est à ${M.formatNombre(e.T, 0)} °C). Ajoute un bloc « Chauffer / refroidir » avant.`); return; }
        const E = e.matiere.masse * tr.L;
        const t = E / (p.puissance * 1000);
        ctx.energie(E);
        ctx.evoluer(t, 0, { fixe: true });
        changerPhase(e.matiere, def[1]);
        e.T = tr.T;
        ctx.alerte('info', `${M.formatEnergie(E)} de chaleur latente ${def[1] === 'solide' || (def[0] === 'gaz') ? 'extraits' : 'apportés'} en ${M.formatNombre(t, 1)} s : la matière est maintenant ${def[1]}.`);
      },
    },
    faconner: {
      fam: 'matiere', nom: 'Façonner', ecole: 'Transmutation', nature: 'inspire', couleur: '#a3a08a',
      description: 'Donne une forme à la matière. Les formes étalées offrent plus de surface : elles perdent leur chaleur plus vite mais couvrent une zone plus large.',
      formule: 'E = 50 J/kg   ·   pertes × facteur de forme',
      params: [{ id: 'forme', label: 'Forme', type: 'select', def: 'lance', options: opts(FORMES) }],
      appliquer(e, p, ctx) {
        if (!e.matiere) ctx.alerte('attention', 'Il n\'y a pas encore de matière à façonner.');
        e.forme = p.forme;
        ctx.energie(50 * Math.max(0.1, e.matiere?.masse || 0.1));
        ctx.mental(0.2);
      },
    },
    fragmenter: {
      fam: 'matiere', nom: 'Fragmenter', ecole: 'Transmutation', nature: 'rigoureux', couleur: '#a3a08a',
      description: 'Divise la matière en plusieurs projectiles. Plus de fragments, c\'est plus de surface totale : la chaleur s\'échappe plus vite (×N^⅓).',
      formule: 'E = 20 J par fragment   ·   pertes × N^(1/3)',
      params: [{ id: 'nombre', label: 'Nombre de fragments', def: 8, min: 2, step: 1 }],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Rien à fragmenter.'); return; }
        e.fragments = Math.max(1, Math.round(e.fragments * p.nombre));
        ctx.energie(20 * p.nombre);
        ctx.mental(0.2);
        if (e.lance) ctx.alerte('info', 'Fragmentation en vol : le sort éclate en gerbe.');
      },
    },
    compresser: {
      fam: 'matiere', nom: 'Compresser', ecole: 'Kinésie', nature: 'rigoureux', couleur: '#a3a08a',
      description: 'Comprime un gaz confiné. Compression adiabatique réelle : le gaz s\'échauffe tout seul, et l\'énergie de compression est restituée à la libération.',
      formule: 'T₂ = T₁ · r^0,4   ·   E = m · c_v · (T₂ − T₁)',
      params: [{ id: 'ratio', label: 'Rapport de compression', unite: '×', def: 10, min: 1.1, step: 1 }],
      appliquer(e, p, ctx) {
        if (!e.matiere || phaseDe(e.matiere) !== 'gaz') { ctx.alerte('danger', 'Seul un gaz se comprime. Rassemble de l\'air ou vaporise de l\'eau.'); return; }
        if (!e.confine) { ctx.alerte('danger', 'Sans confinement, le gaz comprimé s\'échappe aussitôt. Ajoute un « Confinement » avant.'); return; }
        const T1 = e.T + 273.15, T2 = T1 * p.ratio ** 0.4;
        const W = e.matiere.masse * (M.MATERIAUX[e.matiere.type].c / 1.4) * (T2 - T1);
        e.pression *= p.ratio ** 1.4;
        e.T = T2 - 273.15;
        ctx.energie(W);
        ctx.mental(0.3);
        ctx.alerte('info', `Le gaz monte à ${M.formatNombre(e.T, 0)} °C sous ~${M.formatNombre(e.pression, 0)} atm.`);
      },
    },

    /* ===================== ÉNERGIE ===================== */
    chaleur: {
      fam: 'energie', nom: 'Chauffer / refroidir', ecole: 'Pyromancie / Cryomancie', nature: 'rigoureux', couleur: '#e8904e',
      description: 'Injecte (ou retire) de la chaleur à une puissance donnée jusqu\'à la température voulue. Le temps dépend des pertes, et la matière s\'arrête à ses points de fusion ou d\'ébullition.',
      formule: 'm·c·dT/dt = ±P − h·(T − T_amb)',
      params: [
        { id: 'puissance', label: 'Puissance', unite: 'kW', def: 200, min: 0.001, step: 10 },
        { id: 'cible', label: 'Température visée', unite: '°C', def: 800, step: 50 },
      ],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Rien à chauffer : la chaleur se dissipe dans le vide. Ajoute de la matière avant.'); return; }
        const P = p.puissance * 1000;
        const m = e.matiere.masse, c = M.MATERIAUX[e.matiere.type].c;
        const h = ctx.pertes(), tau = (m * c) / h;
        const T0 = e.T;
        let Tc = p.cible;
        if (Math.abs(Tc - T0) < 0.5) { ctx.alerte('info', 'La matière est déjà à cette température.'); return; }
        const s = Math.sign(Tc - T0);
        const b = barriere(e, s);
        if (b && (s > 0 ? Tc > b.T : Tc < b.T)) {
          ctx.alerte('attention', `La matière s'arrête à ${M.formatNombre(b.T, 0)} °C, son point ${b.txt}. Ajoute « Changer d'état » pour aller plus loin.`);
          Tc = b.T;
        }
        if (Math.abs(Tc - T0) < 0.5) return;
        const Teq = AMBIANTE + (s * P) / h;
        let t;
        if ((s > 0 && Tc >= Teq) || (s < 0 && Tc <= Teq)) {
          t = tau * Math.log(20);
          ctx.alerte('attention', `Puissance insuffisante : les pertes égalent la puissance vers ${M.formatNombre(Teq, 0)} °C. Augmente la puissance ou ajoute un confinement.`);
        } else t = tau * Math.log((T0 - Teq) / (Tc - Teq));
        ctx.energie(P * t);
        ctx.evoluer(t, s * P, { plafond: Tc });
        if (!e.confine && Math.abs(e.T - AMBIANTE) > 200) ctx.alerte('info', `Sans confinement, ${M.formatNombre(h * Math.abs(e.T - AMBIANTE) / 1000, 1)} kW s'échappent en permanence à cette température.`);
      },
    },
    embraser: {
      fam: 'energie', nom: 'Embraser', ecole: 'Pyromancie', nature: 'rigoureux', couleur: '#e8904e',
      description: 'Enflamme un combustible (bois, charbon, huile) déjà porté à sa température d\'ignition. La combustion libère son énergie chimique gratuitement — mais elle consomme la matière et a besoin d\'air.',
      formule: 'Q = fraction · m · PCI   (bois 15, charbon 30, huile 42 MJ/kg)',
      params: [
        { id: 'fraction', label: 'Part brûlée', unite: '%', def: 50, min: 1, step: 5 },
        { id: 'duree', label: 'Durée de combustion', unite: 's', def: 3, min: 0.1, step: 0.5 },
      ],
      appliquer(e, p, ctx) {
        const cb = e.matiere && COMBUSTIBLES[e.matiere.type];
        if (!cb) { ctx.alerte('danger', `${e.matiere ? nomMat(e.matiere.type) : 'Le vide'} ne brûle pas. Rassemble du bois, du charbon ou de l'huile.`); return; }
        if (e.T < cb.ignition) { ctx.alerte('danger', `Trop froid pour s'enflammer : chauffe d'abord à ${cb.ignition} °C (température d'ignition).`); return; }
        const frac = Math.min(100, p.fraction) / 100;
        let Q = frac * e.matiere.masse * cb.pci;
        if (e.confine) { Q *= 0.3; ctx.alerte('attention', 'La bulle de confinement étouffe la flamme : sans air frais, seuls 30 % du combustible brûlent vraiment.'); }
        ctx.energie(200);
        ctx.evoluer(p.duree, Q / p.duree, { plafond: cb.flamme });
        e.matiere.masse *= 1 - frac * 0.9;
        majConfinement(e);
        ctx.alerte('info', `La combustion fournit ${M.formatEnergie(Q)} sans rien coûter au lanceur ; la flamme plafonne vers ${cb.flamme} °C.`);
      },
    },
    charger: {
      fam: 'energie', nom: 'Charger électriquement', ecole: 'Électromancie', nature: 'mixte', couleur: '#e0d35a',
      description: 'Accumule une charge électrique dans le sort (rendement 80 %). La charge fuit en permanence et doit être entretenue ; tenue dans la main sans protection, elle électrocute le lanceur.',
      formule: 'E = charge / 0,8   ·   entretien = 2 % de la charge par seconde',
      params: [{ id: 'charge', label: 'Énergie stockée', unite: 'kJ', def: 50, min: 0.001, step: 5 }],
      appliquer(e, p, ctx) {
        const J = p.charge * 1000;
        e.charge += J;
        e.entretiens.charge = 0.02 * e.charge;
        ctx.energie(J / 0.8);
        ctx.mental(0.2);
      },
    },
    illuminer: {
      fam: 'energie', nom: 'Illuminer', ecole: 'Lumen', nature: 'rigoureux', couleur: '#f1e3a3',
      description: 'Le sort émet de la lumière tant qu\'il existe (y compris en vol). Pratique pour éclairer, ou pour aveugler à l\'impact.',
      formule: 'entretien = P lumineuse',
      params: [{ id: 'puissance', label: 'Intensité', type: 'select', def: '10', options: { '1': 'Bougie (1 W)', '10': 'Torche (10 W)', '60': 'Lanterne (60 W)', '1000': 'Projecteur (1 kW)', '100000': 'Aveuglant (100 kW)' } }],
      appliquer(e, p, ctx) {
        e.lumiere = Number(p.puissance);
        e.entretiens.lumiere = e.lumiere;
        if (e.cache) ctx.alerte('attention', 'Un sort dissimulé qui brille… se voit quand même.');
        ctx.energie(10);
        ctx.mental(0.1);
      },
    },
    onde: {
      fam: 'energie', nom: 'Onde de choc', ecole: 'Kinésie', nature: 'mixte', couleur: '#62d6c6',
      description: 'Une poussée d\'air brutale émise depuis la position du sort (rendement 50 %). Émise près de soi sans bouclier cinétique, elle frappe aussi le lanceur.',
      formule: 'E = énergie de l\'onde / 0,5',
      params: [{ id: 'energie', label: 'Énergie de l\'onde', unite: 'kJ', def: 20, min: 0.001, step: 5 }],
      appliquer(e, p, ctx) {
        const J = p.energie * 1000;
        ctx.energie(J / 0.5);
        if (!e.lance && estProche(e.ancre) && e.bouclier < J)
          ctx.alerte('danger', `Tu es au centre de l'onde : ${M.formatEnergie(J)} te frappent${e.bouclier ? ` (ton bouclier n'en arrête que ${M.formatEnergie(e.bouclier)})` : '. Ajoute un « Bouclier cinétique » avant'}.`);
        else ctx.alerte('info', `Repousse tout ce qui entoure le sort avec ${M.formatEnergie(J)}.`);
        ctx.mental(0.1);
      },
    },
    effet: {
      fam: 'energie', nom: 'Effet direct', ecole: 'Toutes', nature: 'mixte', couleur: '#d6a95e',
      description: 'Un effet élémentaire appliqué d\'un coup au point d\'ancrage (lumière, soin, foudre, bouclier…), pour ce qui ne demande pas de construction pas à pas.',
      params: [{ id: 'effet', label: 'Effet', type: 'select', def: 'lumiere', options: opts(M.EFFETS) }],
      appliquer(e, p, ctx) {
        ctx.energie(M.energieComposante({ type: p.effet, params: p }));
        ctx.mental(0.2);
      },
    },

    /* ===================== MOUVEMENT ===================== */
    mouvement: {
      fam: 'mouvement', nom: 'Imprégner de mouvement', ecole: 'Kinésie', nature: 'rigoureux', couleur: '#62d6c6',
      description: 'Donne une vitesse à la matière et l\'envoie vers la cible. Le sort quitte le lanceur : les protections se relâchent. Pendant le vol, la chaleur continue de s\'échapper.',
      formule: 'E = ½ · m · v²   ·   vol = d / v',
      params: [
        { id: 'vitesse', label: 'Vitesse', unite: 'm/s', def: 25, min: 0.1 },
        { id: 'distance', label: 'Distance de la cible', unite: 'm', def: 20, min: 0 },
      ],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Il n\'y a aucune matière à mettre en mouvement.'); return; }
        if (e.lance) { ctx.alerte('danger', 'Le sort est déjà lancé.'); return; }
        ctx.energie(0.5 * e.matiere.masse * p.vitesse ** 2);
        ctx.lancer(p.distance);
        e.v = p.vitesse;
        if (p.distance > 30 && !e.vise && !e.guide) ctx.alerte('attention', 'À plus de 30 m sans « Viser » ni « Guidage », le projectile a de bonnes chances de manquer.');
        const T0 = e.T;
        ctx.evoluer(p.distance / p.vitesse);
        const fluide = ['air', 'vapeur', 'eau'].includes(e.matiere.type);
        if (!e.confine && Math.abs(T0 - AMBIANTE) > 100 && fluide)
          ctx.alerte('attention', `Sans confinement, la masse se disperse en vol : elle arrive à ${M.formatNombre(e.T, 0)} °C au lieu de ${M.formatNombre(T0, 0)} °C.`);
        else if (Math.abs(T0 - e.T) > 20)
          ctx.alerte('info', `La matière refroidit pendant le vol : ${M.formatNombre(T0, 0)} °C au départ, ${M.formatNombre(e.T, 0)} °C à l'impact (après ${M.formatNombre(p.distance / p.vitesse, 2)} s).`);
        else ctx.alerte('info', `Impact après ${M.formatNombre(p.distance / p.vitesse, 2)} s de vol.`);
      },
    },
    teleporter: {
      fam: 'mouvement', nom: 'Projeter par translocation', ecole: 'Translocation', nature: 'inspire', couleur: '#62d6c6',
      description: 'Le sort disparaît et réapparaît sur la cible, sans vol : il ne refroidit pas en route et ne peut pas être esquivé. Loi inventée : 50 J par kilogramme et par mètre.',
      formule: 'E = m · d · 50',
      params: [{ id: 'distance', label: 'Distance de la cible', unite: 'm', def: 20, min: 0 }],
      appliquer(e, p, ctx) {
        if (e.lance) { ctx.alerte('danger', 'Le sort est déjà lancé.'); return; }
        const m = Math.max(0.1, e.matiere?.masse || 0.1);
        ctx.energie(m * p.distance * 50);
        ctx.lancer(p.distance);
        e.v = 0;
        ctx.mental(0.1);
        ctx.alerte('info', `Le sort réapparaît instantanément à ${p.distance} m, sans perte en vol.`);
      },
    },
    leviter: {
      fam: 'mouvement', nom: 'Faire léviter', ecole: 'Kinésie', nature: 'mixte', couleur: '#62d6c6',
      description: 'Maintient le sort en suspension sans le tenir (utile s\'il est ancré devant soi ou à distance). S\'entretient jusqu\'au lancement.',
      formule: 'entretien = m · g · 1 m/s',
      params: [],
      appliquer(e, p, ctx) {
        if (ancrageDe(e.ancre).zone === 'tenu') ctx.alerte('info', `Ancré ${ancrageDe(e.ancre).ou}, le sort est déjà tenu : la lévitation ne sert pas à grand-chose.`);
        e.levite = true;
        majConfinement(e);
        ctx.energie(20);
        ctx.mental(0.1);
      },
    },

    /* ===================== PROTECTION ===================== */
    protection: {
      fam: 'protection', nom: 'Protection thermique', ecole: 'Abjuration', nature: 'inspire', couleur: '#6fa8e8',
      description: 'Protège la main et le corps du lanceur jusqu\'à une température donnée (chaud comme froid). Elle s\'entretient tant que le sort reste près du lanceur.',
      formule: 'mise en place = 2 J/°C   ·   entretien = 0,002 · seuil² W',
      params: [{ id: 'seuil', label: 'Supporte jusqu\'à', type: 'select', def: '1000', options: { '200': '± 200 °C', '500': '± 500 °C', '1000': '± 1 000 °C', '2000': '± 2 000 °C', '3500': '± 3 500 °C' } }],
      appliquer(e, p, ctx) {
        const s = Number(p.seuil);
        if (!estProche(e.ancre)) ctx.alerte('info', 'Le sort est ancré loin de toi : cette protection ne sert pas à grand-chose.');
        e.protection = Math.max(e.protection, s);
        e.entretiens.protection = 0.002 * e.protection ** 2;
        ctx.energie(2 * s, { sansDistance: true });
        ctx.mental(0.2);
      },
    },
    protelec: {
      fam: 'protection', nom: 'Isolation électrique', ecole: 'Abjuration', nature: 'inspire', couleur: '#6fa8e8',
      description: 'Isole le lanceur de la charge qu\'il manipule. Indispensable avant de charger un sort tenu en main.',
      formule: 'mise en place = 50 J + 0,05 % du seuil   ·   entretien = 5 · log₁₀(seuil)² W',
      params: [{ id: 'seuil', label: 'Supporte jusqu\'à', type: 'select', def: '100000', options: { '1000': '1 kJ (étincelle)', '100000': '100 kJ (arc)', '10000000': '10 MJ (éclair mineur)', '1000000000': '1 GJ (foudre)' } }],
      appliquer(e, p, ctx) {
        const s = Number(p.seuil);
        e.protElec = Math.max(e.protElec, s);
        e.entretiens.protElec = 5 * Math.log10(e.protElec) ** 2;
        ctx.energie(50 + 0.0005 * s, { sansDistance: true });
        ctx.mental(0.2);
      },
    },
    bouclier: {
      fam: 'protection', nom: 'Bouclier cinétique', ecole: 'Abjuration', nature: 'mixte', couleur: '#6fa8e8',
      description: 'Un champ devant le lanceur qui absorbe l\'énergie des coups (et de ses propres ondes de choc). Il faut stocker l\'énergie à absorber et entretenir la surface.',
      formule: 'E = capacité   ·   entretien = S · 5 W/m²',
      params: [
        { id: 'capacite', label: 'Énergie absorbable', type: 'select', def: '3000', options: { '100': 'Flèche (100 J)', '500': 'Coup d\'épée (500 J)', '3000': 'Balle de mousquet (3 kJ)', '50000': 'Charge de cavalerie (50 kJ)', '1000000': 'Boulet de canon (1 MJ)' } },
        { id: 'surface', label: 'Surface', unite: 'm²', def: 2, min: 0.1, step: 0.5 },
      ],
      appliquer(e, p, ctx) {
        e.bouclier = Math.max(e.bouclier, Number(p.capacite));
        e.entretiens.bouclier = p.surface * 5;
        ctx.energie(Number(p.capacite), { sansDistance: true });
        ctx.mental(0.2);
      },
    },
    confinement: {
      fam: 'protection', nom: 'Confinement', ecole: 'Abjuration', nature: 'inspire', couleur: '#6fa8e8',
      description: 'Enferme la matière dans une bulle de force : la chaleur ne s\'échappe presque plus et la masse ne se disperse pas en vol. S\'entretient en continu.',
      formule: 'mise en place = 100 J   ·   entretien = 500 W/kg',
      params: [],
      appliquer(e, p, ctx) {
        if (!e.matiere) ctx.alerte('attention', 'Rien à contenir : ajoute de la matière avant.');
        e.confine = true;
        majConfinement(e);
        if (!e.matiere) e.entretiens.confinement = 50;
        ctx.energie(100);
        ctx.mental(0.2);
      },
    },

    /* ===================== CONTRÔLE & PERCEPTION ===================== */
    viser: {
      fam: 'controle', nom: 'Viser', ecole: 'Divination', nature: 'inspire', couleur: '#b08be0',
      description: 'Verrouille mentalement la cible avant le lancement. Indispensable pour toucher loin.',
      formule: 'E = 20 J',
      params: [],
      appliquer(e, p, ctx) {
        if (e.lance) ctx.alerte('attention', 'Viser après avoir lancé ne sert à rien.');
        e.vise = true;
        ctx.energie(20);
        ctx.mental(0.3);
      },
    },
    guidage: {
      fam: 'controle', nom: 'Guidage', ecole: 'Divination', nature: 'inspire', couleur: '#b08be0',
      description: 'Le lanceur corrige la trajectoire en vol : le projectile suit sa cible même si elle bouge. S\'entretient pendant le vol.',
      formule: 'mise en place = 100 J   ·   entretien = 300 W',
      params: [],
      appliquer(e, p, ctx) {
        e.guide = true;
        e.entretiens.guidage = 300;
        ctx.energie(100);
        ctx.mental(0.1);
      },
    },
    dissimuler: {
      fam: 'controle', nom: 'Dissimuler', ecole: 'Illusion', nature: 'inspire', couleur: '#b08be0',
      description: 'Courbe la lumière autour du sort pour le rendre invisible. La cible ne voit rien venir. S\'entretient tant que le sort existe.',
      formule: 'entretien = 200 W/kg',
      params: [],
      appliquer(e, p, ctx) {
        e.cache = true;
        majConfinement(e);
        if (e.lumiere) ctx.alerte('attention', 'Le sort brille déjà : la dissimulation sera trahie par sa lumière.');
        ctx.energie(50);
        ctx.mental(0.2);
      },
    },
  };

  // Paramètres effectifs d'un bloc (y compris les sous-paramètres d'un effet direct)
  function parametres(bloc) {
    const def = BLOCS[bloc.type];
    if (!def) return [];
    let liste = def.params;
    if (bloc.type === 'effet') liste = liste.concat(M.EFFETS[bloc.params?.effet || 'lumiere']?.params || []);
    return liste;
  }
  function valeurs(bloc) {
    const p = {};
    for (const prm of parametres(bloc)) {
      const brut = bloc.params?.[prm.id] ?? prm.def;
      p[prm.id] = prm.type === 'select' ? String(brut) : Math.max(prm.min ?? -Infinity, Number(brut) || 0);
    }
    return p;
  }
  function nouveauBloc(type, effet) {
    const b = { type, params: {} };
    if (type === 'effet' && effet) b.params.effet = effet;
    for (const prm of parametres(b)) b.params[prm.id] ??= prm.def;
    return b;
  }

  // Entretiens liés au lanceur (s'arrêtent au lancement) / liés au sort (continuent en vol)
  const ENTRETIENS_LANCEUR = ['protection', 'protElec', 'bouclier', 'levitation'];

  // --- Simulation ----------------------------------------------------------
  function simuler(sort, R = M.reglages()) {
    const e = {
      t: 0, ancre: null, facteurDistance: 1, matiere: null, T: AMBIANTE,
      confine: false, protection: 0, protElec: 0, bouclier: 0, lance: false, v: 0, distanceVol: 0, libere: false,
      forme: 'sphere', fragments: 1, charge: 0, pression: 1, lumiere: 0,
      vise: false, guide: false, cache: false, levite: false, piege: null,
      entretiens: {}, tempsCharge: null, livraison: null,
    };
    const courbe = [{ t: 0, T: AMBIANTE }];
    const etapes = [];
    let ePonctuelle = 0, eEntretien = 0;

    for (const [i, bloc] of (sort.blocs || []).entries()) {
      const def = BLOCS[bloc.type];
      const etape = { index: i, type: bloc.type, energie: 0, duree: 0, alertes: [], debut: e.t };
      const signale = new Set();

      const ctx = {
        R,
        alerte: (niv, txt) => etape.alertes.push({ niv, txt }),
        rendre(j) { const v = Math.min(Math.max(0, j), ePonctuelle); etape.energie -= v; ePonctuelle -= v; },
        energie(j, o = {}) {
          const f = o.sansDistance || e.lance ? 1 : e.facteurDistance;
          const v = Math.max(0, j) * f;
          etape.energie += v; ePonctuelle += v;
        },
        pertes() {
          const m = e.matiere?.masse || 0.1;
          const k = e.confine ? 1 : 25;
          const forme = e.confine ? 1 : FORMES[e.forme]?.pertes ?? 1;
          const vol = e.lance && !e.libere ? 1 + e.v / 5 : 1; // convection forcée en vol
          return k * m ** (2 / 3) * forme * e.fragments ** (1 / 3) * vol;
        },
        puissanceEntretien() {
          return Object.entries(e.entretiens).reduce((s, [k, w]) => s + (e.lance && ENTRETIENS_LANCEUR.includes(k) ? 0 : w), 0);
        },
        lancer(distance) {
          e.lance = true; e.distanceVol = distance; e.tempsCharge ??= e.t;
          const relaches = ENTRETIENS_LANCEUR.filter((k) => e.entretiens[k]);
          if (relaches.some((k) => k !== 'levitation')) ctx.alerte('info', `Le sort quitte ${ancrageDe(e.ancre).zone === 'tenu' ? ancrageDe(e.ancre).qui : 'le lanceur'} : les protections se relâchent.`);
          for (const k of relaches) delete e.entretiens[k];
        },
        mental(dt) { ctx.evoluer(dt * (R.dureeMentale ?? 1)); },
        // Fait passer dt secondes avec une puissance nette P (W) injectée dans la matière
        evoluer(dt, P = 0, o = {}) {
          if (!(dt > 0)) return;
          const h = ctx.pertes();
          const m = e.matiere?.masse, c = e.matiere ? M.MATERIAUX[e.matiere.type].c : 0;
          const T0 = e.T, Teq = AMBIANTE + P / h, tau = m ? (m * c) / h : 1;
          // bornes : point de changement d'état, plafond imposé (flamme, cible)
          const sens = Math.sign(Teq - T0);
          const b = o.fixe ? null : barriere(e, sens);
          let borne = b ? b.T : null;
          if (o.plafond !== undefined && sens > 0) borne = borne === null ? o.plafond : Math.min(borne, o.plafond);
          if (o.plafond !== undefined && sens < 0) borne = borne === null ? o.plafond : Math.max(borne, o.plafond);
          const borner = (T) => (borne === null ? T : sens > 0 ? Math.min(T, borne) : Math.max(T, borne));
          const n = Math.max(2, Math.min(40, Math.ceil((dt / tau) * 8)));
          for (let k = 1; k <= n; k++) {
            const tk = (dt * k) / n;
            const T = !m ? AMBIANTE : o.fixe ? T0 : borner(Teq + (T0 - Teq) * Math.exp(-tk / tau));
            courbe.push({ t: e.t + tk, T });
            verifierCorps(T);
          }
          if (m && !o.fixe) {
            const Tf = Teq + (T0 - Teq) * Math.exp(-dt / tau);
            e.T = borner(Tf);
            if (b && e.T === b.T && Tf !== e.T && P === 0) ctx.alerte('info', `La matière se stabilise à ${M.formatNombre(b.T, 0)} °C, son point ${b.txt}.`);
          }
          // entretiens
          const fVol = e.lance ? ((1 + e.distanceVol / R.porteeRef) ** 2 + 1) / 2 : e.facteurDistance;
          let ent = 0;
          for (const [k, w] of Object.entries(e.entretiens)) {
            if (ENTRETIENS_LANCEUR.includes(k)) ent += e.lance ? 0 : w;
            else ent += w * fVol;
          }
          etape.energie += ent * dt; eEntretien += ent * dt;
          e.t += dt; etape.duree += dt;
        },
      };

      function verifierCorps(T) {
        if (e.lance || e.libere || !e.ancre || !estProche(e.ancre)) return;
        const qui = ancrageDe(e.ancre).qui;
        if (e.matiere) {
          const tol = ancrageDe(e.ancre).tol;
          const haut = Math.max(tol.haut, e.protection), bas = Math.min(tol.bas, -e.protection);
          if (T > haut && !signale.has('chaud')) {
            signale.add('chaud');
            ctx.alerte('danger', `Brûlure : ${qui} supporte ${haut} °C, le sort dépasse cette température.${e.protection ? ' Augmente la protection thermique.' : ' Ajoute une protection thermique avant de chauffer.'}`);
          }
          if (T < bas && !signale.has('froid')) {
            signale.add('froid');
            ctx.alerte('danger', `Gelure : ${qui} supporte ${bas} °C, le sort descend plus bas.${e.protection ? ' Augmente la protection thermique.' : ' Ajoute une protection thermique.'}`);
          }
        }
        if (e.charge > 10 && e.protElec < e.charge && !signale.has('elec')) {
          signale.add('elec');
          ctx.alerte('danger', `Électrocution : ${qui} reçoit la charge du sort (${M.formatEnergie(e.charge)}).${e.protElec ? ' L\'isolation est trop faible.' : ' Ajoute une « Isolation électrique » avant de charger.'}`);
        }
      }

      if (!def) { etape.alertes.push({ niv: 'danger', txt: 'Bloc inconnu.' }); etapes.push(etape); continue; }
      if (i === 0 && bloc.type !== 'ancrage') ctx.alerte('danger', 'Le sort n\'a pas d\'ancrage : il ne sait pas où naître. Commence par un bloc « Ancrage ».');
      if (e.libere) ctx.alerte('danger', 'Le sort est déjà libéré : ce bloc n\'a plus aucun effet.');
      else {
        if (!e.ancre && bloc.type !== 'ancrage') e.ancre = 'main';
        def.appliquer(e, valeurs(bloc), ctx);
      }
      etape.etat = {
        t: e.t, T: e.T, matiere: e.matiere ? { ...e.matiere } : null, confine: e.confine,
        protection: e.protection, protElec: e.protElec, bouclier: e.bouclier, lance: e.lance, libere: e.libere, v: e.v,
        forme: e.forme, fragments: e.fragments, charge: e.charge, pression: e.pression,
        vise: e.vise, guide: e.guide, cache: e.cache, lumiere: e.lumiere, levite: e.levite, piege: e.piege,
      };
      etapes.push(etape);
    }

    const globales = [];
    if (!e.libere && ((e.matiere && Math.abs(e.T - AMBIANTE) > 50) || e.charge > 0))
      globales.push({ niv: 'info', txt: 'Le sort n\'est jamais libéré : son énergie se dissipe sans effet. Termine par « Libération ».' });

    const focal = M.FOCALISATEUR[sort.lanceur?.focalisateur]?.f ?? 1;
    const eTotal = (ePonctuelle + eEntretien) * focal;
    const c = cout(eTotal, sort.lanceur, R);
    const alertes = etapes.flatMap((s) => s.alertes.map((a) => ({ ...a, etape: s.index }))).concat(globales);

    return {
      etapes, courbe, ePonctuelle, eEntretien, focal, eTotal, ...c,
      duree: e.t, tempsCharge: e.tempsCharge ?? e.t, livraison: e.livraison, etatFinal: e,
      alertes, dangers: alertes.filter((a) => a.niv === 'danger').length,
    };
  }

  function cout(eTissee, lanceur, R) {
    const niveau = R.niveaux[lanceur?.niveau] || R.niveaux.adepte;
    const rendement = niveau.rendement;
    const reserve = Number(lanceur?.reserve) || niveau.reserve;
    const ePuisee = eTissee / rendement;
    const ether = ePuisee <= 0 ? 0 : Math.max(1, Math.round(R.base ** Math.log10(Math.max(ePuisee, 1))));
    const cercle = M.CERCLES.find((c) => ePuisee < c.max).nom;
    const ratio = reserve > 0 ? ether / reserve : Infinity;
    let risque;
    if (ether === 0) risque = { niv: 'nul', txt: 'Aucune énergie dépensée.' };
    else if (ratio <= 0.25) risque = { niv: 'sur', txt: 'Sans danger : le lanceur garde l\'essentiel de ses forces.' };
    else if (ratio <= 0.6) risque = { niv: 'modere', txt: 'Éprouvant : fatigue notable après le lancement.' };
    else if (ratio <= 1) risque = { niv: 'eleve', txt: 'Épuisant : le lanceur est vidé, au bord de la syncope.' };
    else risque = { niv: 'critique', txt: `Contrecoup : la réserve est dépassée de ${ether - reserve} Éther. Le surplus est payé en blessures, voire en vie.` };
    return { rendement, reserve, ePuisee, ether, cercle, ratio, risque, kcal: ePuisee / 4184 };
  }

  // Conversion des sorts de l'ancienne Forge (composantes) en blueprints
  function normaliser(s) {
    const base = { ...M.nouveauSort(), ...structuredClone(s) };
    if (!Array.isArray(base.blocs)) {
      const lieu = base.modificateurs?.portee > 0 ? 'distance' : 'main';
      base.blocs = [{ type: 'ancrage', params: { lieu, distance: base.modificateurs?.portee || 10 } }]
        .concat((base.composantes || []).map((c) => ({ type: 'effet', params: { effet: c.type, ...c.params } })));
    }
    base.lanceur = { niveau: 'adepte', reserve: null, focalisateur: base.modificateurs?.focalisateur || 'aucun', ...base.lanceur };
    delete base.composantes; delete base.modificateurs;
    base.version = 2;
    return base;
  }

  return { AMBIANTE, TOLERANCE, ANCRAGES, LIBERATIONS, FAMILLES, FORMES, TRANSITIONS, COMBUSTIBLES, BLOCS, parametres, valeurs, nouveauBloc, simuler, cout, normaliser };
})();

/* --- Blueprints d'exemple -------------------------------------------------- */
const EXEMPLES = [
  {
    id: 'ex-boule-de-feu', nom: 'Boule de feu', ecole: 'Pyromancie',
    description: 'Le pyromancien rassemble l\'air au creux de sa main protégée, l\'enferme dans une bulle et le chauffe jusqu\'à 800 °C avant de le projeter. La sphère éclate à l\'impact.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'main' } },
      { type: 'protection', params: { seuil: '1000' } },
      { type: 'rassembler', params: { matiere: 'air', masse: 2 } },
      { type: 'confinement', params: {} },
      { type: 'chaleur', params: { puissance: 200, cible: 800 } },
      { type: 'mouvement', params: { vitesse: 25, distance: 20 } },
      { type: 'liberation', params: { mode: 'explosion' } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'simple' },
  },
  {
    id: 'ex-flamme-nue', nom: 'Flamme nue (erreur de novice)', ecole: 'Pyromancie',
    description: 'La même boule de feu sans protection ni confinement : le lanceur se brûle, la chaleur fuit pendant la charge et la flamme se disperse en vol.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'main' } },
      { type: 'rassembler', params: { matiere: 'air', masse: 2 } },
      { type: 'chaleur', params: { puissance: 200, cible: 800 } },
      { type: 'mouvement', params: { vitesse: 25, distance: 20 } },
      { type: 'liberation', params: { mode: 'explosion' } },
    ],
    lanceur: { niveau: 'adepte', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-javelot-glace', nom: 'Javelot de glace', ecole: 'Cryomancie',
    description: 'L\'humidité de l\'air se condense devant le lanceur, gèle en une lance effilée qu\'il refroidit encore avant de la tirer sur sa cible.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'devant' } },
      { type: 'condenser', params: { masse: 300 } },
      { type: 'chaleur', params: { puissance: 20, cible: 0 } },
      { type: 'etat', params: { transition: 'solidifier', puissance: 30 } },
      { type: 'chaleur', params: { puissance: 20, cible: -30 } },
      { type: 'faconner', params: { forme: 'lance' } },
      { type: 'viser', params: {} },
      { type: 'mouvement', params: { vitesse: 60, distance: 35 } },
      { type: 'liberation', params: { mode: 'contact' } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-boule-foudre', nom: 'Boule de foudre', ecole: 'Électromancie',
    description: 'Une sphère d\'air ionisé, crépitante et lumineuse, chargée dans la main isolée du lanceur puis guidée jusqu\'à sa cible.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'main' } },
      { type: 'protelec', params: { seuil: '100000' } },
      { type: 'rassembler', params: { matiere: 'air', masse: 0.5 } },
      { type: 'confinement', params: {} },
      { type: 'charger', params: { charge: 50 } },
      { type: 'illuminer', params: { puissance: '60' } },
      { type: 'guidage', params: {} },
      { type: 'mouvement', params: { vitesse: 15, distance: 15 } },
      { type: 'liberation', params: { mode: 'contact' } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'ouvrage' },
  },
  {
    id: 'ex-pluie-braises', nom: 'Pluie de braises', ecole: 'Pyromancie',
    description: 'Du charbon arraché au foyer, porté à ignition puis embrasé : le lanceur le brise en une gerbe de braises qui s\'abat sur la zone.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'devant' } },
      { type: 'protection', params: { seuil: '2000' } },
      { type: 'rassembler', params: { matiere: 'charbon', masse: 1 } },
      { type: 'chaleur', params: { puissance: 150, cible: 450 } },
      { type: 'embraser', params: { fraction: 30, duree: 2 } },
      { type: 'fragmenter', params: { nombre: 20 } },
      { type: 'mouvement', params: { vitesse: 20, distance: 15 } },
      { type: 'liberation', params: { mode: 'explosion' } },
    ],
    lanceur: { niveau: 'adepte', reserve: null, focalisateur: 'simple' },
  },
  {
    id: 'ex-pierre-ardente', nom: 'Projectile de pierre ardente', ecole: 'Géomancie',
    description: 'Un éclat de pierre arraché au sol, porté au rouge devant le lanceur puis tiré comme une balle.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'devant' } },
      { type: 'rassembler', params: { matiere: 'pierre', masse: 0.3 } },
      { type: 'protection', params: { seuil: '1000' } },
      { type: 'chaleur', params: { puissance: 50, cible: 700 } },
      { type: 'faconner', params: { forme: 'lance' } },
      { type: 'mouvement', params: { vitesse: 80, distance: 30 } },
      { type: 'liberation', params: { mode: 'contact' } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-piege-feu', nom: 'Rune de feu (piège)', ecole: 'Pyromancie',
    description: 'Une bulle d\'air brûlant scellée au sol, invisible, qui explose quand quelqu\'un s\'approche. Le confinement coûte tant qu\'elle attend.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'distance', distance: 3 } },
      { type: 'rassembler', params: { matiere: 'air', masse: 1 } },
      { type: 'confinement', params: {} },
      { type: 'chaleur', params: { puissance: 100, cible: 900 } },
      { type: 'dissimuler', params: {} },
      { type: 'retardement', params: { declencheur: 'proximite', attente: 120 } },
      { type: 'liberation', params: { mode: 'explosion' } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-lueur', nom: 'Lueur du veilleur', ecole: 'Lumen',
    description: 'Une petite lumière flottante qui éclaire comme une torche pendant dix minutes.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'devant' } },
      { type: 'effet', params: { effet: 'lumiere', puissance: '10', duree: 600 } },
    ],
    lanceur: { niveau: 'novice', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-refermer-plaies', nom: 'Refermer les plaies', ecole: 'Biomancie',
    description: 'Le guérisseur pose les mains sur la blessure et force les chairs à se reconstruire.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'main' } },
      { type: 'effet', params: { effet: 'soin', blessure: '20', nombre: 1 } },
    ],
    lanceur: { niveau: 'adepte', reserve: null, focalisateur: 'aucun' },
  },
  {
    id: 'ex-foudre', nom: 'Trait de foudre', ecole: 'Électromancie',
    description: 'Un arc électrique qui naît directement au-dessus de la cible, à quinze pas.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'distance', distance: 15 } },
      { type: 'effet', params: { effet: 'foudre', tension: 100000, intensite: 30, duree: 0.01 } },
    ],
    lanceur: { niveau: 'maitre', reserve: null, focalisateur: 'ouvrage' },
  },
];

if (typeof module !== 'undefined') module.exports = { Blueprint, EXEMPLES };
