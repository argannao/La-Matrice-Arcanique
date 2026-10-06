/* ==========================================================================
   La Matrice Arcanique — comptes et synchronisation (Firebase)
   Connexion Google, GitHub ou e-mail + mot de passe. Les sorts du compte sont
   stockés dans Firestore (users/{uid}/sorts/{id}) et mis en cache dans le
   navigateur. Sans configuration Firebase, le site reste en mode local.
   ========================================================================== */
import { firebaseConfig } from './firebase-config.js?v=11';

const VERSION_SDK = '12.19.0';
const CDN = `https://www.gstatic.com/firebasejs/${VERSION_SDK}`;
const M = Matrice; // défini par matrice.js (portée globale partagée entre scripts)

const evenement = () => window.dispatchEvent(new CustomEvent('matrice:grimoire'));
const statut = (html) => { const el = document.getElementById('statut-compte'); if (el) el.innerHTML = html; };

if (!firebaseConfig) {
  // Mode local : on s'assure de ne pas rester sur le cache d'un ancien compte
  M.utiliserCompte(null);
  evenement();
} else {
  demarrer().catch((err) => {
    console.error(err);
    notifier('Impossible de charger le service de comptes. Le grimoire reste disponible dans ce navigateur.');
  });
}

async function demarrer() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  auth.languageCode = 'fr';
  const db = F.getFirestore(app);
  let utilisateur = null;

  const refSorts = (uid) => F.collection(db, 'users', uid, 'sorts');
  const propre = (s) => JSON.parse(JSON.stringify(s)); // Firestore refuse les valeurs undefined

  // --- Synchronisation ---------------------------------------------------------
  async function synchroniser(user) {
    statut('<span class="sync">Synchronisation…</span>');
    M.utiliserCompte(user.uid);
    const cache = M.grimoire();
    const anonymes = M.grimoireAnonyme();
    const snap = await F.getDocs(refSorts(user.uid));
    const distants = new Map(snap.docs.map((d) => [d.id, d.data()]));
    const fusion = new Map(distants);
    const aEnvoyer = [];

    // Sorts modifiés hors ligne sur cet appareil : le plus récent gagne
    for (const s of cache) {
      const d = distants.get(s.id);
      if (!d || (s.modifie || '') > (d.modifie || '')) { fusion.set(s.id, s); aEnvoyer.push(s); }
    }
    // Sorts créés sans compte dans ce navigateur : rattachés au compte
    for (const s of anonymes) {
      if (!fusion.has(s.id)) { fusion.set(s.id, s); aEnvoyer.push(s); }
    }
    if (aEnvoyer.length) {
      const lot = F.writeBatch(db);
      for (const s of aEnvoyer) lot.set(F.doc(refSorts(user.uid), s.id), propre(s));
      await lot.commit();
    }
    M.remplacerGrimoire([...fusion.values()]);
    if (anonymes.length) {
      M.viderGrimoireAnonyme();
      notifier(`${anonymes.length} sort${anonymes.length > 1 ? 's de ce navigateur ont été ajoutés' : ' de ce navigateur a été ajouté'} à ton compte.`);
    }
    evenement();
    statut(`Grimoire synchronisé avec le compte <strong>${echapper(user.displayName || user.email)}</strong> : tes sorts te suivent sur tous tes appareils.`);
  }

  // Enregistrer / supprimer : cache local immédiat, puis envoi au compte
  const enregistrerLocal = M.enregistrer, supprimerLocal = M.supprimer;
  M.enregistrer = (sort) => {
    const ok = enregistrerLocal(sort);
    if (utilisateur) {
      const copie = M.grimoire().find((s) => s.id === sort.id);
      F.setDoc(F.doc(refSorts(utilisateur.uid), sort.id), propre(copie))
        .catch((e) => { console.error(e); notifier('Sort gardé dans ce navigateur, mais l\'envoi au compte a échoué. Il sera synchronisé à la prochaine connexion.'); });
    }
    return ok;
  };
  M.supprimer = (id) => {
    const ok = supprimerLocal(id);
    if (utilisateur) F.deleteDoc(F.doc(refSorts(utilisateur.uid), id)).catch((e) => { console.error(e); notifier('La suppression n\'a pas pu être envoyée au compte.'); });
    return ok;
  };

  // --- Interface ---------------------------------------------------------------
  const zone = document.createElement('div');
  zone.className = 'compte';
  document.querySelector('.barre')?.append(zone);

  const fenetre = document.createElement('dialog');
  fenetre.className = 'fenetre-compte';
  fenetre.innerHTML = `
    <form method="dialog" class="fermer-f"><button class="fermer" aria-label="Fermer">✕</button></form>
    <h2 id="fc-titre">Connexion</h2>
    <p class="fc-sous">Retrouve ton grimoire sur tous tes appareils.</p>
    <div class="fc-fournisseurs">
      <button type="button" class="bouton fc-large" data-fournisseur="google">${ICONE_GOOGLE} Continuer avec Google</button>
      <button type="button" class="bouton fc-large" data-fournisseur="github">${ICONE_GITHUB} Continuer avec GitHub</button>
    </div>
    <div class="fc-ou"><span>ou par e-mail</span></div>
    <form id="fc-form" novalidate>
      <div class="champ" id="fc-champ-nom" hidden><label for="fc-nom">Nom affiché</label><input id="fc-nom" autocomplete="nickname"></div>
      <div class="champ"><label for="fc-email">E-mail</label><input id="fc-email" type="email" autocomplete="email" required></div>
      <div class="champ"><label for="fc-mdp">Mot de passe</label><input id="fc-mdp" type="password" autocomplete="current-password" minlength="6" required></div>
      <p class="fc-erreur" id="fc-erreur" role="alert"></p>
      <button class="bouton principal fc-large" id="fc-valider" type="submit">Se connecter</button>
    </form>
    <div class="fc-liens">
      <button type="button" class="lien-btn" id="fc-basculer">Pas encore de compte ? Créer un compte</button>
      <button type="button" class="lien-btn" id="fc-oubli">Mot de passe oublié</button>
    </div>`;
  document.body.append(fenetre);
  const $ = (id) => document.getElementById(id);
  let creation = false;

  function modeCreation(oui) {
    creation = oui;
    $('fc-titre').textContent = oui ? 'Créer un compte' : 'Connexion';
    $('fc-valider').textContent = oui ? 'Créer mon compte' : 'Se connecter';
    $('fc-basculer').textContent = oui ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? Créer un compte';
    $('fc-champ-nom').hidden = !oui;
    $('fc-mdp').autocomplete = oui ? 'new-password' : 'current-password';
    $('fc-oubli').hidden = oui;
    $('fc-erreur').textContent = '';
  }
  const ouvrir = () => { modeCreation(false); fenetre.showModal(); };
  const erreur = (e) => { $('fc-erreur').textContent = messageErreur(e); };

  $('fc-basculer').addEventListener('click', () => modeCreation(!creation));
  fenetre.querySelectorAll('[data-fournisseur]').forEach((b) => b.addEventListener('click', async () => {
    const fournisseur = b.dataset.fournisseur === 'google' ? new A.GoogleAuthProvider() : new A.GithubAuthProvider();
    try { await A.signInWithPopup(auth, fournisseur); fenetre.close(); } catch (e) { erreur(e); }
  }));
  $('fc-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('fc-email').value.trim(), mdp = $('fc-mdp').value;
    if (!email || !mdp) return erreur({ code: 'auth/missing-fields' });
    $('fc-valider').disabled = true;
    try {
      if (creation) {
        const { user } = await A.createUserWithEmailAndPassword(auth, email, mdp);
        const nom = $('fc-nom').value.trim();
        if (nom) { await A.updateProfile(user, { displayName: nom }); rendreZone(auth.currentUser); }
      } else await A.signInWithEmailAndPassword(auth, email, mdp);
      fenetre.close();
    } catch (e) { erreur(e); } finally { $('fc-valider').disabled = false; }
  });
  $('fc-oubli').addEventListener('click', async () => {
    const email = $('fc-email').value.trim();
    if (!email) { $('fc-erreur').textContent = 'Indique ton e-mail ci-dessus, puis clique à nouveau.'; return; }
    try { await A.sendPasswordResetEmail(auth, email); $('fc-erreur').textContent = ''; notifier('Un e-mail de réinitialisation t\'a été envoyé.'); }
    catch (e) { erreur(e); }
  });

  function rendreZone(user) {
    if (!user) {
      zone.innerHTML = '<button type="button" class="bouton petit" id="b-connexion">Se connecter</button>';
      zone.querySelector('#b-connexion').addEventListener('click', ouvrir);
      return;
    }
    const nom = user.displayName || user.email || 'Mon compte';
    const avatar = user.photoURL
      ? `<img src="${echapper(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
      : `<span>${echapper(nom.trim().charAt(0).toUpperCase())}</span>`;
    zone.innerHTML = `<details class="menu-compte">
      <summary aria-label="Mon compte">${avatar}</summary>
      <div class="menu-compte-panneau">
        <strong>${echapper(nom)}</strong>
        ${user.email && user.displayName ? `<small>${echapper(user.email)}</small>` : ''}
        <a href="grimoire.html">Mon grimoire</a>
        <button type="button" class="lien-btn" id="b-deconnexion">Se déconnecter</button>
      </div>
    </details>`;
    zone.querySelector('#b-deconnexion').addEventListener('click', async () => { await A.signOut(auth); notifier('Tu es déconnecté.'); });
  }

  statut('Connecte-toi pour sauvegarder ton grimoire en ligne et le retrouver sur tous tes appareils. <button type="button" class="lien-btn" data-ouvrir-connexion>Se connecter</button>');
  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-ouvrir-connexion]')) ouvrir(); });

  A.onAuthStateChanged(auth, async (user) => {
    const precedent = utilisateur;
    utilisateur = user;
    rendreZone(user);
    if (user) {
      try { await synchroniser(user); }
      catch (e) { console.error(e); statut('La synchronisation a échoué : tes sorts restent disponibles dans ce navigateur.'); notifier('Synchronisation impossible pour le moment.'); }
    } else {
      // Déconnexion : on efface le cache du compte sur cet appareil (les sorts restent en ligne)
      if (precedent) M.remplacerGrimoire([]);
      M.utiliserCompte(null);
      evenement();
      statut('Connecte-toi pour sauvegarder ton grimoire en ligne et le retrouver sur tous tes appareils. <button type="button" class="lien-btn" data-ouvrir-connexion>Se connecter</button>');
    }
  });
}

function messageErreur(e) {
  const messages = {
    'auth/missing-fields': 'Indique ton e-mail et ton mot de passe.',
    'auth/invalid-email': 'Cette adresse e-mail n\'est pas valide.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : connecte-toi plutôt.',
    'auth/weak-password': 'Mot de passe trop faible : au moins 6 caractères.',
    'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
    'auth/popup-closed-by-user': 'Fenêtre de connexion fermée avant la fin.',
    'auth/cancelled-popup-request': 'Fenêtre de connexion fermée avant la fin.',
    'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion : autorise les pop-ups pour ce site.',
    'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cet e-mail via une autre méthode (Google, GitHub ou mot de passe). Connecte-toi avec celle-là.',
    'auth/unauthorized-domain': 'Ce site n\'est pas autorisé dans la configuration Firebase (domaines autorisés).',
    'auth/operation-not-allowed': 'Cette méthode de connexion n\'est pas activée dans Firebase.',
    'auth/network-request-failed': 'Problème de connexion réseau.',
  };
  return messages[e?.code] || 'Une erreur est survenue. Réessaie.';
}

const ICONE_GOOGLE = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const ICONE_GITHUB = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
