/* Éléments communs : barre de navigation, pied de page, notifications */
(() => {
  const pages = [
    ['index.html', 'Accueil'],
    ['forge.html', 'La Forge'],
    ['grimoire.html', 'Grimoire'],
    ['ecoles.html', 'Écoles'],
    ['lois.html', 'Lois'],
    ['guide.html', 'Guide'],
  ];
  const courante = location.pathname.split('/').pop() || 'index.html';
  const logo = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="1" transform="rotate(45 12 12)"/>
    <rect x="7" y="7" width="10" height="10"/><circle cx="12" cy="12" r="2"/></svg>`;

  const barre = document.createElement('header');
  barre.className = 'barre';
  barre.innerHTML = `<a class="marque" href="index.html">${logo}La Matrice Arcanique</a>
    <nav>${pages.map(([h, t]) => `<a href="${h}"${h === courante ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
  document.body.prepend(barre);

  const pied = document.createElement('footer');
  pied.className = 'pied';
  pied.textContent = 'La Matrice Arcanique — un système de magie générique, où la physique fixe le prix des sorts.';
  document.body.append(pied);

  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.setAttribute('role', 'status');
  document.body.append(notif);
  let minuteur;
  window.notifier = (texte) => {
    notif.textContent = texte;
    notif.classList.add('visible');
    clearTimeout(minuteur);
    minuteur = setTimeout(() => notif.classList.remove('visible'), 2600);
  };

  window.echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.telecharger = (nom, contenu, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
})();
