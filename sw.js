'use strict';

const CACHE_V = 'sillans-v2';
const BASE    = '/sillans';

/* ─── Fichiers mis en cache à l'installation ─── */
const SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/carte.html',
  BASE + '/bibliotheque.html',
  BASE + '/quiz.html',
  BASE + '/infos.html',
  BASE + '/style.css',
  BASE + '/script.js',
  BASE + '/carte.js',
  BASE + '/bibliotheque.js',
  BASE + '/manifest.json',
  /* — Images essentielles — */
  BASE + '/images/gee.png',
  BASE + '/images/sillou1.png',
  BASE + '/images/sillou2.png',
  BASE + '/images/Carte_Sillans.png',
  BASE + '/images/boussole.png',
  BASE + '/images/bravo.png',
  BASE + '/images/drapeau.png',
  BASE + '/images/icon-ampoule.png',
  BASE + '/images/eglise.png',
  BASE + '/images/eglise.JPG',
  BASE + '/images/prairie.JPG',
  BASE + '/images/abeille.jpg',
  BASE + '/images/casca.jpg',
  BASE + '/images/cascade.jpg',
  BASE + '/images/v1.jpg',
  BASE + '/images/v2.png',
  BASE + '/images/mairie.png',
  BASE + '/images/passerelle.png',
  BASE + '/images/tuf2.JPG',
  BASE + '/images/insecte.jpg',
  BASE + '/images/oiseau.jpg',
  BASE + '/images/pas.jpg',
  BASE + '/images/feuille.jpg',
  BASE + '/images/memo1.png',
  BASE + '/images/memo2.png',
  BASE + '/images/memo3.png',
  BASE + '/images/memo4.png',
  BASE + '/images/memo5.png',
  BASE + '/images/memo6.png',
  BASE + '/images/sillou-feu.png',
  BASE + '/images/fond1.png',
  BASE + '/images/carte.png',
  /* — Badges — */
  BASE + '/images/Badge/blason%20vide.png',
  BASE + '/images/Badge/Badge%201.png',
  BASE + '/images/Badge/Badge%202.png',
  BASE + '/images/Badge/Badge%203.png',
  BASE + '/images/Badge/Badge%204.png',
  BASE + '/images/Badge/Badge%205.png',
  BASE + '/images/Badge/Badge%202%20sur%20blason.png',
  BASE + '/images/Badge/Badge%203%20sur%20blason.png',
  BASE + '/images/Badge/Badge%204%20sur%20blason.png',
  BASE + '/images/Badge/Badge%205%20sur%20blason.png',
  BASE + '/images/Badge/Badge%206%20sur%20blason.png',
  /* — Audio essentiels — */
  BASE + '/audio/son_cascade.mp3',
  BASE + '/audio/son_feuille.mp3',
  BASE + '/audio/son_insecte.mp3',
  BASE + '/audio/son_oiseau.mp3',
  BASE + '/audio/son_pas.mp3',
  BASE + '/audio/eglise.wav',
];

/* ─── Installation : cache + envoi de la progression ─── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_V);
    const total = SHELL.length;
    let loaded  = 0;

    for (const url of SHELL) {
      try {
        await cache.add(url);
      } catch (_) { /* ignore les assets manquants (nom de fichier inexact, etc.) */ }

      loaded++;
      const progress = Math.round(loaded / total * 100);

      /* Envoie la progression à toutes les pages ouvertes */
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: 'CACHE_PROGRESS', progress }));
    }

    await self.skipWaiting();
  })());
});

/* ─── Activation : suppression des anciens caches ─── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_V).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ─── Fetch : cache-first, fallback réseau, puis fallback offline ─── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        /* Mise en cache dynamique des ressources valides */
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_V).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        /* Hors-ligne : renvoie la page d'accueil pour les navigations HTML */
        if (event.request.destination === 'document') {
          return caches.match(BASE + '/index.html');
        }
      });
    })
  );
});
