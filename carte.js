/* =========================================================================
   Parcours de Sillans — carte interactive + jeu de piste
   - Carte Leaflet L.CRS.Simple (image plein-largeur, ancrée en haut)
   - 6 marqueurs positionnés en pixels (x/y) sur l'image — placement manuel
   - Progression + badges sauvegardés dans localStorage
   ========================================================================= */
(function () {
  'use strict';

  /* ----- Dimensions de l'image de fond (px) ----- */
  var IMG_W = 530;
  var IMG_H = 879;

  /* ----- Les 6 étapes du parcours ----- */
  /* x / y = position en pixels sur l'image (origine haut-gauche).
     À ajuster manuellement pour chaque point. */
  const POINTS = [
    { n: 1, name: 'Église Saint-Étienne', theme: 'Départ du parcours',       badge: 'images/Badge/blason vide.png',  x: 152, y: 319 },
    { n: 2, name: 'La prairie',           theme: 'Prairie',                  badge: 'images/Badge/Badge 1.png',      x: 202, y: 475 },
    { n: 3, name: 'Le belvédère',         theme: 'Vue panoramique & le tuf', badge: 'images/Badge/Badge 2.png',      x: 342, y: 542 },
    { n: 4, name: 'La passerelle',        theme: 'Préservation des sols',    badge: 'images/Badge/Badge 3.png',      x: 414, y: 569 },
    { n: 5, name: 'La cascade',           theme: 'Le joyau de Sillans',      badge: 'images/Badge/Badge 4.png',      x: 458, y: 502 },
    { n: 6, name: 'Le village',           theme: 'Retour au village',        badge: 'images/Badge/Badge 5.png',      x: 91,  y: 205 }
  ];

  /* Les 5 slots affichés dans la grille de badges (points 2 → 6) */
  const GAME_POINTS = POINTS.slice(1);
  const TOTAL = POINTS.length;

  /* ----- Persistance ----- */
  const STORE_KEY = 'sillans_parcours';
  const DL_KEY = 'sillans_carte_telechargee';

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && Array.isArray(raw.completed)) return raw;
    } catch (e) { /* ignore */ }
    // État initial : aucun point validé, on commence au point 1
    return { completed: [], current: 1 };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  /* État d'un point : 'done' | 'current' | 'locked' */
  function pointState(n) {
    if (state.completed.includes(n)) return 'done';
    if (n === state.current) return 'current';
    return 'locked';
  }

  /* ===================================================================
     CARTE LEAFLET — L.CRS.Simple (espace pixel, image plein-largeur)
     L'image remplit toute la largeur du container et est ancrée en haut.
     =================================================================== */
  const map = L.map('carteMap', {
    crs:               L.CRS.Simple,
    zoomControl:       false,
    attributionControl: false,
    zoomSnap:          0,
    minZoom:           -5,
    maxZoom:           5,
    scrollWheelZoom:   false,
    doubleClickZoom:   false,
    dragging:          false,
    touchZoom:         false,
    boxZoom:           false,
    keyboard:          false
  });

  /* Image de fond en coordonnées pixel */
  var pixelBounds = [[0, 0], [IMG_H, IMG_W]];
  L.imageOverlay('images/carte_Sillans.png', pixelBounds).addTo(map);

  /* Remplit toute la largeur et ancre le haut de l'image en haut de l'écran */
  function fitCarte() {
    map.invalidateSize();
    var containerW = map.getContainer().clientWidth;
    var containerH = map.getContainer().clientHeight;
    var scale      = containerW / IMG_W;
    var zoom       = Math.log2(scale);
    var halfScreen = containerH / (2 * scale);
    var centerY    = halfScreen;            // y=0 image → haut de l'écran
    var centerLat  = IMG_H - centerY;
    var centerLng  = IMG_W / 2;
    map.setView([centerLat, centerLng], zoom, { animate: false });
    map.setMinZoom(zoom);
    map.setMaxZoom(zoom);
  }
  fitCarte();
  window.setTimeout(fitCarte, 80);
  window.addEventListener('resize', fitCarte);

  /* Pixel (haut-gauche) → coordonnées Leaflet CRS.Simple (origine bas-gauche) */
  function toLatLng(p) { return [IMG_H - p.y, p.x]; }

  const LOCK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function buildIcon(p) {
    const st = pointState(p.n);
    const inner = st === 'locked' ? LOCK_SVG : p.n;
    return L.divIcon({
      className: '',
      html: '<div class="map-pin map-pin--' + st + '">' + inner + '</div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });
  }

  const markers = POINTS.map(function (p) {
    const marker = L.marker(toLatLng(p), {
      icon: buildIcon(p),
      keyboard: true,
      title: 'Point n°' + p.n + ' — ' + p.name
    }).addTo(map);
    marker.on('click', function () { onPointClick(p); });
    return { p: p, marker: marker };
  });

  function refreshMarkers() {
    markers.forEach(function (m) { m.marker.setIcon(buildIcon(m.p)); });
  }

  /* ===================================================================
     HINT "CLIQUE ICI" — bulle animée au-dessus du point 1
     =================================================================== */
  var hintMarker = null;

  function createHintMarker() {
    if (state.completed.includes(1)) return;   // déjà validé → pas de hint
    if (hintMarker) return;

    var hintIcon = L.divIcon({
      className: '',
      html: '<div class="map-hint" aria-hidden="true">' +
              '<div class="map-hint__bubble">Clique ici !</div>' +
              '<div class="map-hint__tail"></div>' +
            '</div>',
      iconSize:   [88, 48],
      iconAnchor: [44, 56]   // ancre = juste au-dessus du centre du pin
    });

    hintMarker = L.marker(toLatLng(POINTS[0]), {
      icon:        hintIcon,
      interactive: false,    // le clic passe au pin en dessous
      keyboard:    false,
      zIndexOffset: 200
    }).addTo(map);
  }

  function removeHintMarker() {
    if (!hintMarker) return;
    hintMarker.getElement() && hintMarker.getElement().classList.add('map-hint--out');
    var m = hintMarker;
    hintMarker = null;
    window.setTimeout(function () { map.removeLayer(m); }, 280);
  }

  createHintMarker();

  /* ===================================================================
     INTERACTIONS POINTS / MINI-JEUX
     =================================================================== */
  let activePoint = null;
  var diplomeBtn = document.getElementById('diplomeBtn'); // déclaré tôt pour validatePoint

  function onPointClick(p) {
    const st = pointState(p.n);
    if (st === 'locked') {
      showToast('Termine d\'abord les points précédents !');
      return;
    }
    // Retire le hint dès le premier clic sur le point 1
    if (p.n === 1) removeHintMarker();
    // Affiche l'aperçu du lieu avant le mini-jeu
    if (p.media) {
      openLocationPreview(p, {
        hint: 'Rends-toi à cet endroit pour débloquer l\'étape !',
        btnText: 'J\'y suis ! 🎯',
        onConfirm: function () { openGameModal(p, st); }
      });
    } else {
      openGameModal(p, st);
    }
  }

  const gameModal  = document.getElementById('gameModal');
  const gameStep   = document.getElementById('gameStep');
  const gameBadgeImg = document.getElementById('gameBadgeImg');
  const gameTitle  = document.getElementById('gameModalTitle');
  const gameText   = document.getElementById('gameModalText');
  const gameComplete = document.getElementById('gameComplete');

  /* ----------------------------------------------------------------
     Validation générique d'un point
     ---------------------------------------------------------------- */
  function validatePoint(n) {
    if (!state.completed.includes(n)) state.completed.push(n);
    if (state.current === n) state.current = Math.min(n + 1, TOTAL + 1);
    saveState();
    refreshMarkers();
    renderQuest();
    renderBadges();
    // Anime le blason maître avec un léger décalage (après fermeture éventuelle du modal)
    window.setTimeout(function () { renderMasterBadge(true); }, 320);
    // Affiche le bouton diplôme dès que le parcours est complet
    if (state.completed.length >= TOTAL && diplomeBtn) diplomeBtn.hidden = false;
  }

  function openGameModal(p, st) {
    activePoint = p;

    // Point 1 non encore validé → carte de bienvenue d'abord
    if (p.n === 1 && st === 'current') {
      openPoint1Welcome();
      return;
    }

    // Point 2 non encore validé → panneau info + mini-jeu
    if (p.n === 2 && st === 'current') {
      openPoint2Info();
      return;
    }

    // Point 3 non encore validé → belvédère
    if (p.n === 3 && st === 'current') {
      openPoint3Info();
      return;
    }

    // Point 4 non encore validé → passerelle
    if (p.n === 4 && st === 'current') {
      openPoint4Info();
      return;
    }

    // Point 5 non encore validé → cascade
    if (p.n === 5 && st === 'current') {
      openPoint5Info();
      return;
    }

    // Point 6 non encore validé → le village
    if (p.n === 6 && st === 'current') {
      openPoint6Info();
      return;
    }

    // Modal générique (point déjà fait ou points futurs)
    gameStep.textContent = 'Point n°' + p.n;
    gameBadgeImg.src = encodeURI(p.badge);
    gameBadgeImg.alt = 'Badge ' + p.name;
    gameTitle.textContent = p.name;

    if (st === 'done') {
      gameText.textContent = p.theme + ' — point déjà validé ✓';
      gameComplete.hidden = true;
    } else {
      gameText.textContent = p.theme + '. Le mini-jeu de ce point arrive bientôt !';
      gameComplete.hidden = false;
    }
    openModal(gameModal);
  }

  gameComplete.addEventListener('click', function () {
    if (!activePoint) return;
    var n = activePoint.n;
    validatePoint(n);
    closeModal(gameModal);
    // Laisse la modale se fermer avant d'ouvrir le succès
    window.setTimeout(function () { showBadgeSuccess(n); }, 260);
  });

  document.getElementById('gameClose').addEventListener('click', function () {
    closeModal(gameModal);
  });

  /* Skip modale générique (points 2-6) */
  document.getElementById('gameSkip').addEventListener('click', function () {
    if (!activePoint) return;
    var n = activePoint.n;
    validatePoint(n);
    closeModal(gameModal);
    window.setTimeout(function () { showBadgeSuccess(n); }, 260);
  });

  /* ===================================================================
     POINT 1 — CARTE DE BIENVENUE (avant le panneau info)
     =================================================================== */
  var point1Welcome = document.getElementById('point1Welcome');

  function openPoint1Welcome() {
    openModal(point1Welcome);
  }

  document.getElementById('pt1WelcomeClose').addEventListener('click', function () {
    closeModal(point1Welcome);
  });

  document.getElementById('pt1WelcomeBtn').addEventListener('click', function () {
    closeModal(point1Welcome);
    window.setTimeout(openPoint1Info, 260);
  });

  // Fermer en cliquant sur le fond
  point1Welcome.addEventListener('click', function (e) {
    if (e.target === point1Welcome) closeModal(point1Welcome);
  });

  /* ===================================================================
     POINT 1 — PANNEAU INFO (Église Saint-Étienne)
     =================================================================== */
  const point1Modal = document.getElementById('point1Modal');

  function openPoint1Info() {
    var audio   = document.getElementById('pt1Audio');
    var playBtn = document.getElementById('pt1PlayBtn');
    var wave    = document.getElementById('pt1Wave');

    // Réinitialise l'audio si on réouvre
    audio.pause();
    audio.currentTime = 0;
    playBtn.classList.remove('is-playing');
    if (wave) wave.classList.remove('is-playing');
    // Remet l'icône en ▶
    var iconEl = playBtn.querySelector('.library-card__play-icon');
    if (iconEl) iconEl.textContent = '▶';

    openModal(point1Modal);

    // Play / pause
    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        playBtn.classList.add('is-playing');
        if (wave) wave.classList.add('is-playing');
        if (iconEl) iconEl.textContent = '❚❚';
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        if (wave) wave.classList.remove('is-playing');
        if (iconEl) iconEl.textContent = '▶';
      }
    };
    audio.onended = function () {
      playBtn.classList.remove('is-playing');
      if (wave) wave.classList.remove('is-playing');
      if (iconEl) iconEl.textContent = '▶';
    };
  }

  document.getElementById('pt1Close').addEventListener('click', function () {
    document.getElementById('pt1Audio').pause();
    closeModal(point1Modal);
  });

  document.getElementById('pt1Launch').addEventListener('click', function () {
    document.getElementById('pt1Audio').pause();
    closeModal(point1Modal);
    // Légère pause pour laisser le premier modal se fermer
    window.setTimeout(openPoint1Game, 260);
  });

  /* ===================================================================
     POINT 1 — MINI-JEU : Trie le matériel
     =================================================================== */
  const mg1Modal = document.getElementById('mg1Modal');

  const ITEMS_P1 = [
    { icon: '🥾', label: 'Chaussures\nde marche', answer: 'emporter',
      ok: 'Super ! Les chaussures de marche protègent tes pieds sur les sentiers !',
      ko: 'Oups ! Les chaussures de marche sont indispensables pour marcher en sécurité.' },
    { icon: '🩴', label: 'Tongs', answer: 'laisser',
      ok: 'Exact ! Les tongs glissent sur les sentiers rocheux. Laisse-les à la maison !',
      ko: 'Oups ! Les tongs sont dangereuses sur les chemins. Il faut les laisser chez toi.' },
    { icon: '💧', label: 'Gourde', answer: 'emporter',
      ok: 'Bien vu ! Une gourde pour rester hydraté, c\'est essentiel en randonnée !',
      ko: 'Oups ! La gourde est très importante pour ne pas avoir soif pendant la balade.' },
    { icon: '🥪', label: 'Pique-nique', answer: 'emporter',
      ok: 'Miam ! Un bon pique-nique pour se ressourcer en pleine nature ! Mais attention seulement dans les zones réservées pour cela !',
      ko: 'Oups ! Tu peux tout à fait apporter ton pique-nique pour manger dans la nature.' },
    { icon: '🏖️', label: 'Serviette\nde plage', answer: 'laisser',
      ok: 'Correct ! La baignade est interdite à la cascade. Pas besoin de serviette !',
      ko: 'Oups ! La baignade est interdite à la cascade pour la sécurité de tous.' },
    { icon: '🗑️', label: 'Sac à déchets', answer: 'emporter',
      ok: 'Bravo ! Ramasser ses déchets, c\'est protéger la belle nature de Sillans !',
      ko: 'Oups ! Il faut toujours emporter un sac pour ramasser ses déchets dans la nature.' },
    { icon: '⚽', label: 'Balle de foot', answer: 'laisser',
      ok: 'Bien joué ! La forêt n\'est pas un terrain de foot : les animaux seraient effrayés !',
      ko: 'Oups ! Jouer au foot en forêt effraie les animaux. Laisse la balle à la maison.' },
    { icon: '🔊', label: 'Enceinte', answer: 'laisser',
      ok: 'Parfait ! La musique forte perturbe les animaux. Profite des sons de la nature !',
      ko: 'Oups ! Le bruit fort dérange les animaux de la forêt. Laisse l\'enceinte chez toi !' }
  ];

  var mg1Idx        = 0;    // index de l'item en cours
  var mg1Busy       = false; // vrai pendant l'affichage du feedback
  var mg1WasDrop    = false; // empêche le double-déclenchement drag+click
  var mg1DragInited = false; // listeners ajoutés une seule fois par session

  function openPoint1Game() {
    mg1Idx        = 0;
    mg1Busy       = false;
    mg1WasDrop    = false;
    mg1DragInited = false;
    // Restaure le shell complet du jeu (cas où on a déjà affiché le succès)
    restoreMG1Shell();
    openModal(mg1Modal);
    mg1RenderItem();
    mg1InitDrag();
  }

  function restoreMG1Shell() {
    // Assure que les éléments de jeu existent (après un succès ils peuvent avoir été remplacés)
    var mg1 = mg1Modal.querySelector('.mg1');
    if (!document.getElementById('mg1Card')) {
      mg1.innerHTML =
        '<div class="mg1__header">' +
          '<button type="button" class="mg1__back" id="mg1Back" aria-label="Retour">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>' +
          '</button>' +
          '<span class="mg1__title">Trie le matériel !</span>' +
          '<span class="mg1__counter" id="mg1Counter" aria-live="polite">1/8</span>' +
          '<button type="button" class="mg1__skip" id="mg1Skip" aria-label="Passer le mini-jeu">Passer →</button>' +
        '</div>' +
        '<p class="mg1__hint">Glisse ou tape la bonne zone 👇</p>' +
        '<div class="mg1__card-area">' +
          '<div class="mg1__card" id="mg1Card" role="img" aria-label="">' +
            '<span class="mg1__icon" id="mg1Icon" aria-hidden="true"></span>' +
            '<span class="mg1__label" id="mg1Label"></span>' +
          '</div>' +
        '</div>' +
        '<div class="mg1__zones">' +
          '<button type="button" class="mg1__zone mg1__zone--laisser" id="mg1Laisser" aria-label="À laisser à la maison">' +
            '<span class="mg1__zone-icon" aria-hidden="true">🏠</span>' +
            '<span class="mg1__zone-label">À laisser<br>à la maison</span>' +
          '</button>' +
          '<button type="button" class="mg1__zone mg1__zone--emporter" id="mg1Emporter" aria-label="À emporter">' +
            '<span class="mg1__zone-icon" aria-hidden="true">🎒</span>' +
            '<span class="mg1__zone-label">À emporter</span>' +
          '</button>' +
        '</div>' +
        '<div class="mg1__feedback" id="mg1Feedback" hidden aria-live="polite">' +
          '<img class="mg1__sillou" src="images/sillou1.png" alt="Sillou">' +
          '<p class="mg1__bubble" id="mg1FeedbackText"></p>' +
        '</div>';
      // Réattache les boutons retour et skip
      document.getElementById('mg1Back').addEventListener('click', function () {
        closeModal(mg1Modal);
      });
      document.getElementById('mg1Skip').addEventListener('click', function () {
        mg1ShowSuccess();
      });
    }
  }

  /* Rendu initial du premier item (cache le feedback) */
  function mg1RenderItem() {
    var item = ITEMS_P1[mg1Idx];
    var card  = document.getElementById('mg1Card');
    document.getElementById('mg1Icon').textContent    = item.icon;
    document.getElementById('mg1Label').textContent   = item.label.replace('\n', ' ');
    document.getElementById('mg1Counter').textContent = (mg1Idx + 1) + '/' + ITEMS_P1.length;
    card.setAttribute('aria-label', item.label.replace('\n', ' '));
    document.getElementById('mg1Feedback').hidden = true;
    card.classList.remove('mg1__card--ok', 'mg1__card--wrong');
    card.style.cssText = '';
    mg1Busy = false;
  }

  /* Rendu des items suivants — le feedback précédent RESTE visible */
  function mg1RenderNextItem() {
    var item = ITEMS_P1[mg1Idx];
    var card  = document.getElementById('mg1Card');
    document.getElementById('mg1Icon').textContent    = item.icon;
    document.getElementById('mg1Label').textContent   = item.label.replace('\n', ' ');
    document.getElementById('mg1Counter').textContent = (mg1Idx + 1) + '/' + ITEMS_P1.length;
    card.setAttribute('aria-label', item.label.replace('\n', ' '));
    card.classList.remove('mg1__card--ok', 'mg1__card--wrong');
    card.style.cssText = '';
    // Feedback laissé visible intentionnellement
  }

  /* Ajoute l'icône de l'item en petit dans le panier de la zone */
  function mg1AddToBasket(item, zone) {
    var zoneEl = document.getElementById(zone === 'laisser' ? 'mg1Laisser' : 'mg1Emporter');
    if (!zoneEl) return;
    var basket = zoneEl.querySelector('.mg1__zone-basket');
    if (!basket) {
      basket = document.createElement('div');
      basket.className = 'mg1__zone-basket';
      zoneEl.appendChild(basket);
    }
    var tag = document.createElement('span');
    tag.className = 'mg1__zone-item';
    tag.textContent = item.icon;
    basket.appendChild(tag);
  }

  function mg1Evaluate(chosen) {
    if (mg1Busy) return;
    mg1Busy = true;

    // Cache le feedback de l'item précédent dès que l'enfant agit
    var feedback = document.getElementById('mg1Feedback');
    var feedText = document.getElementById('mg1FeedbackText');
    feedback.hidden = true;

    var item    = ITEMS_P1[mg1Idx];
    var correct = (chosen === item.answer);
    var card    = document.getElementById('mg1Card');

    // Dépose l'emoji dans le panier de la zone choisie
    mg1AddToBasket(item, chosen);

    card.classList.add(correct ? 'mg1__card--ok' : 'mg1__card--wrong');
    feedText.textContent = correct ? item.ok : item.ko;
    feedback.hidden = false;

    // Délai plus long pour laisser le temps de lire
    var delay = correct ? 2400 : 3000;
    window.setTimeout(function () {
      mg1Idx++;
      if (mg1Idx >= ITEMS_P1.length) {
        mg1ShowSuccess();
      } else {
        mg1RenderNextItem();
        mg1Busy = false; // l'enfant peut sélectionner le suivant
      }
    }, delay);
  }

  function mg1ShowSuccess() {
    validatePoint(1);
    closeModal(mg1Modal);
    // Laisse la modale se fermer avant d'ouvrir le succès badge
    window.setTimeout(function () { showBadgeSuccess(1); }, 280);
  }

  /* ---- Drag-and-drop (touch + souris) ---- */
  /* Les listeners de mouvement sont sur mg1Modal (fixe) pour éviter
     l'accumulation. Les listeners de départ sont sur la carte (stable). */
  function mg1InitDrag() {
    if (mg1DragInited) return;
    mg1DragInited = true;

    var zoneLaisser  = document.getElementById('mg1Laisser');
    var zoneEmporter = document.getElementById('mg1Emporter');
    var dragging = false, startX, startY;

    function getXY(e) {
      return e.touches
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX,            y: e.clientY };
    }

    function currentCard() { return document.getElementById('mg1Card'); }

    function onStart(e) {
      if (mg1Busy) return;
      e.preventDefault();
      dragging = true;
      var c = getXY(e);
      startX = c.x; startY = c.y;
      var card = currentCard();
      if (card) card.style.transition = 'none';
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var card = currentCard();
      if (!card) return;
      var c  = getXY(e);
      var dx = c.x - startX, dy = c.y - startY;
      card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (dx * 0.04) + 'deg)';
      var cr = card.getBoundingClientRect();
      zoneLaisser.classList.toggle('mg1__zone--hover',
        mg1RectsOverlap(cr, zoneLaisser.getBoundingClientRect()));
      zoneEmporter.classList.toggle('mg1__zone--hover',
        mg1RectsOverlap(cr, zoneEmporter.getBoundingClientRect()));
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      var card = currentCard();
      zoneLaisser.classList.remove('mg1__zone--hover');
      zoneEmporter.classList.remove('mg1__zone--hover');
      if (!card) return;

      var cr   = card.getBoundingClientRect();
      var overL = mg1RectsOverlap(cr, zoneLaisser.getBoundingClientRect());
      var overE = mg1RectsOverlap(cr, zoneEmporter.getBoundingClientRect());

      if (overL || overE) {
        mg1WasDrop = true;
        mg1Evaluate(overL ? 'laisser' : 'emporter');
      } else {
        card.style.transition = 'transform 0.3s ease';
        card.style.transform  = 'none';
      }
    }

    // Events de mouvement sur le modal (une seule fois)
    mg1Modal.addEventListener('mousemove', onMove);
    mg1Modal.addEventListener('touchmove', onMove, { passive: false });
    mg1Modal.addEventListener('mouseup',   onEnd);
    mg1Modal.addEventListener('touchend',  onEnd);

    // Event de départ sur la carte (elle ne change pas de nœud)
    var card = currentCard();
    if (card) {
      card.addEventListener('mousedown',  onStart);
      card.addEventListener('touchstart', onStart, { passive: false });
    }

    // Tap direct sur les zones
    zoneLaisser.onclick  = function () {
      if (mg1WasDrop) { mg1WasDrop = false; return; }
      mg1Evaluate('laisser');
    };
    zoneEmporter.onclick = function () {
      if (mg1WasDrop) { mg1WasDrop = false; return; }
      mg1Evaluate('emporter');
    };
  }

  function mg1RectsOverlap(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  // Bouton retour du mini-jeu
  document.getElementById('mg1Back').addEventListener('click', function () {
    closeModal(mg1Modal);
  });

  // Bouton skip du mini-jeu point 1
  document.getElementById('mg1Skip').addEventListener('click', function () {
    mg1ShowSuccess();
  });

  /* ===================================================================
     POINT 2 — PANNEAU INFO (La prairie)
     =================================================================== */
  var point2Modal = document.getElementById('point2Modal');

  function openPoint2Info() {
    openModal(point2Modal);
  }

  document.getElementById('pt2Close').addEventListener('click', function () {
    closeModal(point2Modal);
  });

  // La carte de bienvenue mène au panneau info
  document.getElementById('pt2Launch').addEventListener('click', function () {
    closeModal(point2Modal);
    window.setTimeout(openPoint2Panel, 260);
  });

  point2Modal.addEventListener('click', function (e) {
    if (e.target === point2Modal) closeModal(point2Modal);
  });

  /* ===================================================================
     POINT 2 — PANNEAU INFO (La prairie)
     =================================================================== */
  var point2Panel = document.getElementById('point2Panel');

  function openPoint2Panel() {
    var audio   = document.getElementById('pt2Audio');
    var playBtn = document.getElementById('pt2PlayBtn');
    var wave    = document.getElementById('pt2Wave');

    audio.pause();
    audio.currentTime = 0;
    playBtn.classList.remove('is-playing');
    if (wave) wave.classList.remove('is-playing');
    var iconEl = playBtn.querySelector('.library-card__play-icon');
    if (iconEl) iconEl.textContent = '▶';

    openModal(point2Panel);

    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        playBtn.classList.add('is-playing');
        if (wave) wave.classList.add('is-playing');
        if (iconEl) iconEl.textContent = '❚❚';
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        if (wave) wave.classList.remove('is-playing');
        if (iconEl) iconEl.textContent = '▶';
      }
    };
    audio.onended = function () {
      playBtn.classList.remove('is-playing');
      if (wave) wave.classList.remove('is-playing');
      if (iconEl) iconEl.textContent = '▶';
    };
  }

  document.getElementById('pt2PanelClose').addEventListener('click', function () {
    document.getElementById('pt2Audio').pause();
    closeModal(point2Panel);
  });

  document.getElementById('pt2PanelLaunch').addEventListener('click', function () {
    document.getElementById('pt2Audio').pause();
    closeModal(point2Panel);
    window.setTimeout(openPoint2Game, 260);
  });

  point2Panel.addEventListener('click', function (e) {
    if (e.target === point2Panel) {
      document.getElementById('pt2Audio').pause();
      closeModal(point2Panel);
    }
  });

  /* ===================================================================
     POINT 2 — MINI-JEU : Jeu de mémoire
     =================================================================== */
  var mg2Modal = document.getElementById('mg2Modal');

  var PAIRS_P2 = [
    { id: 1, img: 'images/memo1.png', name: 'Ophrys miroir',
      anecdote: 'L\'Ophrys miroir imite un insecte pour attirer les abeilles !' },
    { id: 2, img: 'images/memo2.png', name: 'Chêne vert',
      anecdote: 'Le chêne vert peut survivre aux grandes sécheresses grâce à ses feuilles épaisses qui gardent mieux l\'eau !' },
    { id: 3, img: 'images/memo3.png', name: 'Viola jordanii',
      anecdote: 'La Viola jordanii aide les insectes à trouver de la nourriture au printemps !' },
    { id: 4, img: 'images/memo4.png', name: 'Rollier d\'Europe',
      anecdote: 'Le Rollier d\'Europe ressemble à un petit arc-en-ciel volant grâce à ses plumes bleu vif !' },
    { id: 5, img: 'images/memo5.png', name: 'Papillon',
      anecdote: 'Les papillons utilisent leur longue trompe pour boire le nectar des fleurs !' },
    { id: 6, img: 'images/memo6.png', name: 'Chauve-souris',
      anecdote: 'La Pipistrelle commune repère ses proies dans le noir grâce aux sons qu\'elle émet !' }
  ];

  var mg2Matched     = 0;
  var mg2Flipped     = [];
  var mg2Locked      = false;
  var mg2CloseAnecFn = null;	// listener "clic pour fermer" l'anecdote

  function openPoint2Game() {
    mg2Matched = 0;
    mg2Flipped = [];
    mg2Locked  = false;
    mg2ClearAnecListener();
    document.getElementById('mg2Anecdote').hidden = true;
    document.getElementById('mg2Counter').textContent = '0 / ' + PAIRS_P2.length;
    mg2BuildGrid();
    openModal(mg2Modal);
  }

  function mg2ClearAnecListener() {
    if (mg2CloseAnecFn) {
      document.removeEventListener('click', mg2CloseAnecFn);
      mg2CloseAnecFn = null;
    }
  }

  function mg2BuildGrid() {
    // 12 cartes images : 6 paires de 2 illustrations identiques
    var cards = [];
    PAIRS_P2.forEach(function (p) {
      cards.push({ pairId: p.id, img: p.img, name: p.name, anecdote: p.anecdote });
      cards.push({ pairId: p.id, img: p.img, name: p.name, anecdote: p.anecdote });
    });
    // Mélange (Fisher-Yates)
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp;
    }

    var grid = document.getElementById('mg2Grid');
    grid.innerHTML = cards.map(function (c, idx) {
      return '<button type="button" class="mg2-card" role="listitem"' +
               ' data-idx="' + idx + '" data-pair="' + c.pairId + '"' +
               ' aria-label="Carte cachée">' +
               '<div class="mg2-card__inner">' +
                 '<div class="mg2-card__cover" aria-hidden="true">🍃</div>' +
                 '<div class="mg2-card__reveal" aria-hidden="true">' +
                   '<img class="mg2-card__img" src="' + c.img + '" alt="' + c.name + '">' +
                 '</div>' +
               '</div>' +
             '</button>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('.mg2-card'), function (btn) {
      btn.addEventListener('click', function () { mg2Flip(btn); });
    });
  }

  function mg2Flip(card) {
    // Anecdote visible → le clic la fermera via le listener document (ne rien faire d'autre)
    if (mg2CloseAnecFn !== null) return;
    // Clic sur une paire déjà trouvée → réaffiche son anecdote
    if (card.classList.contains('is-matched')) {
      var pairId = parseInt(card.dataset.pair, 10);
      var found  = PAIRS_P2.find(function (p) { return p.id === pairId; });
      if (found) mg2ShowAnecdote(found);
      return;
    }
    if (mg2Locked) return;
    if (card.classList.contains('is-flipped')) return;

    card.classList.add('is-flipped');
    mg2Flipped.push(card);
    if (mg2Flipped.length === 2) {
      mg2Locked = true;
      window.setTimeout(mg2CheckPair, 700);
    }
  }

  function mg2CheckPair() {
    var a = mg2Flipped[0], b = mg2Flipped[1];
    // Paire = même pairId ET indices différents (deux cartes distinctes)
    var match = (a.dataset.pair === b.dataset.pair) && (a.dataset.idx !== b.dataset.idx);

    if (match) {
      a.classList.add('is-matched');
      b.classList.add('is-matched');
      mg2Matched++;
      document.getElementById('mg2Counter').textContent = mg2Matched + ' / ' + PAIRS_P2.length;

      var pair   = PAIRS_P2.find(function (p) { return p.id === parseInt(a.dataset.pair, 10); });
      var isLast = (mg2Matched >= PAIRS_P2.length);

      if (pair) mg2ShowAnecdote(pair, isLast);

      if (isLast) return; // le succès sera déclenché par le clic sur l'anecdote
    } else {
      window.setTimeout(function () {
        a.classList.remove('is-flipped');
        b.classList.remove('is-flipped');
      }, 600);
    }
    mg2Flipped = [];
    mg2Locked  = false;
  }

  function mg2ShowAnecdote(pair, isLast) {
    // Annule un éventuel listener précédent
    mg2ClearAnecListener();

    document.getElementById('mg2AnecdoteName').textContent = pair.name;
    document.getElementById('mg2AnecdoteText').textContent = pair.anecdote;
    var anecEl = document.getElementById('mg2Anecdote');
    anecEl.hidden = false;

    // Attache un listener "clic n'importe où → ferme" avec un léger délai
    // pour ne pas fermer immédiatement à cause du clic courant
    window.setTimeout(function () {
      mg2CloseAnecFn = function () {
        anecEl.hidden = true;
        document.removeEventListener('click', mg2CloseAnecFn);
        mg2CloseAnecFn = null;
        // Dernière paire : c'est le clic de l'utilisateur qui déclenche le badge
        if (isLast) mg2ShowSuccess();
      };
      document.addEventListener('click', mg2CloseAnecFn);
    }, 80);
  }

  function mg2ShowSuccess() {
    mg2ClearAnecListener();
    validatePoint(2);
    closeModal(mg2Modal);
    window.setTimeout(function () { showBadgeSuccess(2); }, 280);
  }

  document.getElementById('mg2Back').addEventListener('click', function () {
    mg2ClearAnecListener();
    closeModal(mg2Modal);
  });

  document.getElementById('mg2Skip').addEventListener('click', function () {
    mg2ShowSuccess();
  });

  /* ===================================================================
     POINT 3 — Le belvédère : Puzzle « Reconstitue la falaise »
     =================================================================== */
  var point3Modal = document.getElementById('point3Modal');
  var point3Panel = document.getElementById('point3Panel');
  var mg3Modal    = document.getElementById('mg3Modal');

  /* — Carte de bienvenue — */
  function openPoint3Info() {
    openModal(point3Modal);
  }

  document.getElementById('pt3Close').addEventListener('click', function () {
    closeModal(point3Modal);
  });

  document.getElementById('pt3Launch').addEventListener('click', function () {
    closeModal(point3Modal);
    window.setTimeout(openPoint3Panel, 260);
  });

  /* — Panneau d'informations — */
  function openPoint3Panel() {
    var audio   = document.getElementById('pt3Audio');
    var playBtn = document.getElementById('pt3PlayBtn');
    var wave    = document.getElementById('pt3Wave');
    var iconEl  = playBtn.querySelector('.library-card__play-icon');

    audio.pause();
    audio.currentTime = 0;
    playBtn.classList.remove('is-playing');
    if (wave) wave.classList.remove('is-playing');
    if (iconEl) iconEl.textContent = '▶';

    openModal(point3Panel);

    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        playBtn.classList.add('is-playing');
        if (wave) wave.classList.add('is-playing');
        if (iconEl) iconEl.textContent = '❚❚';
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        if (wave) wave.classList.remove('is-playing');
        if (iconEl) iconEl.textContent = '▶';
      }
    };
    audio.onended = function () {
      playBtn.classList.remove('is-playing');
      if (wave) wave.classList.remove('is-playing');
      if (iconEl) iconEl.textContent = '▶';
    };
  }

  document.getElementById('pt3PanelClose').addEventListener('click', function () {
    document.getElementById('pt3Audio').pause();
    closeModal(point3Panel);
  });

  document.getElementById('pt3PanelLaunch').addEventListener('click', function () {
    document.getElementById('pt3Audio').pause();
    closeModal(point3Panel);
    window.setTimeout(openPoint3Game, 260);
  });

  point3Panel.addEventListener('click', function (e) {
    if (e.target === point3Panel) {
      document.getElementById('pt3Audio').pause();
      closeModal(point3Panel);
    }
  });

  /* — Jeu de tri : Géologue en herbe — */
  var CARDS_P3 = [
    { name: 'Tuf',         emoji: '🪨', img: 'images/tuf.jpg',        bg: '#C8A870', natural: true,
      sillou: 'Le tuf, c\'est la vedette de la cascade ! L\'eau calcaire se dépose couche par couche depuis des milliers d\'années pour former cette roche unique.' },
    { name: 'Travertin',   emoji: '🗿', img: 'images/travertin.jpg',  bg: '#BFA060', natural: true,
      sillou: 'Le travertin est un cousin du tuf ! Les Romains l\'adoraient pour construire leurs monuments. On en trouve juste ici à Sillans !' },
    { name: 'Calcaire',    emoji: '⬜', img: 'images/calcaire.jpg',   bg: '#D8C8A0', natural: true,
      sillou: 'Le calcaire est l\'ingrédient secret ! L\'eau en est pleine, et en se déposant lentement, il crée le tuf et le travertin de la cascade.' },
    { name: 'Sable',       emoji: '🏖️', img: 'images/sable.jpg',      bg: '#D4B85A', natural: true,
      sillou: 'Le sable vient de l\'érosion des roches par l\'eau. Au fond de la rivière, il modèle doucement les berges de la cascade au fil des siècles !' },
    { name: 'Béton',       emoji: '🧱', img: 'images/béton.jpg',      bg: '#8C8C8C', natural: false },
    { name: 'Plastique',   emoji: '🧴', img: 'images/plastique.jpg',  bg: '#5B9BD5', natural: false },
    { name: 'Bois traité', emoji: '🪵', img: 'images/bois.jpg',       bg: '#7A5030', natural: false },
    { name: 'Verre',       emoji: '🫙', img: 'images/verre.jpg',      bg: '#6CBAC0', natural: false }
  ];

  var mg3Idx      = 0;
  var mg3Busy     = false;
  var mg3Deck     = [];
  var mg3Timer    = null;
  var mg3DragInit = false;
  var mg3CloseFn  = null;	// listener clic pour fermer le feedback

  function openPoint3Game() {
    mg3Idx  = 0;
    mg3Busy = false;
    clearTimeout(mg3Timer);

    /* Mélange Fisher-Yates */
    mg3Deck = CARDS_P3.slice();
    for (var i = mg3Deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = mg3Deck[i]; mg3Deck[i] = mg3Deck[j]; mg3Deck[j] = t;
    }

    /* Reset zones et listener */
    if (mg3CloseFn) { document.removeEventListener('click', mg3CloseFn); mg3CloseFn = null; }
    document.getElementById('mg3ZoneNatureItems').innerHTML = '';
    document.getElementById('mg3ZoneHommeItems').innerHTML  = '';

    document.getElementById('mg3Game').hidden     = false;
    document.getElementById('mg3Success').hidden  = true;
    document.getElementById('mg3Feedback').hidden = true;

    mg3RenderCard();

    if (!mg3DragInit) {
      mg3InitDrag();
      mg3DragInit = true;
    }

    openModal(mg3Modal);
  }

  function mg3RenderCard() {
    var card   = mg3Deck[mg3Idx];
    var cardEl = document.getElementById('mg3Card');
    var imgEl  = document.getElementById('mg3CardImg');
    imgEl.src = card.img;
    imgEl.alt = card.name;
    document.getElementById('mg3CardName').textContent = card.name;
    cardEl.setAttribute('aria-label', card.name);
    cardEl.style.background = card.bg;	// couleur de fallback si image absente
    cardEl.style.transform  = '';
    document.getElementById('mg3Counter').textContent =
      (mg3Idx + 1) + ' / ' + mg3Deck.length;
    /* Animation d'entrée */
    cardEl.classList.remove('is-entering');
    void cardEl.offsetWidth; // reflow
    cardEl.classList.add('is-entering');
  }

  function mg3AddToZone(zone, card) {
    var containerId = zone === 'nature' ? 'mg3ZoneNatureItems' : 'mg3ZoneHommeItems';
    var span = document.createElement('span');
    span.className   = 'mg3__zone-item';
    span.textContent = card.emoji;
    span.title       = card.name;
    document.getElementById(containerId).appendChild(span);
  }

  function mg3Sort(zone) {
    if (mg3Busy) return;
    var card      = mg3Deck[mg3Idx];
    var isCorrect = (zone === 'nature') === card.natural;

    /* Effacer les indices de drag */
    document.getElementById('mg3ZoneNature').classList.remove('is-hint');
    document.getElementById('mg3ZoneHomme').classList.remove('is-hint');

    /* Annuler un éventuel listener précédent */
    if (mg3CloseFn) { document.removeEventListener('click', mg3CloseFn); mg3CloseFn = null; }

    if (isCorrect) {
      mg3Busy = true;
      clearTimeout(mg3Timer);

      /* Flash sur la zone correcte */
      var zEl = document.getElementById(zone === 'nature' ? 'mg3ZoneNature' : 'mg3ZoneHomme');
      zEl.classList.add('is-flash');
      window.setTimeout(function () { zEl.classList.remove('is-flash'); }, 400);

      /* Voler la carte */
      var cardEl = document.getElementById('mg3Card');
      cardEl.style.transition = '';
      cardEl.style.transform  = '';
      cardEl.classList.add(zone === 'nature' ? 'is-flying-left' : 'is-flying-right');

      /* Ajouter l'emoji dans la zone */
      mg3AddToZone(zone, card);

      /* Bulle Sillou */
      var feedEl   = document.getElementById('mg3Feedback');
      var bubbleEl = document.getElementById('mg3FeedbackBubble');
      feedEl.hidden = false;
      bubbleEl.classList.remove('is-wrong');
      if (card.natural && card.sillou) {
        bubbleEl.textContent = card.sillou;
      } else {
        bubbleEl.textContent = 'Exact ! Ce matériau est bien apporté par l\'homme. 👷';
      }

      /* Clic n'importe où → passe à la carte suivante */
      window.setTimeout(function () {
        mg3CloseFn = function () {
          document.removeEventListener('click', mg3CloseFn);
          mg3CloseFn = null;
          feedEl.hidden = true;
          cardEl.classList.remove('is-flying-left', 'is-flying-right');
          mg3Idx++;
          mg3Busy = false;
          if (mg3Idx >= mg3Deck.length) {
            mg3ShowSuccess();
          } else {
            mg3RenderCard();
          }
        };
        document.addEventListener('click', mg3CloseFn);
      }, 80);

    } else {
      /* Mauvaise réponse — secousse de la carte */
      var cardEl2   = document.getElementById('mg3Card');
      cardEl2.style.transition = '';
      cardEl2.style.transform  = '';
      cardEl2.classList.remove('is-wrong');
      void cardEl2.offsetWidth;
      cardEl2.classList.add('is-wrong');
      window.setTimeout(function () { cardEl2.classList.remove('is-wrong'); }, 450);

      /* Message d'erreur — attend le clic pour disparaître */
      var feedEl2   = document.getElementById('mg3Feedback');
      var bubbleEl2 = document.getElementById('mg3FeedbackBubble');
      feedEl2.hidden = false;
      bubbleEl2.classList.add('is-wrong');
      bubbleEl2.textContent = 'Oups ! Regarde bien… Essaie de l\'autre côté ! 😊';
      mg3Busy = true;
      clearTimeout(mg3Timer);

      window.setTimeout(function () {
        mg3CloseFn = function () {
          document.removeEventListener('click', mg3CloseFn);
          mg3CloseFn = null;
          feedEl2.hidden = true;
          bubbleEl2.classList.remove('is-wrong');
          mg3Busy = false;
        };
        document.addEventListener('click', mg3CloseFn);
      }, 80);
    }
  }

  function mg3ShowSuccess() {
    document.getElementById('mg3Game').hidden    = true;
    document.getElementById('mg3Success').hidden = false;
  }

  /* — Swipe / drag sur la carte — */
  function mg3InitDrag() {
    var cardEl = document.getElementById('mg3Card');
    var ds = { active: false, startX: 0, curX: 0 };

    function onStart(x) {
      if (mg3Busy) return;
      ds.active = true;
      ds.startX = x;
      ds.curX   = 0;
      cardEl.style.transition = 'none';
    }
    function onMove(x) {
      if (!ds.active) return;
      ds.curX = x - ds.startX;
      var rot = ds.curX * 0.1;
      cardEl.style.transform = 'translateX(' + ds.curX + 'px) rotate(' + rot + 'deg)';
      if (ds.curX < -35) {
        document.getElementById('mg3ZoneNature').classList.add('is-hint');
        document.getElementById('mg3ZoneHomme').classList.remove('is-hint');
      } else if (ds.curX > 35) {
        document.getElementById('mg3ZoneHomme').classList.add('is-hint');
        document.getElementById('mg3ZoneNature').classList.remove('is-hint');
      } else {
        document.getElementById('mg3ZoneNature').classList.remove('is-hint');
        document.getElementById('mg3ZoneHomme').classList.remove('is-hint');
      }
    }
    function onEnd() {
      if (!ds.active) return;
      ds.active = false;
      document.getElementById('mg3ZoneNature').classList.remove('is-hint');
      document.getElementById('mg3ZoneHomme').classList.remove('is-hint');
      if (Math.abs(ds.curX) < 65) {
        /* Retour au centre avec transition */
        cardEl.style.transition = 'transform .24s ease';
        cardEl.style.transform  = 'none';
        window.setTimeout(function () { cardEl.style.transition = ''; }, 250);
        return;
      }
      cardEl.style.transition = '';
      cardEl.style.transform  = '';
      mg3Sort(ds.curX < 0 ? 'nature' : 'homme');
    }

    /* Touch */
    cardEl.addEventListener('touchstart', function (e) {
      onStart(e.touches[0].clientX);
    }, { passive: true });
    cardEl.addEventListener('touchmove', function (e) {
      e.preventDefault();
      onMove(e.touches[0].clientX);
    }, { passive: false });
    cardEl.addEventListener('touchend', onEnd);
    /* Mouse (desktop) */
    cardEl.addEventListener('mousedown', function (e) { onStart(e.clientX); });
    document.addEventListener('mousemove', function (e) { if (ds.active) onMove(e.clientX); });
    document.addEventListener('mouseup', function () { if (ds.active) onEnd(); });
  }

  /* Boutons de zone */
  document.getElementById('mg3ZoneNature').addEventListener('click', function () {
    if (!mg3Busy) mg3Sort('nature');
  });
  document.getElementById('mg3ZoneHomme').addEventListener('click', function () {
    if (!mg3Busy) mg3Sort('homme');
  });

  /* Bouton valider (écran succès) */
  document.getElementById('mg3ValidateBtn').addEventListener('click', function () {
    validatePoint(3);
    closeModal(mg3Modal);
    window.setTimeout(function () { showBadgeSuccess(3); }, 280);
  });

  document.getElementById('mg3Back').addEventListener('click', function () {
    clearTimeout(mg3Timer);
    if (mg3CloseFn) { document.removeEventListener('click', mg3CloseFn); mg3CloseFn = null; }
    document.getElementById('pt3Audio') && document.getElementById('pt3Audio').pause();
    closeModal(mg3Modal);
  });

  document.getElementById('mg3Skip').addEventListener('click', function () {
    clearTimeout(mg3Timer);
    if (mg3CloseFn) { document.removeEventListener('click', mg3CloseFn); mg3CloseFn = null; }
    validatePoint(3);
    closeModal(mg3Modal);
    window.setTimeout(function () { showBadgeSuccess(3); }, 280);
  });

  /* ===================================================================
     POINT 4 — La passerelle : Quiz « Pourquoi cette passerelle ? »
     =================================================================== */
  var point4Modal = document.getElementById('point4Modal');
  var point4Panel = document.getElementById('point4Panel');
  var mg4Modal    = document.getElementById('mg4Modal');

  /* — Carte de bienvenue — */
  function openPoint4Info() { openModal(point4Modal); }

  document.getElementById('pt4Close').addEventListener('click', function () {
    closeModal(point4Modal);
  });
  document.getElementById('pt4Launch').addEventListener('click', function () {
    closeModal(point4Modal);
    window.setTimeout(openPoint4Panel, 260);
  });

  /* — Panneau d'informations — */
  function openPoint4Panel() {
    var audio   = document.getElementById('pt4Audio');
    var playBtn = document.getElementById('pt4PlayBtn');
    var wave    = document.getElementById('pt4Wave');
    var iconEl  = playBtn.querySelector('.library-card__play-icon');

    audio.pause();
    audio.currentTime = 0;
    playBtn.classList.remove('is-playing');
    if (wave)   wave.classList.remove('is-playing');
    if (iconEl) iconEl.textContent = '▶';

    openModal(point4Panel);

    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        playBtn.classList.add('is-playing');
        if (wave)   wave.classList.add('is-playing');
        if (iconEl) iconEl.textContent = '❚❚';
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        if (wave)   wave.classList.remove('is-playing');
        if (iconEl) iconEl.textContent = '▶';
      }
    };
    audio.onended = function () {
      playBtn.classList.remove('is-playing');
      if (wave)   wave.classList.remove('is-playing');
      if (iconEl) iconEl.textContent = '▶';
    };
  }

  document.getElementById('pt4PanelClose').addEventListener('click', function () {
    document.getElementById('pt4Audio').pause();
    closeModal(point4Panel);
  });
  document.getElementById('pt4PanelLaunch').addEventListener('click', function () {
    document.getElementById('pt4Audio').pause();
    closeModal(point4Panel);
    window.setTimeout(openPoint4Game, 260);
  });
  point4Panel.addEventListener('click', function (e) {
    if (e.target === point4Panel) {
      document.getElementById('pt4Audio').pause();
      closeModal(point4Panel);
    }
  });

  /* — Données quiz — */
  var QUIZ_P4 = [
    {
      emoji: '🌧️',
      q: 'Pourquoi a-t-on créé cette passerelle plutôt qu\'un simple sentier ?',
      choices: [
        { txt: 'Pour traverser sans abîmer les zones humides',                correct: true  },
        { txt: 'Pour faire plus de sport',                                    correct: false },
        { txt: 'Pour raccourcir le chemin',                                   correct: false }
      ],
      expl: 'La passerelle passe au-dessus des zones humides sans les écraser. Un simple sentier abîmerait les plantes et la boue du bord de rivière !'
    },
    {
      emoji: '🐦',
      q: 'Pourquoi certaines zones sont-elles interdites au public ?',
      choices: [
        { txt: 'Pour laisser les animaux se nourrir, se reposer ou se reproduire tranquillement', correct: true  },
        { txt: 'Parce qu\'elles sont réservées aux gardes',                   correct: false },
        { txt: 'Parce qu\'il n\'y a rien à voir',                             correct: false }
      ],
      expl: 'Les animaux ont besoin de calme pour dormir, manger et élever leurs petits. Si on les dérange, ils risquent d\'abandonner leurs nids !'
    },
    {
      emoji: '🦋',
      q: 'Pourquoi faut-il rester sur le chemin ?',
      choices: [
        { txt: 'Pour ne pas se perdre',                                       correct: false },
        { txt: 'Pour protéger les plantes et les animaux du site',            correct: true  },
        { txt: 'Pour marcher plus vite',                                      correct: false }
      ],
      expl: 'En dehors du chemin, on risque d\'écraser des plantes rares, des œufs d\'oiseaux ou de petits animaux cachés dans la végétation !'
    },
    {
      emoji: '🌍',
      q: 'Selon toi, pourquoi réalise-t-on tous ces aménagements ?',
      choices: [
        { txt: 'Pour rendre le site plus beau',                               correct: false },
        { txt: 'Pour permettre aux visiteurs de découvrir le site tout en protégeant la nature', correct: true  },
        { txt: 'Pour construire le plus possible',                            correct: false }
      ],
      expl: 'Ces aménagements trouvent le bon équilibre : visiter sans abîmer. On peut profiter de la nature tout en la respectant !'
    }
  ];

  var mg4QuizIdx = 0;

  /* Mélange un tableau (Fisher-Yates) */
  function mg4Shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function openPoint4Game() {
    mg4QuizIdx = 0;

    document.getElementById('mg4QuizSection').hidden = false;
    document.getElementById('mg4ProgFill').style.width = '0%';

    mg4ShowQuestion(0);
    openModal(mg4Modal);
  }

  function mg4ShowQuestion(idx) {
    var q = QUIZ_P4[idx];

    /* Progression */
    document.getElementById('mg4ProgLabel').textContent = 'Question ' + (idx + 1) + ' / ' + QUIZ_P4.length;
    document.getElementById('mg4ProgFill').style.width  = (idx / QUIZ_P4.length * 100) + '%';
    document.getElementById('mg4ProgBar').setAttribute('aria-valuenow', idx / QUIZ_P4.length * 100);

    /* Question */
    document.getElementById('mg4Question').innerHTML =
      '<span class="mg4__question-emoji">' + q.emoji + '</span>' +
      '<span class="mg4__question-text">'  + q.q    + '</span>';


    /* Choix mélangés */
    var shuffled  = mg4Shuffle(q.choices);
    var choicesEl = document.getElementById('mg4Choices');
    var letters   = ['a', 'b', 'c'];
    choicesEl.innerHTML = '';
    shuffled.forEach(function (choice, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg4__choice';
      btn.innerHTML =
        '<span class="mg4__choice-ico">' + letters[i] + '</span>' +
        '<span class="mg4__choice-txt">' + choice.txt + '</span>';
      btn.addEventListener('click', function () {
        mg4HandleAnswer(btn, choice.correct, q.expl);
      });
      choicesEl.appendChild(btn);
    });

    /* Reset feedback */
    var fb = document.getElementById('mg4Feedback');
    fb.hidden = true;
    fb.classList.remove('is-correct', 'is-wrong');
    document.getElementById('mg4Next').hidden = true;
  }

  function mg4HandleAnswer(selected, isCorrect, expl) {
    /* Désactiver tous les boutons + coloriser */
    var btns = document.getElementById('mg4Choices').querySelectorAll('.mg4__choice');
    Array.prototype.forEach.call(btns, function (btn) {
      btn.disabled = true;
    });
    selected.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    /* Si mauvaise réponse → montrer aussi la bonne */
    if (!isCorrect) {
      var allChoices = QUIZ_P4[mg4QuizIdx].choices;
      Array.prototype.forEach.call(btns, function (btn) {
        /* cherche le bouton dont le texte correspond à la bonne réponse */
        var t = btn.querySelector('.mg4__choice-txt').textContent;
        for (var i = 0; i < allChoices.length; i++) {
          if (allChoices[i].correct && allChoices[i].txt === t) {
            btn.classList.add('is-correct');
          }
        }
      });
    }

    /* Feedback Sillou */
    var fb     = document.getElementById('mg4Feedback');
    var bubble = document.getElementById('mg4FeedbackBubble');
    fb.hidden = false;
    fb.classList.toggle('is-correct', isCorrect);
    fb.classList.toggle('is-wrong',  !isCorrect);
    bubble.innerHTML =
      '<strong>' + (isCorrect ? 'Bravo ! 🎉' : 'Pas tout à fait… 💡') + '</strong>' +
      '<p>' + expl + '</p>';

    document.getElementById('mg4Next').hidden = false;
  }

  document.getElementById('mg4Next').addEventListener('click', function () {
    mg4QuizIdx++;
    if (mg4QuizIdx >= QUIZ_P4.length) {
      validatePoint(4);
      closeModal(mg4Modal);
      window.setTimeout(function () { showBadgeSuccess(4); }, 280);
    } else {
      mg4ShowQuestion(mg4QuizIdx);
    }
  });

  document.getElementById('mg4Back').addEventListener('click', function () {
    document.getElementById('pt4Audio') && document.getElementById('pt4Audio').pause();
    closeModal(mg4Modal);
  });

  document.getElementById('mg4Skip').addEventListener('click', function () {
    validatePoint(4);
    closeModal(mg4Modal);
    window.setTimeout(function () { showBadgeSuccess(4); }, 280);
  });

  /* ===================================================================
     POINT 5 — Cascade : Mémoire du Gardien + Message des Gardiens
     =================================================================== */
  var point5Modal  = document.getElementById('point5Modal');
  var point5Panel  = document.getElementById('point5Panel');
  var mg5Modal     = document.getElementById('mg5Modal');
  var mg5SonModal  = document.getElementById('mg5SonModal');

  /* — Carte de bienvenue — */
  function openPoint5Info() { openModal(point5Modal); }

  document.getElementById('pt5Close').addEventListener('click', function () {
    closeModal(point5Modal);
  });
  document.getElementById('pt5Launch').addEventListener('click', function () {
    closeModal(point5Modal);
    window.setTimeout(openPoint5Panel, 260);
  });

  /* — Panneau d'informations — */
  function openPoint5Panel() {
    var audio   = document.getElementById('pt5Audio');
    var playBtn = document.getElementById('pt5PlayBtn');
    var wave    = document.getElementById('pt5Wave');
    var iconEl  = playBtn.querySelector('.library-card__play-icon');

    audio.pause(); audio.currentTime = 0;
    playBtn.classList.remove('is-playing');
    if (wave)   wave.classList.remove('is-playing');
    if (iconEl) iconEl.textContent = '▶';
    openModal(point5Panel);

    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play().catch(function () {});
        playBtn.classList.add('is-playing');
        if (wave)   wave.classList.add('is-playing');
        if (iconEl) iconEl.textContent = '❚❚';
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        if (wave)   wave.classList.remove('is-playing');
        if (iconEl) iconEl.textContent = '▶';
      }
    };
    audio.onended = function () {
      playBtn.classList.remove('is-playing');
      if (wave)   wave.classList.remove('is-playing');
      if (iconEl) iconEl.textContent = '▶';
    };
  }

  document.getElementById('pt5PanelClose').addEventListener('click', function () {
    document.getElementById('pt5Audio').pause();
    closeModal(point5Panel);
  });
  document.getElementById('pt5PanelLaunch').addEventListener('click', function () {
    document.getElementById('pt5Audio').pause();
    closeModal(point5Panel);
    window.setTimeout(openPoint5SoundGame, 260);
  });
  point5Panel.addEventListener('click', function (e) {
    if (e.target === point5Panel) {
      document.getElementById('pt5Audio').pause();
      closeModal(point5Panel);
    }
  });

  /* ------------------------------------------------------------------ */
  /* POINT 5 — Écoute la rivière (relier le son à l'image)             */
  /* ------------------------------------------------------------------ */
  var mg5SonAudioEl  = null;	// <Audio> en cours
  var mg5SonIdx      = 0;		// index dans le deck mélangé
  var mg5SonDeck     = [];		// sons dans l'ordre mélangé
  var mg5SonAnswered = false;	// verrou anti-double-clic

  var SOUNDS_P5 = [
    { id: 1, name: 'La cascade',   emoji: '💦', img: 'images/cascade.jpg',  src: 'audio/son_cascade.mp3',
      anecdote: 'La cascade de Sillans plonge de <strong>42 mètres</strong> ! Son grondement résonne dans toute la vallée.' },
    { id: 2, name: "L'insecte",    emoji: '🦋', img: 'images/insecte.jpg',  src: 'audio/son_insecte.mp3',
      anecdote: 'Les insectes adorent les bords de rivière ! Les libellules pondent leurs œufs dans l\'eau.' },
    { id: 3, name: 'Le rollier',   emoji: '🐦', img: 'images/oiseau.jpg',   src: 'audio/son_oiseau.mp3',
      anecdote: 'Le rollier est un oiseau aux couleurs éclatantes. Son chant sert à défendre son territoire !' },
    { id: 4, name: 'Les pas',      emoji: '👣', img: 'images/pas.jpg',      src: 'audio/son_pas.mp3',
      anecdote: 'Sur la passerelle en bois les pas résonnent. Marche doucement pour ne pas déranger les animaux !' },
    { id: 5, name: 'Les feuilles', emoji: '🍂', img: 'images/feuille.jpg',  src: 'audio/son_feuille.mp3',
      anecdote: 'Le bruissement des feuilles, c\'est le vent qui joue dans les arbres au bord de la rivière !' }
  ];

  function openPoint5SoundGame() {
    if (mg5SonAudioEl) { mg5SonAudioEl.pause(); mg5SonAudioEl = null; }

    /* Mélange le deck (Fisher-Yates) */
    mg5SonDeck = SOUNDS_P5.slice();
    for (var i = mg5SonDeck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = mg5SonDeck[i]; mg5SonDeck[i] = mg5SonDeck[j]; mg5SonDeck[j] = tmp;
    }
    mg5SonIdx      = 0;
    mg5SonAnswered = false;

    document.getElementById('mg5SonGame').hidden    = false;
    document.getElementById('mg5SonSuccess').hidden = true;
    document.getElementById('mg5SonFeedback').hidden = true;
    document.getElementById('mg5SonNext').hidden     = true;

    openModal(mg5SonModal);
    window.setTimeout(mg5SonBuildRound, 240);
  }

  function mg5SonBuildRound() {
    var currentSound = mg5SonDeck[mg5SonIdx];
    mg5SonAnswered   = false;

    /* Compteur */
    document.getElementById('mg5SonCounter').textContent =
      'Son ' + (mg5SonIdx + 1) + ' / ' + SOUNDS_P5.length;

    /* Reset feedback / bouton suivant */
    document.getElementById('mg5SonFeedback').hidden = true;
    document.getElementById('mg5SonNext').hidden     = true;

    /* Bouton play : reset état */
    var playBig = document.getElementById('mg5SonPlayBig');
    playBig.classList.remove('is-playing');
    playBig.setAttribute('aria-label', 'Écouter le son');

    /* Bouton play : écouter le son courant */
    playBig.onclick = function () {
      mg5SonPlay(currentSound, playBig);
    };

    /* Grille : 5 images mélangées */
    var grid = document.getElementById('mg5SonImgGrid');
    grid.innerHTML = '';

    var shuffled = SOUNDS_P5.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }

    shuffled.forEach(function (sound) {
      var card = document.createElement('div');
      card.className = 'mg5son__img-card';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Image ' + sound.name);
      card.setAttribute('tabindex', '0');

      var img = document.createElement('img');
      img.src = sound.img;
      img.alt = sound.name;
      card.appendChild(img);
      grid.appendChild(card);

      card.addEventListener('click', function () {
        mg5SonHandleAnswer(card, sound, currentSound);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          mg5SonHandleAnswer(card, sound, currentSound);
        }
      });
    });

    /* Auto-play après un léger délai */
    window.setTimeout(function () {
      mg5SonPlay(currentSound, playBig);
    }, 350);
  }

  function mg5SonPlay(sound, playBig) {
    if (mg5SonAudioEl) { mg5SonAudioEl.pause(); mg5SonAudioEl = null; }
    var audio = new Audio(sound.src);
    mg5SonAudioEl = audio;
    playBig.classList.add('is-playing');
    audio.play().catch(function () {});
    audio.addEventListener('ended', function () {
      playBig.classList.remove('is-playing');
    });
  }

  function mg5SonHandleAnswer(card, sound, currentSound) {
    if (mg5SonAnswered) return;

    if (sound.id === currentSound.id) {
      /* ✔ Bonne réponse */
      mg5SonAnswered = true;
      if (mg5SonAudioEl) { mg5SonAudioEl.pause(); }

      card.classList.add('is-correct');

      /* Désactive toutes les cartes */
      var allCards = document.querySelectorAll('#mg5SonImgGrid .mg5son__img-card');
      allCards.forEach(function (c) { c.style.pointerEvents = 'none'; });

      /* Feedback anecdote */
      document.getElementById('mg5SonFeedbackBubble').innerHTML = currentSound.anecdote;
      document.getElementById('mg5SonFeedback').hidden = false;
      document.getElementById('mg5SonNext').hidden     = false;

    } else {
      /* ✗ Mauvaise réponse — secousse */
      card.classList.add('is-wrong');
      window.setTimeout(function () { card.classList.remove('is-wrong'); }, 420);
    }
  }

  document.getElementById('mg5SonNext').addEventListener('click', function () {
    mg5SonIdx++;
    if (mg5SonIdx >= SOUNDS_P5.length) {
      /* Tous les sons associés → badge directement */
      if (mg5SonAudioEl) { mg5SonAudioEl.pause(); }
      validatePoint(5);
      closeModal(mg5SonModal);
      window.setTimeout(function () { showBadgeSuccess(5); }, 280);
    } else {
      mg5SonBuildRound();
    }
  });

  document.getElementById('mg5SonValidate').addEventListener('click', function () {
    validatePoint(5);
    closeModal(mg5SonModal);
    window.setTimeout(function () { showBadgeSuccess(5); }, 280);
  });

  document.getElementById('mg5SonBack').addEventListener('click', function () {
    if (mg5SonAudioEl) { mg5SonAudioEl.pause(); }
    closeModal(mg5SonModal);
  });

  document.getElementById('mg5SonSkip').addEventListener('click', function () {
    if (mg5SonAudioEl) { mg5SonAudioEl.pause(); }
    validatePoint(5);
    closeModal(mg5SonModal);
    window.setTimeout(function () { showBadgeSuccess(5); }, 280);
  });

  /* — Données jeu d'association (point 6) — */
  var PAIRS_P5 = [
    { id: 1, icon: '⛪', loc: 'Église',     rule: 'Préparer son sac pour une balade responsable',          msg: 'L\'église marque le départ. Un bon explorateur se prépare toujours avant de partir !' },
    { id: 2, icon: '🌸', loc: 'Prairie',    rule: 'Découvrir les espèces qui vivent autour de Sillans',    msg: 'La prairie abrite des plantes et animaux rares. Un Gardien sait observer sans déranger !' },
    { id: 3, icon: '🏞️', loc: 'Belvédère',  rule: 'Observer le paysage depuis les zones sécurisées',       msg: 'Le belvédère offre la plus belle vue ! Un Gardien reste sur les zones prévues pour protéger le site.' },
    { id: 4, icon: '🌉', loc: 'Passerelle', rule: 'Respecter les aménagements qui protègent la nature',    msg: 'La passerelle protège le sol fragile. Un Gardien marche toujours sur les chemins prévus !' },
    { id: 5, icon: '💦', loc: 'Cascade',    rule: 'Préserver ce lieu exceptionnel pour les générations futures', msg: 'La cascade est le joyau de Sillans. Ensemble, nous pouvons la garder belle pour toujours !' }
  ];

  var mg5SelectedLocId  = null;	// id de la carte Étape sélectionnée (sens normal)
  var mg5SelectedRuleId = null;	// id de la règle sélectionnée (sens inverse)
  var mg5MatchedCount   = 0;
  var mg5FeedTimer      = null;

  function openPoint5Game() {
    mg5SelectedLocId  = null;
    mg5SelectedRuleId = null;
    mg5MatchedCount   = 0;

    /* Reset sections */
    document.getElementById('mg5MatchSection').hidden   = false;
    document.getElementById('mg5MatchSuccess').hidden   = true;
    document.getElementById('mg5MatchFeedback').hidden  = true;
    document.getElementById('mg5Counter').textContent   = '0 / 5 paires trouvées';
    document.getElementById('mg5HeaderTitle').textContent = 'Mémoire du Gardien';

    mg5BuildGame();
    openModal(mg5Modal);
  }

  function mg5BuildGame() {
    /* Étapes (ordre fixe) */
    var locsEl = document.getElementById('mg5Locs');
    locsEl.innerHTML = '';
    PAIRS_P5.forEach(function (pair) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg5__loc-card';
      btn.dataset.pairId = pair.id;
      btn.innerHTML =
        '<span class="mg5__loc-icon">' + pair.icon + '</span>' +
        '<span class="mg5__loc-name">' + pair.loc  + '</span>';
      btn.addEventListener('click', function () { mg5SelectLoc(pair.id, btn); });
      locsEl.appendChild(btn);
    });

    /* Règles mélangées */
    var shuffled = PAIRS_P5.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    var rulesEl = document.getElementById('mg5Rules');
    rulesEl.innerHTML = '';
    shuffled.forEach(function (pair) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mg5__rule-card';
      btn.dataset.pairId = pair.id;
      btn.innerHTML =
        '<span class="mg5__rule-text">' + pair.rule  + '</span>' +
        '<span class="mg5__rule-check" aria-hidden="true">✓</span>';
      btn.addEventListener('click', function () { mg5TryRule(pair.id, btn); });
      rulesEl.appendChild(btn);
    });
  }

  /* — Nettoie toutes les sélections en cours — */
  function mg5ClearSelection() {
    mg5SelectedLocId  = null;
    mg5SelectedRuleId = null;
    document.querySelectorAll('.mg5__loc-card.is-selected, .mg5__rule-card.is-selected').forEach(function (el) {
      el.classList.remove('is-selected');
    });
  }

  /* — Tentative de correspondance étape ↔ règle — */
  function mg5TryMatch(locId, ruleId) {
    mg5ClearSelection();

    if (locId === ruleId) {
      /* ✔ Bonne paire ! */
      var rBtn = document.querySelector('.mg5__rule-card[data-pair-id="' + ruleId + '"]');
      var lBtn = document.querySelector('.mg5__loc-card[data-pair-id="' + locId  + '"]');
      if (rBtn) { rBtn.classList.add('is-matched'); rBtn.disabled = true; }
      if (lBtn) { lBtn.classList.add('is-matched'); lBtn.disabled = true; }

      var pair = null;
      for (var k = 0; k < PAIRS_P5.length; k++) {
        if (PAIRS_P5[k].id === ruleId) { pair = PAIRS_P5[k]; break; }
      }
      mg5MatchedCount++;
      document.getElementById('mg5Counter').textContent = mg5MatchedCount + ' / 5 paires trouvées';
      if (pair) { mg5ShowMatchFeedback(pair.icon + ' ' + pair.msg); }

      if (mg5MatchedCount >= PAIRS_P5.length) {
        window.setTimeout(function () {
          document.getElementById('mg5MatchFeedback').hidden = true;
          document.getElementById('mg5MatchSuccess').hidden  = false;
        }, 2000);
      }
    } else {
      /* ✘ Mauvaise paire — shake sur la règle */
      var wBtn = document.querySelector('.mg5__rule-card[data-pair-id="' + ruleId + '"]');
      if (wBtn) {
        wBtn.classList.add('is-wrong');
        window.setTimeout(function () { wBtn.classList.remove('is-wrong'); }, 600);
      }
    }
  }

  /* — Sélection d'une étape (sens normal : étape → règle) — */
  function mg5SelectLoc(id, btn) {
    if (btn.classList.contains('is-matched')) return;
    /* Si une règle est déjà sélectionnée → matcher directement */
    if (mg5SelectedRuleId !== null) {
      mg5TryMatch(id, mg5SelectedRuleId);
      return;
    }
    /* Toggle sélection */
    var prev = document.querySelector('.mg5__loc-card.is-selected');
    if (prev) prev.classList.remove('is-selected');
    if (mg5SelectedLocId === id) { mg5SelectedLocId = null; return; }
    btn.classList.add('is-selected');
    mg5SelectedLocId = id;
  }

  /* — Sélection d'une règle (sens normal ou sens inverse) — */
  function mg5TryRule(ruleId, btn) {
    if (btn.classList.contains('is-matched')) return;
    /* Sens normal : une étape est sélectionnée → matcher */
    if (mg5SelectedLocId !== null) {
      mg5TryMatch(mg5SelectedLocId, ruleId);
      return;
    }
    /* Sens inverse : sélectionner / désélectionner cette règle */
    var prev = document.querySelector('.mg5__rule-card.is-selected');
    if (prev) prev.classList.remove('is-selected');
    if (mg5SelectedRuleId === ruleId) { mg5SelectedRuleId = null; return; }
    btn.classList.add('is-selected');
    mg5SelectedRuleId = ruleId;
  }

  function mg5ShowMatchFeedback(text) {
    if (mg5FeedTimer) window.clearTimeout(mg5FeedTimer);
    var el   = document.getElementById('mg5MatchFeedback');
    var txt  = document.getElementById('mg5MatchFeedbackText');
    txt.textContent = text;
    el.hidden = false;
    mg5FeedTimer = window.setTimeout(function () {
      if (mg5MatchedCount < PAIRS_P5.length) el.hidden = true;
    }, 2200);
  }

  /* Bouton valider (écran succès) — maintenant au point 6 */
  document.getElementById('mg5ValidateBtn').addEventListener('click', function () {
    validatePoint(6);
    closeModal(mg5Modal);
    window.setTimeout(function () { showBadgeSuccess(6); }, 280);
  });

  document.getElementById('mg5Back').addEventListener('click', function () {
    closeModal(mg5Modal);
  });

  document.getElementById('mg5Skip').addEventListener('click', function () {
    validatePoint(6);
    closeModal(mg5Modal);
    window.setTimeout(function () { showBadgeSuccess(6); }, 280);
  });

  /* ===================================================================
     BLASON MAÎTRE — s'assemble badge par badge
     =================================================================== */
  var MASTER_SRCS = [
    'images/Badge/blason vide.png',            // 0 – aucun point
    'images/Badge/blason vide.png',            // 1 – point 1 (base débloquée)
    'images/Badge/Badge 2 sur blason.png',     // 2 – oiseau (prairie)
    'images/Badge/Badge 3 sur blason.png',     // 3 – + montagne (belvédère)
    'images/Badge/Badge 4 sur blason.png',     // 4 – + passerelle
    'images/Badge/Badge 5 sur blason.png',     // 5 – + cascade
    'images/Badge/Badge 6 sur blason.png',     // 6 – village = blason complet
  ];

  var MASTER_CAPTIONS = [
    'Commence le parcours pour assembler ton blason !',
    'La base est débloquée — direction la prochaine étape !',
    '1/5 · L\'oiseau est arrivé ! Continue…',
    '2/5 · La montagne aussi ! Encore 3…',
    '3/5 · La passerelle est posée ! Bravo !',
    '4/5 · La cascade scintille ! Encore une…',
    '🏆 Blason complet ! Tu es le gardien de Sillans !',
  ];

  function getMasterIdx() {
    for (var n = 6; n >= 1; n--) {
      if (state.completed.includes(n)) return n;
    }
    return 0;
  }

  function renderMasterBadge(animate) {
    var img     = document.getElementById('masterBadgeImg');
    var caption = document.getElementById('masterBadgeCaption');
    if (!img) return;

    var idx    = getMasterIdx();
    var newSrc = encodeURI(MASTER_SRCS[idx]);

    img.src = newSrc;

    // Gestion des classes d'état
    img.classList.remove('is-complete');
    if (idx >= 6) {
      img.classList.add('is-complete');
    } else if (animate && idx >= 1) {
      img.classList.remove('is-assembling');
      void img.offsetWidth; // force reflow pour relancer l'anim
      img.classList.add('is-assembling');
      img.addEventListener('animationend', function () {
        img.classList.remove('is-assembling');
      }, { once: true });
    }

    if (caption) caption.textContent = MASTER_CAPTIONS[idx];
  }

  /* ===================================================================
     MODALE SUCCÈS BADGE — partagée par tous les points
     =================================================================== */
  var BADGE_SUCCESS_DATA = [
    null, // index 0 inutilisé
    { name: 'Badge de Départ débloqué !',       hint: 'Complète les 5 étapes du parcours pour remplir ton blason !',  toast: 'Point 1 validé ! Direction le prochain arrêt 🌿' },
    { name: 'Badge Prairie débloqué !',          hint: 'L\'oiseau s\'est posé sur ton blason. Continue !',             toast: 'Point 2 validé ! 🌿' },
    { name: 'Badge du Belvédère débloqué !',    hint: 'La montagne ornera bientôt tout ton blason…',                  toast: 'Point 3 validé ! ⛰️' },
    { name: 'Badge de la Passerelle débloqué !', hint: 'La passerelle est gravée dans ton blason !',                  toast: 'Point 4 validé ! 🌉' },
    { name: 'Badge de la Cascade débloqué !',   hint: 'La cascade scintille sur ton blason. Plus qu\'une étape !',    toast: 'Point 5 validé ! 💧' },
    { name: '🏆 Blason complet !',              hint: 'Tu es le gardien de Sillans ! Félicitations, aventurier !',    toast: '🏆 Parcours terminé ! Tu es le gardien de Sillans !' },
  ];

  function showBadgeSuccess(n) {
    var data = BADGE_SUCCESS_DATA[n];
    if (!data) return;

    var modal  = document.getElementById('badgeSuccessModal');
    var blason = document.getElementById('badgeSuccessBlason');
    var nameEl = document.getElementById('badgeSuccessName');
    var hintEl = document.getElementById('badgeSuccessHint');
    var btn    = document.getElementById('badgeSuccessBtn');

    // Affiche l'état PRÉCÉDENT du blason (avant ce point)
    var prevIdx = Math.max(n - 1, 0);
    blason.src = encodeURI(MASTER_SRCS[prevIdx]);
    blason.className = 'badge-success__blason'; // reset des classes d'anim

    nameEl.textContent = data.name;
    hintEl.textContent = data.hint;

    openModal(modal);

    // Après un court délai, on « stampe » le nouveau morceau du blason
    var stampDelay = (n === 1) ? 400 : 750;
    var stampTimer = window.setTimeout(function () {
      blason.src = encodeURI(MASTER_SRCS[n]);
      void blason.offsetWidth; // force reflow pour relancer l'animation
      blason.classList.add('is-stamping');
      blason.addEventListener('animationend', function () {
        blason.classList.remove('is-stamping');
        blason.classList.add('is-glowing');
      }, { once: true });
    }, stampDelay);

    // Remplace le bouton (évite l'accumulation de listeners)
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Pour le dernier point (n === TOTAL), le bouton mène à l'écran de fin
    if (n === TOTAL) {
      newBtn.textContent = 'Découvrir ma surprise ! 🎁';
      newBtn.addEventListener('click', function () {
        window.clearTimeout(stampTimer);
        closeModal(modal);
        window.setTimeout(function () { showFinishScreen(); }, 260);
      });
    } else {
      newBtn.addEventListener('click', function () {
        window.clearTimeout(stampTimer);
        closeModal(modal);
        showToast(data.toast);
      });
    }
  }

  /* ===================================================================
     QUÊTE ACTUELLE
     =================================================================== */
  const questText = document.getElementById('questText');
  const questBar = document.getElementById('questBar');
  const questPercent = document.getElementById('questPercent');

  function renderQuest() {
    const percent = Math.round((state.completed.length / TOTAL) * 100);
    questBar.style.width = percent + '%';
    questPercent.textContent = percent + '%';

    if (state.current > TOTAL) {
      questText.textContent = 'Bravo, tu as terminé tout le parcours de Sillans ! 🏆';
    } else {
      questText.textContent = 'Rend toi au point n°' + state.current + ', pour débloquer le prochain mini-jeu';
    }
  }

  /* ===================================================================
     BADGES
     =================================================================== */
  const badgesGrid = document.getElementById('badgesGrid');

  function renderBadges() {
    badgesGrid.innerHTML = GAME_POINTS.map(function (p) {
      const unlocked = state.completed.includes(p.n);
      return (
        '<button type="button" class="badge ' + (unlocked ? 'is-unlocked' : 'is-locked') + '" data-point="' + p.n + '">' +
          '<img class="badge__img" src="' + encodeURI(p.badge) + '" alt="Badge ' + p.name + '">' +
          (unlocked ? '' : '<span class="badge__lock" aria-hidden="true">' + LOCK_SVG + '</span>') +
        '</button>'
      );
    }).join('');

    Array.prototype.forEach.call(badgesGrid.querySelectorAll('.badge'), function (el) {
      el.addEventListener('click', function () {
        const n = parseInt(el.dataset.point, 10);
        const p = POINTS.find(function (pt) { return pt.n === n; });
        if (p) onPointClick(p);
      });
    });
  }

  /* ===================================================================
     PWA — enregistrement du SW + capture du prompt d'installation
     =================================================================== */
  var _pwaPrompt = null;  // BeforeInstallPromptEvent intercepté

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* Détection iOS (pas de beforeinstallprompt sur Safari) */
  var _isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var _isInStandaloneMode = ('standalone' in window.navigator) && window.navigator.standalone;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _pwaPrompt = e;
    /* Affiche le bouton téléchargement si le prompt est dispo */
    var banner = document.getElementById('downloadBanner');
    if (banner) banner.hidden = false;
  });

  /* ===================================================================
     POP-UP TÉLÉCHARGEMENT
     =================================================================== */
  const downloadModal = document.getElementById('downloadModal');

  document.getElementById('downloadBanner').addEventListener('click', function () {
    openModal(downloadModal);
  });

  document.getElementById('downloadConfirm').addEventListener('click', function () {
    if (_pwaPrompt) {
      /* Android / Chrome : déclenchement du prompt natif */
      _pwaPrompt.prompt();
      _pwaPrompt.userChoice.then(function (result) {
        if (result.outcome === 'accepted') {
          localStorage.setItem(DL_KEY, '1');
          closeModal(downloadModal);
          showToast('Application installée ! Retrouve-la sur ton écran d\'accueil 🏅');
        }
        _pwaPrompt = null;
      });
    } else if (_isIos && !_isInStandaloneMode) {
      /* iOS : affiche les instructions manuelles */
      var hint = document.getElementById('downloadIosHint');
      if (hint) hint.hidden = false;
    } else {
      /* Déjà installé ou non supporté */
      localStorage.setItem(DL_KEY, '1');
      closeModal(downloadModal);
      showToast('L\'application est prête pour une utilisation hors-ligne !');
    }
  });

  document.getElementById('downloadLater').addEventListener('click', function () {
    closeModal(downloadModal);
  });

  /* ===================================================================
     APERÇU LIEU — plein écran (avant chaque mini-jeu + intro 1ère visite)
     =================================================================== */
  var locationModal       = document.getElementById('locationModal');
  var locationMediaEl     = document.getElementById('locationMedia');
  var locationStepEl      = document.getElementById('locationStep');
  var locationTitleEl     = document.getElementById('locationTitle');
  var locationHintEl      = document.getElementById('locationHint');
  var locationContinueBtn = document.getElementById('locationContinue');
  var locationSkipBtn     = document.getElementById('locationSkip');
  var _locationCb         = null;  // callback "J'y suis !"
  var _locationOnDismiss  = null;  // callback quand le modal se ferme (toutes raisons)

  function openLocationPreview(p, opts) {
    opts = opts || {};

    // --- Construit le média ---
    locationMediaEl.innerHTML = '';
    if (p.media) {
      if (p.media.type === 'video') {
        var vid = document.createElement('video');
        vid.src     = p.media.src;
        vid.autoplay = true;
        vid.muted   = false;                       // son activé
        vid.loop    = (opts.loop !== false);        // false pour l'intro
        vid.preload = 'auto';
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', ''); // iOS
        locationMediaEl.appendChild(vid);

        // Ferme automatiquement quand la vidéo se termine (pas de boucle)
        if (!vid.loop) {
          vid.addEventListener('ended', function () { closeLocationPreview(); });
        }

        // Autoplay avec son — affiche un bouton ▶ si le navigateur bloque
        var playPromise = vid.play();
        if (playPromise !== undefined) {
          playPromise.catch(function () {
            var playBtn = document.createElement('button');
            playBtn.className = 'location-fullscreen__play-btn';
            playBtn.setAttribute('aria-label', 'Lancer la vidéo');
            playBtn.innerHTML = '▶';
            locationMediaEl.appendChild(playBtn);
            playBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              vid.muted = false;
              vid.play().catch(function () { vid.muted = true; vid.play(); });
              playBtn.remove();
            });
          });
        }
      } else {
        var img = document.createElement('img');
        img.src = p.media.src;
        img.alt = p.name;
        locationMediaEl.appendChild(img);
      }
    }

    // --- Mode minimal (intro, pas de texte) vs mode normal ---
    var overlayEl = locationModal.querySelector('.location-fullscreen__overlay');
    if (opts.noOverlay) {
      locationModal.classList.add('location-fullscreen--minimal');
      if (overlayEl) overlayEl.hidden = true;
    } else {
      locationModal.classList.remove('location-fullscreen--minimal');
      if (overlayEl) overlayEl.hidden = false;
      locationStepEl.textContent      = 'Étape ' + p.n + ' / ' + TOTAL;
      locationTitleEl.textContent     = p.name;
      locationHintEl.textContent      = opts.hint    || 'Rends-toi à cet endroit !';
      locationContinueBtn.textContent = opts.btnText || 'J\'y suis ! 🎯';
    }

    _locationCb        = opts.onConfirm || null;
    _locationOnDismiss = opts.onDismiss  || null;

    // --- Ouvre ---
    locationModal.hidden = false;
    requestAnimationFrame(function () { locationModal.classList.add('is-open'); });

    // En mode minimal : tap n'importe où pour fermer
    if (opts.noOverlay) {
      locationModal.addEventListener('click', function onTap(e) {
        if (e.target !== locationSkipBtn) {
          locationModal.removeEventListener('click', onTap);
          var cb = _locationCb;
          _locationCb = null;
          closeLocationPreview();
          if (cb) window.setTimeout(cb, 340);
        }
      });
    }
  }

  function closeLocationPreview() {
    var vid = locationMediaEl.querySelector('video');
    if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); }
    locationModal.classList.remove('is-open');
    locationModal.classList.remove('location-fullscreen--minimal');
    var dismissCb = _locationOnDismiss;
    _locationOnDismiss = null;
    window.setTimeout(function () {
      locationModal.hidden = true;
      if (dismissCb) dismissCb();   // popup téléchargement ou autre action
    }, 330);
  }

  locationContinueBtn.addEventListener('click', function () {
    var cb = _locationCb;
    _locationCb = null;
    closeLocationPreview();
    if (cb) window.setTimeout(cb, 350);
  });

  locationSkipBtn.addEventListener('click', function () {
    _locationCb = null;
    closeLocationPreview();   // déclenche aussi _locationOnDismiss
  });

  /* Intro vidéo plein écran — appelée depuis index.html
     opts.onDismiss est appelé qu'on laisse la vidéo finir ou qu'on passe */
  function openIntroVideo(onDismiss) {
    openLocationPreview(
      { media: { type: 'video', src: 'video/video_etape_1.mp4' } },
      { noOverlay: true, loop: false, onDismiss: onDismiss || null }
    );
  }

  /* ===================================================================
     UTILITAIRES MODALE / TOAST
     =================================================================== */
  function openModal(el) {
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-open'); });
  }
  function closeModal(el) {
    el.classList.remove('is-open');
    window.setTimeout(function () { el.hidden = true; }, 220);
  }

  // Fermer en cliquant sur le fond
  var badgeSuccessModal = document.getElementById('badgeSuccessModal');
  [downloadModal, gameModal, badgeSuccessModal].forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  let toastTimer = null;
  function showToast(message) {
    let toast = document.querySelector('.carte-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'carte-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2400);
  }

  /* Géolocalisation désactivée — placement manuel des points (x/y pixels). */

  /* ===================================================================
     INIT
     =================================================================== */
  renderQuest();
  renderBadges();
  renderMasterBadge(false); // affichage initial sans animation

  /* --- Bouton reset (tests) ------------------------------------------ */
  var devResetBtn = document.getElementById('devResetBtn');
  if (devResetBtn) {
    devResetBtn.addEventListener('click', function () {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(DL_KEY);
      location.reload();
    });
  }

  // --- Popup téléchargement + intro vidéo (coordination) ---
  var _showingIntro = !!sessionStorage.getItem('sillans_show_intro');
  if (_showingIntro) sessionStorage.removeItem('sillans_show_intro');

  var _isFirstDL  = !localStorage.getItem(DL_KEY);
  var _dlBanner   = document.getElementById('downloadBanner');

  /* showDownloadPopup — appelé immédiatement ou après la fin de la vidéo */
  function showDownloadPopup() {
    if (!_isFirstDL) return;
    _isFirstDL = false;
    localStorage.setItem(DL_KEY, 'seen');
    window.setTimeout(function () {
      openModal(downloadModal);
      if (_dlBanner) {
        _dlBanner.classList.add('is-expanded');
        window.setTimeout(function () { _dlBanner.classList.remove('is-expanded'); }, 3000);
      }
    }, 420);
  }

  if (_showingIntro) {
    // Vient de index.html → vidéo d'abord, popup téléchargement après
    window.setTimeout(function () { openIntroVideo(showDownloadPopup); }, 600);
  } else {
    // Navigation directe → popup téléchargement habituel
    showDownloadPopup();
  }

  /* ===================================================================
     ÉCRAN DE FIN + DIPLÔME
     =================================================================== */
  var finishScreen   = document.getElementById('finishScreen');
  var diplomeModal   = document.getElementById('diplomeModal');
  var diplomeDownloadBtn = document.getElementById('diplomeDownload');
  var _childName     = '';            // prénom saisi, utilisé pour le diplôme
  var _diplomeCanvas = null;          // canvas du diplôme rendu une seule fois

  // Clé PDF (chemin relatif depuis index.html)
  var PDF_PATH = 'pdf/Diplome_vide.pdf';
  // Worker PDF.js — même version que le CDN principal
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* --- Bouton diplôme dans la carte des badges ----------------------- */
  if (diplomeBtn) {
    // Affiche le bouton si parcours déjà complet au chargement
    if (state.completed.length >= TOTAL) diplomeBtn.hidden = false;

    diplomeBtn.addEventListener('click', function () {
      if (_childName) {
        // Nom déjà saisi : ouvre directement la modale diplôme
        diplomeDownloadBtn.disabled = true;
        diplomeDownloadBtn.textContent = 'Génération en cours…';
        buildDiplomeCanvas(_childName, function (canvas) {
          _diplomeCanvas = canvas;
          var svgStr = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          diplomeDownloadBtn.innerHTML = svgStr + ' Télécharger ton diplôme';
          diplomeDownloadBtn.disabled = false;
        });
        openModal(diplomeModal);
      } else {
        // Pas encore de nom : affiche l'écran de fin
        showFinishScreen();
      }
    });
  }

  /* --- Affiche l'écran de fin ---------------------------------------- */
  function positionFinishRays() {
    var mascot = finishScreen ? finishScreen.querySelector('.finish-screen__mascot') : null;
    var raysEl = finishScreen ? finishScreen.querySelector('.finish-screen__rays')   : null;
    if (!mascot || !raysEl) return;
    var sr = finishScreen.getBoundingClientRect();
    var mr = mascot.getBoundingClientRect();
    var cx = ((mr.left + mr.width  / 2) - sr.left) / sr.width  * 100;
    var cy = ((mr.top  + mr.height / 2) - sr.top)  / sr.height * 100;
    raysEl.style.background = [
      'conic-gradient(',
      'from -9deg at ' + cx.toFixed(1) + '% ' + cy.toFixed(1) + '%,',
      'rgba(196,168,108,.30) 0deg,   rgba(248,236,219,.04) 18deg,',
      'rgba(196,168,108,.30) 36deg,  rgba(248,236,219,.04) 54deg,',
      'rgba(196,168,108,.30) 72deg,  rgba(248,236,219,.04) 90deg,',
      'rgba(196,168,108,.30) 108deg, rgba(248,236,219,.04) 126deg,',
      'rgba(196,168,108,.30) 144deg, rgba(248,236,219,.04) 162deg,',
      'rgba(196,168,108,.30) 180deg, rgba(248,236,219,.04) 198deg,',
      'rgba(196,168,108,.30) 216deg, rgba(248,236,219,.04) 234deg,',
      'rgba(196,168,108,.30) 252deg, rgba(248,236,219,.04) 270deg,',
      'rgba(196,168,108,.30) 288deg, rgba(248,236,219,.04) 306deg,',
      'rgba(196,168,108,.30) 324deg, rgba(248,236,219,.04) 342deg,',
      'rgba(196,168,108,.30) 360deg)'
    ].join('');
  }

  function showFinishScreen() {
    if (finishScreen) {
      finishScreen.hidden = false;
      requestAnimationFrame(function () {
        requestAnimationFrame(positionFinishRays);
      });
    }
  }

  /* --- Rendu du diplôme personnalisé via PDF.js ----------------------- */
  function buildDiplomeCanvas(childName, callback) {
    // PDF.js 3.x expose la lib sous window.pdfjsLib
    var pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) { callback(null); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    var loadingTask = pdfjsLib.getDocument(PDF_PATH);
    loadingTask.promise.then(function (pdf) {
      return pdf.getPage(1);
    }).then(function (page) {
      var scale = 2.5; // haute résolution pour impression
      var viewport = page.getViewport({ scale: scale });

      var canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext('2d');

      return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
        /* Écrit le prénom centré dans la zone vide du diplôme.
           Position : centré horizontalement, ~50% en vertical.
           Ajuste NAME_Y (0.0 → 1.0) si le nom doit monter/descendre. */
        var NAME_Y    = 0.47;   // ← à ajuster si besoin
        var FONT_SIZE = 72;     // ← taille en px au rendu 2.5×

        ctx.save();
        ctx.font         = 'italic ' + FONT_SIZE + 'px Georgia, "Times New Roman", serif';
        ctx.fillStyle    = '#3a2810';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(childName, canvas.width / 2, canvas.height * NAME_Y);
        ctx.restore();

        callback(canvas);
      });
    }).catch(function () { callback(null); });
  }

  /* --- Télécharge le canvas comme image PNG --------------------------- */
  function downloadCanvas(canvas, name) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'diplome-' + (name || 'sillans').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  /* --- Bouton Valider (finish screen) --------------------------------- */
  document.getElementById('finishValidate').addEventListener('click', function () {
    var input = document.getElementById('finishNameInput');
    var name  = (input ? input.value.trim() : '') || 'Gardien';
    _childName     = name;
    _diplomeCanvas = null;

    // Lance la génération du canvas immédiatement, avant d'ouvrir la modale
    diplomeDownloadBtn.disabled = true;
    diplomeDownloadBtn.textContent = 'Génération en cours…';

    buildDiplomeCanvas(_childName, function (canvas) {
      _diplomeCanvas = canvas;
      var svgStr = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      diplomeDownloadBtn.innerHTML = svgStr + ' Télécharger ton diplôme';
      diplomeDownloadBtn.disabled = false;
    });

    openModal(diplomeModal);
  });

  /* --- Télécharger ---------------------------------------------------- */
  diplomeDownloadBtn.addEventListener('click', function () {
    if (!_diplomeCanvas) {
      // Fallback : télécharge le PDF original si canvas non disponible
      var a = document.createElement('a');
      a.href = PDF_PATH;
      a.download = 'diplome-sillans.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    downloadCanvas(_diplomeCanvas, _childName);
  });

  /* --- Fermer la modale diplôme --------------------------------------- */
  document.getElementById('diplomeClose').addEventListener('click', function () {
    closeModal(diplomeModal);
  });
  diplomeModal.addEventListener('click', function (e) {
    if (e.target === diplomeModal) closeModal(diplomeModal);
  });

  /* --- Retour accueil ------------------------------------------------- */
  document.getElementById('diplomeBack').addEventListener('click', function () {
    closeModal(diplomeModal);
    if (finishScreen) finishScreen.hidden = true;
  });

  /* ===================================================================
     POINT 6 — Le village : La frise du temps
     =================================================================== */
  var point6Modal = document.getElementById('point6Modal');
  var point6Panel = document.getElementById('point6Panel');
  var mg6Modal    = document.getElementById('mg6Modal');

  /* — Carte de bienvenue — */
  function openPoint6Info() { openModal(point6Modal); }

  document.getElementById('pt6Close').addEventListener('click', function () {
    closeModal(point6Modal);
  });
  document.getElementById('pt6Launch').addEventListener('click', function () {
    closeModal(point6Modal);
    window.setTimeout(openPoint6Panel, 260);
  });

  /* — Panneau d'informations — */
  function openPoint6Panel() {
    var audio   = document.getElementById('pt6Audio');
    var playBtn = document.getElementById('pt6PlayBtn');
    var wave    = document.getElementById('pt6Wave');
    var iconEl  = playBtn.querySelector('.library-card__play-icon');

    playBtn.onclick = function () {
      if (audio.paused) {
        audio.play();
        iconEl.textContent = '❚❚';
        wave.classList.add('is-playing');
      } else {
        audio.pause();
        iconEl.textContent = '▶';
        wave.classList.remove('is-playing');
      }
    };
    audio.onended = function () {
      iconEl.textContent = '▶';
      wave.classList.remove('is-playing');
    };

    openModal(point6Panel);
  }

  document.getElementById('pt6PanelClose').addEventListener('click', function () {
    document.getElementById('pt6Audio').pause();
    closeModal(point6Panel);
  });
  document.getElementById('pt6PanelLaunch').addEventListener('click', function () {
    document.getElementById('pt6Audio').pause();
    closeModal(point6Panel);
    window.setTimeout(openPoint5Game, 260);
  });
  point6Panel.addEventListener('click', function (e) {
    if (e.target === point6Panel) {
      document.getElementById('pt6Audio').pause();
      closeModal(point6Panel);
    }
  });

  /* ——— Comparateur avant/après point 6 ——— */
  (function () {
    var compare  = document.getElementById('pt6Compare');
    var beforeEl = document.getElementById('pt6CompareBefore');
    var handle   = document.getElementById('pt6CompareHandle');
    if (!compare) return;

    var dragging = false;

    function setPos(clientX) {
      var rect  = compare.getBoundingClientRect();
      var pct   = Math.max(2, Math.min(98, (clientX - rect.left) / rect.width * 100));
      var right = (100 - pct).toFixed(1);
      beforeEl.style.clipPath = 'inset(0 ' + right + '% 0 0)';
      handle.style.left       = pct + '%';
      handle.setAttribute('aria-valuenow', Math.round(pct));
    }

    /* Début du glissement : sur la handle uniquement */
    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      e.preventDefault();
    });
    handle.addEventListener('touchstart', function (e) {
      dragging = true;
      e.preventDefault();
    }, { passive: false });

    /* Déplacement */
    document.addEventListener('mousemove', function (e) {
      if (dragging) setPos(e.clientX);
    });
    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      setPos(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });

    /* Fin du glissement */
    document.addEventListener('mouseup',  function () { dragging = false; });
    document.addEventListener('touchend', function () { dragging = false; });

    /* Navigation clavier ← → */
    handle.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var cur   = parseFloat(handle.style.left) || 50;
      var pct   = e.key === 'ArrowLeft' ? Math.max(2, cur - 5) : Math.min(98, cur + 5);
      var right = (100 - pct).toFixed(1);
      beforeEl.style.clipPath = 'inset(0 ' + right + '% 0 0)';
      handle.style.left       = pct + '%';
      handle.setAttribute('aria-valuenow', Math.round(pct));
    });
  }());

  /* ——— La frise du temps — données ——— */
  var EPOCHS = [
    {
      pos: 1,
      era: '~1000 av. J.-C.',
      name: 'Âge du Bronze',
      emoji: '🏕️',
      gradFrom: '#E8D5A0',
      gradTo: '#C8A870',
      anecdote: 'Les premiers habitants de la région vivaient dans des huttes en bois et chassaient le sanglier dans les forêts. Pas encore de cascade à admirer, mais déjà l\'eau fraîche de la rivière Bresque !'
    },
    {
      pos: 2,
      era: '1er–4e siècle',
      name: 'Époque Romaine',
      emoji: '🏛️',
      gradFrom: '#E0EBF5',
      gradTo: '#B8D0E8',
      anecdote: 'Les Romains adoraient s\'installer près des sources d\'eau. Ils ont peut-être construit une villa juste à côté de notre future cascade... et profité de son eau fraîche pour leurs bains !'
    },
    {
      pos: 3,
      era: 'Moyen Âge',
      name: 'Époque Médiévale',
      emoji: '🏰',
      gradFrom: '#CDD4DC',
      gradTo: '#8A96A6',
      anecdote: 'Au Moyen Âge, Sillans avait un château fort et des remparts pour se défendre. Les chevaliers en armure descendaient-ils voir la cascade ? Avec tout ce métal, j\'espère qu\'ils ne glissaient pas !'
    },
    {
      pos: 4,
      era: "Aujourd'hui",
      name: 'Village actuel',
      emoji: '🏘️',
      gradFrom: '#C5E8F8',
      gradTo: '#80C8E0',
      anecdote: "Aujourd'hui, des milliers de visiteurs viennent chaque année admirer Sillans-la-Cascade. Et toi, tu viens d'en devenir le Gardien officiel ! 🏅"
    }
  ];

  /* — État du jeu — */
  var mg6SelectedPos  = null;	// pos (1-4) de la carte sélectionnée (sens normal)
  var mg6SelectedSlot = null;	// numéro du slot sélectionné (sens inverse)
  var mg6PlacedCount  = 0;
  var mg6FeedTimer    = null;

  /* — Lancement du mini-jeu — */
  function openPoint6Game() {
    mg6SelectedPos  = null;
    mg6SelectedSlot = null;
    mg6PlacedCount  = 0;
    if (mg6FeedTimer) { clearTimeout(mg6FeedTimer); mg6FeedTimer = null; }

    /* Reset UI */
    var content = document.getElementById('mg6Content');
    var success = document.getElementById('mg6Success');
    content.hidden = false;
    success.hidden = true;

    var fb = document.getElementById('mg6Feedback');
    fb.hidden = true;
    document.getElementById('mg6Counter').textContent = '0 / 4 bien placées';

    mg6Build();
    openModal(mg6Modal);
  }

  /* — Construction des cartes et slots — */
  function mg6Build() {
    /* Mélange des EPOCHS */
    var shuffled = EPOCHS.slice();
    for (var j = shuffled.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = shuffled[j]; shuffled[j] = shuffled[k]; shuffled[k] = tmp;
    }
    /* Garantir qu'au moins 2 cartes sont mal placées */
    var sorted = shuffled.every(function (e, i) { return e.pos === i + 1; });
    if (sorted) { var sw = shuffled[0]; shuffled[0] = shuffled[1]; shuffled[1] = sw; }

    /* Slots cibles (1 → 4) */
    var slotsEl = document.getElementById('mg6Slots');
    slotsEl.innerHTML = '';
    var slotLabels = ['Le plus ancien', '2e époque', '3e époque', 'Le plus récent'];
    for (var i = 1; i <= 4; i++) {
      (function (slotNum) {
        var slot = document.createElement('div');
        slot.className = 'mg6__slot';
        slot.dataset.slot = slotNum;
        slot.setAttribute('role', 'button');
        slot.setAttribute('aria-label', 'Emplacement ' + slotNum);
        slot.setAttribute('tabindex', '0');
        slot.innerHTML =
          '<span class="mg6__slot-num">' + slotNum + '</span>' +
          '<span class="mg6__slot-label">' + slotLabels[slotNum - 1] + '</span>';
        slot.addEventListener('click', function () { mg6TrySlot(slotNum); });
        slot.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mg6TrySlot(slotNum); }
        });
        slotsEl.appendChild(slot);
      }(i));
    }

    /* Cartes source (mélangées) */
    var trayEl = document.getElementById('mg6Tray');
    trayEl.innerHTML = '';
    shuffled.forEach(function (epoch) {
      (function (ep) {
        var card = document.createElement('div');
        card.className = 'mg6__card';
        card.dataset.pos = ep.pos;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', ep.name + ' – ' + ep.era);
        card.setAttribute('tabindex', '0');
        card.innerHTML =
          '<div class="mg6__card__face" style="background:linear-gradient(155deg,' + ep.gradFrom + ',' + ep.gradTo + ')">' +
            '<span class="mg6__card__emoji" aria-hidden="true">' + ep.emoji + '</span>' +
          '</div>' +
          '<div class="mg6__card__info">' +
            '<span class="mg6__card__era">' + ep.era + '</span>' +
            '<span class="mg6__card__name">' + ep.name + '</span>' +
          '</div>';
        card.addEventListener('click', function () { mg6SelectCard(ep.pos); });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mg6SelectCard(ep.pos); }
        });
        trayEl.appendChild(card);
      }(epoch));
    });
  }

  /* — Nettoie toute sélection en cours — */
  function mg6ClearSelection() {
    mg6SelectedPos  = null;
    mg6SelectedSlot = null;
    var cards = document.getElementById('mg6Tray').querySelectorAll('.mg6__card');
    cards.forEach(function (c) { c.classList.remove('is-selected'); });
    var slots = document.getElementById('mg6Slots').querySelectorAll('.mg6__slot');
    slots.forEach(function (s) { s.classList.remove('is-selected'); });
  }

  /* — Placement effectif d'une carte dans un slot — */
  function mg6Place(cardPos, slotNum) {
    var slot = document.querySelector('.mg6__slot[data-slot="' + slotNum + '"]');
    if (!slot || slot.classList.contains('is-correct')) { mg6ClearSelection(); return; }

    mg6ClearSelection();

    if (cardPos === slotNum) {
      /* ✅ Correct */
      var epoch = null;
      for (var i = 0; i < EPOCHS.length; i++) {
        if (EPOCHS[i].pos === slotNum) { epoch = EPOCHS[i]; break; }
      }
      slot.classList.remove('is-wrong', 'is-targeted', 'is-selected');
      slot.classList.add('is-correct');
      slot.innerHTML =
        '<div class="mg6__slot-filled">' +
          '<div class="mg6__slot-filled__face" style="background:linear-gradient(155deg,' + epoch.gradFrom + ',' + epoch.gradTo + ')">' +
            '<span style="font-size:26px" aria-hidden="true">' + epoch.emoji + '</span>' +
          '</div>' +
          '<div class="mg6__slot-filled__name">' + epoch.name + '</div>' +
        '</div>';

      var cards = document.getElementById('mg6Tray').querySelectorAll('.mg6__card');
      cards.forEach(function (c) {
        if (parseInt(c.dataset.pos, 10) === cardPos) {
          c.classList.remove('is-selected');
          c.classList.add('is-placed');
        }
      });

      mg6PlacedCount++;
      document.getElementById('mg6Counter').textContent = mg6PlacedCount + ' / 4 bien placées';
      mg6ShowFeedback(epoch.anecdote);

      if (mg6PlacedCount >= 4) {
        window.setTimeout(mg6ShowSuccess, 2600);
      }

    } else {
      /* ❌ Mauvais emplacement — shake du slot */
      slot.classList.remove('is-wrong');
      void slot.offsetWidth;
      slot.classList.add('is-wrong');
      window.setTimeout(function () { slot.classList.remove('is-wrong'); }, 500);
    }
  }

  /* — Sélection d'une carte source (sens normal : carte → slot) — */
  function mg6SelectCard(pos) {
    /* Si un slot est déjà sélectionné → on place directement */
    if (mg6SelectedSlot !== null) {
      mg6Place(pos, mg6SelectedSlot);
      return;
    }
    var cards = document.getElementById('mg6Tray').querySelectorAll('.mg6__card');
    if (mg6SelectedPos === pos) {
      /* Désélection (toggle off) */
      mg6SelectedPos = null;
      cards.forEach(function (c) { c.classList.remove('is-selected'); });
      return;
    }
    mg6SelectedPos = pos;
    cards.forEach(function (c) {
      c.classList.toggle('is-selected', parseInt(c.dataset.pos, 10) === pos);
    });
  }

  /* — Clic sur un slot (sens normal ou sens inverse) — */
  function mg6TrySlot(slotNum) {
    var slot = document.querySelector('.mg6__slot[data-slot="' + slotNum + '"]');
    if (!slot || slot.classList.contains('is-correct')) return;

    /* Sens normal : une carte est déjà sélectionnée → on place */
    if (mg6SelectedPos !== null) {
      mg6Place(mg6SelectedPos, slotNum);
      return;
    }

    /* Sens inverse : sélectionner / désélectionner ce slot */
    var allSlots = document.getElementById('mg6Slots').querySelectorAll('.mg6__slot');
    if (mg6SelectedSlot === slotNum) {
      mg6SelectedSlot = null;
      allSlots.forEach(function (s) { s.classList.remove('is-selected'); });
    } else {
      mg6SelectedSlot = slotNum;
      allSlots.forEach(function (s) {
        s.classList.toggle('is-selected', parseInt(s.dataset.slot, 10) === slotNum);
      });
    }
  }

  /* — Bulle d'anecdote Sillou — */
  function mg6ShowFeedback(text) {
    if (mg6FeedTimer) { clearTimeout(mg6FeedTimer); mg6FeedTimer = null; }
    var fb     = document.getElementById('mg6Feedback');
    var fbText = document.getElementById('mg6FeedbackText');
    fbText.textContent = text;
    fb.hidden = false;
    /* Masquer automatiquement (sauf si c'est le dernier placement → succès) */
    mg6FeedTimer = window.setTimeout(function () {
      if (mg6PlacedCount < 4) fb.hidden = true;
      mg6FeedTimer = null;
    }, 3400);
  }

  /* — Écran de succès — */
  function mg6ShowSuccess() {
    document.getElementById('mg6Content').hidden = true;
    document.getElementById('mg6Success').hidden = false;
  }

  /* — Boutons header — */
  document.getElementById('mg6Back').addEventListener('click', function () {
    closeModal(mg6Modal);
    window.setTimeout(openPoint6Panel, 260);
  });
  document.getElementById('mg6Skip').addEventListener('click', function () {
    closeModal(mg6Modal);
    validatePoint(6);
    window.setTimeout(function () { showBadgeSuccess(6); }, 280);
  });

  /* — Validation finale (bouton succès) — */
  document.getElementById('mg6ValidateBtn').addEventListener('click', function () {
    closeModal(mg6Modal);
    validatePoint(6);
    window.setTimeout(function () { showBadgeSuccess(6); }, 280);
  });

})();
