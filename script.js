
const loaderRing    = document.getElementById('loaderRing');
const loaderPercent = document.getElementById('loaderPercent');
const loaderLabel   = document.getElementById('loaderLabel');
const factCardText  = document.querySelector('.fact-card p');
const loadingScreen = document.querySelector('.loading-screen');

/* ── Anecdotes défilantes ── */
const anecdotes = [
	"La cascade de Sillans est la plus haute de tout le Var ! Elle tombe de 42 mètres, c'est comme empiler 7 girafes les unes sur les autres !",
	"Le château du village existe depuis plus de 1 000 ans ! À l'époque, des chevaliers en armure y vivaient et montaient la garde.",
	"L'eau de la cascade vient d'une rivière qui s'appelle la Bresque. Elle a voyagé plus de 50 km avant d'arriver ici, c'est comme aller de Toulon à Draguignan à pied !"
];

function renderProgress(value) {
	const bounded = Math.max(0, Math.min(100, Math.round(value)));
	loaderRing.style.setProperty('--progress', bounded);
	loaderPercent.textContent = `${bounded}%`;
	if (bounded >= 100) {
		loaderLabel.textContent = 'Prêt !';
		loaderRing.classList.add('is-complete');
		loadingScreen?.classList.add('is-ready');
	}
}

/* Une anecdote aléatoire, fixe pendant tout le chargement */
if (factCardText) {
	factCardText.textContent = anecdotes[Math.floor(Math.random() * anecdotes.length)];
}
renderProgress(0);

/* ── Enregistrement du Service Worker ── */
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('sw.js').then(reg => {

		if (reg.installing) {
			/* Première visite : le SW installe et cache les assets → on suit la progression */
			navigator.serviceWorker.addEventListener('message', event => {
				if (event.data && event.data.type === 'CACHE_PROGRESS') {
					renderProgress(event.data.progress);
					/* rien à faire */
				}
			});

		} else {
			/* Visite ultérieure : tout est déjà en cache → animation rapide */
			let p = 0;
			const quick = setInterval(() => {
				p = Math.min(100, p + 8);
				renderProgress(p);
				if (p >= 100) { clearInterval(quick); }
			}, 60);
		}

	}).catch(() => {
		/* SW non supporté ou bloqué → animation de repli (~3 s) */
		let p = 0;
		const fallback = setInterval(() => {
			p = Math.min(100, p + 5);
			renderProgress(p);
			if (p >= 100) { clearInterval(fallback); }
		}, 120);
	});

} else {
	/* Navigateur sans SW → animation rapide */
	let p = 0;
	const noSw = setInterval(() => {
		p = Math.min(100, p + 10);
		renderProgress(p);
		if (p >= 100) { clearInterval(noSw); }
	}, 80);
}

/* ── CTA → marque la session pour l'intro vidéo ── */
var ctaBtn = document.getElementById('ctaButton');
if (ctaBtn) {
	ctaBtn.addEventListener('click', function () {
		sessionStorage.setItem('sillans_show_intro', '1');
	});
}

/* ── Filtres librairie (partagés via ce fichier) ── */
document.addEventListener('DOMContentLoaded', () => {
	const container = document.querySelector('.library-filters');
	const buttons   = container ? Array.from(container.querySelectorAll('.filter__item')) : [];
	const high      = container ? container.querySelector('.filter__highlighter') : null;

	function updateHighlighter(target) {
		if (!high || !container || !target) return;
		const btnRect  = target.getBoundingClientRect();
		const contRect = container.getBoundingClientRect();
		high.style.width     = `${btnRect.width}px`;
		high.style.transform = `translateY(-50%) translateX(${btnRect.left - contRect.left}px)`;
	}

	if (buttons.length && high) {
		const active = buttons.find(b => b.classList.contains('is-active')) || buttons[0];
		buttons.forEach(btn => btn.setAttribute('aria-pressed', btn === active ? 'true' : 'false'));
		updateHighlighter(active);
		buttons.forEach(btn => {
			btn.addEventListener('click', () => {
				buttons.forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
				btn.classList.add('is-active');
				btn.setAttribute('aria-pressed', 'true');
				updateHighlighter(btn);
			});
		});
		window.addEventListener('resize', () => {
			const cur = buttons.find(b => b.classList.contains('is-active')) || buttons[0];
			updateHighlighter(cur);
		});
	}
});
