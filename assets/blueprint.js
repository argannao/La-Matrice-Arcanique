/* ==========================================================================
   La Matrice Arcanique — moteur de blueprints
   Un sort est une suite de blocs exécutés dans l'ordre. Une simulation suit
   l'état du sort (matière, température, temps, lancement…) bloc après bloc,
   compte l'énergie dépensée et signale les erreurs de conception.
   ========================================================================== */
const Blueprint = (() => {
  const M = Matrice;
  const AMBIANTE = 20; // °C

  const opts = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.nom]));
  const MATIERES_AMBIANTES = ['air', 'eau', 'pierre', 'bois', 'fer'];

  // Tolérance du corps sans protection, selon la distance à l'ancrage
  const TOLERANCE = { main: { haut: 50, bas: -10 }, devant: { haut: 250, bas: -60 } };

  // --- Blocs ---------------------------------------------------------------
  // appliquer(etat, params, ctx) : modifie l'état ; ctx.energie(), ctx.evoluer(), ctx.alerte()
  const BLOCS = {
    ancrage: {
      nom: 'Ancrage', ecole: 'Fondation', nature: 'inspire', couleur: '#8a93b8',
      description: 'Point d\'origine du sort. Tout blueprint commence ici. Plus l\'ancrage est loin, plus chaque bloc coûte cher.',
      params: [
        { id: 'lieu', label: 'Lieu', type: 'select', def: 'main', options: { main: 'Dans la main', devant: 'Devant soi (1 m)', distance: 'À distance' } },
        { id: 'distance', label: 'Distance', unite: 'm', def: 10, min: 0, si: (p) => p.lieu === 'distance' },
      ],
      appliquer(e, p, ctx) {
        if (e.ancre) { ctx.alerte('attention', 'Ancrage répété : seul le premier compte.'); return; }
        e.ancre = p.lieu;
        e.facteurDistance = p.lieu === 'distance' ? (1 + p.distance / ctx.R.porteeRef) ** 2 : 1;
        if (p.lieu === 'distance') ctx.alerte('info', `Ancrage à ${p.distance} m : tous les blocs suivants coûtent ×${M.formatNombre(e.facteurDistance, 2)} jusqu'au lancement.`);
        ctx.energie(10);
        ctx.evoluer(0.5);
      },
    },
    rassembler: {
      nom: 'Rassembler la matière', ecole: 'Fondation', nature: 'inspire', couleur: '#8a93b8',
      description: 'Attirer et condenser de la matière ambiante au point d\'ancrage (air, eau d\'une source, pierre du sol…). Loi inventée : 300 J par kilogramme.',
      formule: 'E = m · 300 J/kg   ·   durée = 1 s + 0,5 s/kg',
      params: [
        { id: 'matiere', label: 'Matière', type: 'select', def: 'air', options: Object.fromEntries(MATIERES_AMBIANTES.map((k) => [k, M.MATERIAUX[k].nom])) },
        { id: 'masse', label: 'Masse', unite: 'kg', def: 1, min: 0.001, step: 0.1 },
      ],
      appliquer(e, p, ctx) {
        if (e.matiere && e.matiere.type !== p.matiere) ctx.alerte('attention', `La ${M.MATERIAUX[e.matiere.type].nom.toLowerCase()} déjà présente est remplacée.`);
        if (e.matiere && e.matiere.type === p.matiere) e.matiere.masse += p.masse;
        else { e.matiere = { type: p.matiere, masse: p.masse }; e.T = AMBIANTE; }
        if (e.confine) e.entretiens.confinement = 500 * Math.max(0.1, e.matiere.masse);
        ctx.energie(p.masse * 300);
        ctx.evoluer(1 + 0.5 * p.masse);
      },
    },
    creer: {
      nom: 'Créer la matière', ecole: 'Genèse', nature: 'rigoureux', couleur: '#c79bf0',
      description: 'Faire apparaître de la matière ex nihilo. Relativité stricte : un gramme coûte autant qu\'une bombe atomique.',
      formule: 'E = m · c²',
      params: [
        { id: 'matiere', label: 'Matière', type: 'select', def: 'eau', options: opts(M.MATERIAUX) },
        { id: 'masse', label: 'Masse', unite: 'g', def: 1, min: 0, step: 0.1 },
      ],
      appliquer(e, p, ctx) {
        const kg = p.masse / 1000;
        if (e.matiere && e.matiere.type === p.matiere) e.matiere.masse += kg;
        else { e.matiere = { type: p.matiere, masse: kg }; e.T = AMBIANTE; }
        ctx.energie(kg * M.C * M.C);
        ctx.evoluer(1);
      },
    },
    protection: {
      nom: 'Protection thermique', ecole: 'Abjuration', nature: 'inspire', couleur: '#6fa8e8',
      description: 'Protège la main et le corps du lanceur jusqu\'à une température donnée (chaud comme froid). Elle s\'entretient tant que le sort reste près du lanceur.',
      formule: 'mise en place = 2 J/°C   ·   entretien = 0,002 · seuil² W',
      params: [
        { id: 'seuil', label: 'Supporte jusqu\'à', type: 'select', def: '1000',
          options: { '200': '± 200 °C', '500': '± 500 °C', '1000': '± 1 000 °C', '2000': '± 2 000 °C', '3500': '± 3 500 °C' } },
      ],
      appliquer(e, p, ctx) {
        const s = Number(p.seuil);
        if (e.ancre === 'distance') ctx.alerte('info', 'Le sort est ancré loin de toi : cette protection ne sert pas à grand-chose.');
        e.protection = Math.max(e.protection, s);
        e.entretiens.protection = 0.002 * e.protection ** 2;
        ctx.energie(2 * s, { sansDistance: true });
        ctx.evoluer(1);
      },
    },
    confinement: {
      nom: 'Confinement', ecole: 'Abjuration', nature: 'inspire', couleur: '#6fa8e8',
      description: 'Enferme la matière dans une bulle de force : la chaleur ne s\'échappe presque plus et la masse ne se disperse pas en vol. S\'entretient en continu.',
      formule: 'mise en place = 100 J   ·   entretien = 500 W/kg',
      params: [],
      appliquer(e, p, ctx) {
        if (!e.matiere) ctx.alerte('attention', 'Rien à contenir : rassemble ou crée de la matière avant.');
        e.confine = true;
        e.entretiens.confinement = 500 * Math.max(0.1, e.matiere?.masse || 0.1);
        ctx.energie(100);
        ctx.evoluer(1);
      },
    },
    chaleur: {
      nom: 'Chauffer / refroidir', ecole: 'Pyromancie / Cryomancie', nature: 'rigoureux', couleur: '#e8904e',
      description: 'Injecte (ou retire) de la chaleur à une puissance donnée jusqu\'à la température voulue. Le temps nécessaire dépend des pertes : sans confinement, la chaleur s\'échappe vite.',
      formule: 'm·c·dT/dt = ±P − h·(T − T_amb)',
      params: [
        { id: 'puissance', label: 'Puissance', unite: 'kW', def: 200, min: 0.001, step: 10 },
        { id: 'cible', label: 'Température visée', unite: '°C', def: 800, step: 50 },
      ],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Rien à chauffer : la chaleur se dissipe dans le vide. Ajoute « Rassembler la matière » avant.'); return; }
        const P = p.puissance * 1000;
        const m = e.matiere.masse, c = M.MATERIAUX[e.matiere.type].c;
        const h = ctx.pertes(), tau = (m * c) / h;
        const T0 = e.T, Tc = p.cible;
        if (Math.abs(Tc - T0) < 0.5) { ctx.alerte('info', 'La matière est déjà à cette température.'); return; }
        const s = Math.sign(Tc - T0);
        const Teq = AMBIANTE + (s * P) / h; // température d'équilibre si on chauffe indéfiniment
        let t;
        if ((s > 0 && Tc >= Teq) || (s < 0 && Tc <= Teq)) {
          t = tau * Math.log(20); // 95 % du chemin
          ctx.alerte('attention', `Puissance insuffisante : les pertes égalent la puissance vers ${M.formatNombre(Teq, 0)} °C. Augmente la puissance ou ajoute un confinement.`);
        } else {
          t = tau * Math.log((T0 - Teq) / (Tc - Teq));
        }
        ctx.energie(P * t);
        ctx.evoluer(t, s * P);
        if (!e.confine && Math.abs(e.T - AMBIANTE) > 200) ctx.alerte('info', `Sans confinement, ${M.formatNombre(h * Math.abs(e.T - AMBIANTE) / 1000, 1)} kW s'échappent en permanence à cette température.`);
      },
    },
    attendre: {
      nom: 'Attendre', ecole: 'Fondation', nature: 'rigoureux', couleur: '#8a93b8',
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
    mouvement: {
      nom: 'Imprégner de mouvement', ecole: 'Kinésie', nature: 'rigoureux', couleur: '#62d6c6',
      description: 'Donne une vitesse à la matière et l\'envoie vers la cible. Le sort quitte le lanceur : la protection se relâche. Pendant le vol, la chaleur continue de s\'échapper.',
      formule: 'E = ½ · m · v²   ·   vol = d / v',
      params: [
        { id: 'vitesse', label: 'Vitesse', unite: 'm/s', def: 25, min: 0.1 },
        { id: 'distance', label: 'Distance de la cible', unite: 'm', def: 20, min: 0 },
      ],
      appliquer(e, p, ctx) {
        if (!e.matiere) { ctx.alerte('danger', 'Il n\'y a aucune matière à mettre en mouvement.'); return; }
        if (e.lance) { ctx.alerte('danger', 'Le sort est déjà lancé.'); return; }
        ctx.energie(0.5 * e.matiere.masse * p.vitesse ** 2);
        e.lance = true; e.v = p.vitesse; e.distanceVol = p.distance;
        e.tempsCharge = e.t;
        if (e.entretiens.protection) { ctx.alerte('info', `Le sort quitte ${e.ancre === 'main' ? 'ta main' : 'le lanceur'} : la protection se relâche.`); e.entretiens.protection = 0; }
        const T0 = e.T;
        ctx.evoluer(p.distance / p.vitesse);
        const fluide = ['air', 'eau'].includes(e.matiere.type);
        if (!e.confine && Math.abs(T0 - AMBIANTE) > 100 && !fluide)
          ctx.alerte('info', `La matière refroidit pendant le vol : ${M.formatNombre(T0, 0)} °C au départ, ${M.formatNombre(e.T, 0)} °C à l'impact (après ${M.formatNombre(p.distance / p.vitesse, 2)} s).`);
        else if (!e.confine && Math.abs(T0 - AMBIANTE) > 100)
          ctx.alerte('attention', `Sans confinement, la masse se disperse en vol : elle arrive à ${M.formatNombre(e.T, 0)} °C au lieu de ${M.formatNombre(T0, 0)} °C.`);
        else ctx.alerte('info', `Impact après ${M.formatNombre(p.distance / p.vitesse, 2)} s de vol, à ${M.formatNombre(e.T, 0)} °C.`);
      },
    },
    liberation: {
      nom: 'Libération', ecole: 'Fondation', nature: 'rigoureux', couleur: '#e2565a',
      description: 'Relâche toute l\'énergie contenue dans le sort : le confinement se rompt, la chaleur et le mouvement se déchargent sur la cible.',
      formule: 'E délivrée = m·c·|T − T_amb| + ½·m·v²',
      params: [
        { id: 'mode', label: 'Forme', type: 'select', def: 'explosion', options: { explosion: 'Explosion (zone)', contact: 'Impact (une cible)', dissipation: 'Dissipation douce' } },
      ],
      appliquer(e, p, ctx) {
        const m = e.matiere?.masse || 0, c = e.matiere ? M.MATERIAUX[e.matiere.type].c : 0;
        const th = m * c * Math.abs(e.T - AMBIANTE), ci = e.lance ? 0.5 * m * e.v ** 2 : 0;
        e.livraison = { thermique: th, cinetique: ci, total: th + ci, mode: p.mode };
        e.libere = true;
        if (!e.lance) e.tempsCharge = e.t;
        if (!e.lance && e.ancre !== 'distance' && p.mode !== 'dissipation' && th + ci > 1000)
          ctx.alerte('danger', `La libération a lieu ${e.ancre === 'main' ? 'dans ta main' : 'à un mètre de toi'} : tu encaisses ${M.formatEnergie(th + ci)}.`);
        e.entretiens = {};
      },
    },
    effet: {
      nom: 'Effet direct', ecole: 'Toutes', nature: 'mixte', couleur: '#d6a95e',
      description: 'Un effet élémentaire appliqué d\'un coup au point d\'ancrage (lumière, soin, foudre, bouclier…), pour ce qui ne demande pas de construction pas à pas.',
      params: [{ id: 'effet', label: 'Effet', type: 'select', def: 'lumiere', options: opts(M.EFFETS) }],
      appliquer(e, p, ctx) {
        ctx.energie(M.energieComposante({ type: p.effet, params: p }));
        ctx.evoluer(1);
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

  // --- Simulation ----------------------------------------------------------
  function simuler(sort, R = M.reglages()) {
    const e = {
      t: 0, ancre: null, facteurDistance: 1, matiere: null, T: AMBIANTE,
      confine: false, protection: 0, lance: false, v: 0, distanceVol: 0, libere: false,
      entretiens: {}, tempsCharge: null, livraison: null,
    };
    const courbe = [{ t: 0, T: AMBIANTE }];
    const etapes = [];
    let ePonctuelle = 0, eEntretien = 0;

    for (const [i, bloc] of (sort.blocs || []).entries()) {
      const def = BLOCS[bloc.type];
      const etape = { index: i, type: bloc.type, energie: 0, duree: 0, alertes: [], debut: e.t };
      const dejaBrule = new Set();

      const ctx = {
        R,
        alerte: (niv, txt) => etape.alertes.push({ niv, txt }),
        energie(j, o = {}) {
          const f = o.sansDistance || e.lance ? 1 : e.facteurDistance;
          const v = Math.max(0, j) * f;
          etape.energie += v; ePonctuelle += v;
        },
        pertes() {
          const m = e.matiere?.masse || 0.1;
          const k = e.confine ? 1 : 25;
          const vol = e.lance && !e.libere ? 1 + e.v / 5 : 1; // convection forcée en vol
          return k * m ** (2 / 3) * vol;
        },
        // Fait passer dt secondes avec une puissance nette P (W) injectée dans la matière
        evoluer(dt, P = 0) {
          if (!(dt > 0)) return;
          const h = ctx.pertes();
          const m = e.matiere?.masse, c = e.matiere ? M.MATERIAUX[e.matiere.type].c : 0;
          const T0 = e.T, Teq = AMBIANTE + P / h, tau = m ? (m * c) / h : 1;
          const n = Math.max(2, Math.min(40, Math.ceil(dt / tau * 8)));
          for (let k = 1; k <= n; k++) {
            const tk = (dt * k) / n;
            const T = m ? Teq + (T0 - Teq) * Math.exp(-tk / tau) : AMBIANTE;
            courbe.push({ t: e.t + tk, T });
            verifierCorps(T);
          }
          if (m) e.T = Teq + (T0 - Teq) * Math.exp(-dt / tau);
          // entretiens (protection, confinement)
          const fVol = e.lance ? ((1 + e.distanceVol / R.porteeRef) ** 2 + 1) / 2 : e.facteurDistance;
          const ent = (e.entretiens.protection || 0) + (e.entretiens.confinement || 0) * fVol;
          etape.energie += ent * dt; eEntretien += ent * dt;
          e.t += dt; etape.duree += dt;
        },
      };

      function verifierCorps(T) {
        if (e.lance || e.libere || !e.ancre || e.ancre === 'distance' || !e.matiere) return;
        const tol = TOLERANCE[e.ancre];
        const haut = Math.max(tol.haut, e.protection), bas = Math.min(tol.bas, -e.protection);
        if (T > haut && !dejaBrule.has('chaud')) {
          dejaBrule.add('chaud');
          ctx.alerte('danger', `Brûlure : ${e.ancre === 'main' ? 'ta main' : 'ton corps'} supporte ${haut} °C, le sort dépasse cette température.${e.protection ? '' : ' Ajoute une protection thermique avant de chauffer.'}`);
        }
        if (T < bas && !dejaBrule.has('froid')) {
          dejaBrule.add('froid');
          ctx.alerte('danger', `Gelure : ${e.ancre === 'main' ? 'ta main' : 'ton corps'} supporte ${bas} °C, le sort descend plus bas.${e.protection ? '' : ' Ajoute une protection thermique.'}`);
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
        protection: e.protection, lance: e.lance, libere: e.libere, v: e.v,
      };
      etapes.push(etape);
    }

    // Bilan global
    const globales = [];
    if (e.matiere && !e.libere && Math.abs(e.T - AMBIANTE) > 50)
      globales.push({ niv: 'info', txt: 'Le sort n\'est jamais libéré : son énergie se dissipe sans effet. Termine par « Libération ».' });

    const R2 = R;
    const focal = M.FOCALISATEUR[sort.lanceur?.focalisateur]?.f ?? 1;
    const eTotal = (ePonctuelle + eEntretien) * focal;
    const c = cout(eTotal, sort.lanceur, R2);
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

  return { AMBIANTE, TOLERANCE, BLOCS, parametres, valeurs, nouveauBloc, simuler, cout, normaliser };
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
    id: 'ex-pierre-ardente', nom: 'Projectile de pierre ardente', ecole: 'Géomancie',
    description: 'Un éclat de pierre arraché au sol, porté au rouge devant le lanceur puis tiré comme une balle.',
    blocs: [
      { type: 'ancrage', params: { lieu: 'devant' } },
      { type: 'rassembler', params: { matiere: 'pierre', masse: 0.3 } },
      { type: 'protection', params: { seuil: '1000' } },
      { type: 'chaleur', params: { puissance: 50, cible: 700 } },
      { type: 'mouvement', params: { vitesse: 80, distance: 30 } },
      { type: 'liberation', params: { mode: 'contact' } },
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
