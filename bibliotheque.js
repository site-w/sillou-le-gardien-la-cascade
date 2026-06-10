document.addEventListener('DOMContentLoaded', () => {
	const filterContainer = document.querySelector('.library-filters');
	const filterButtons = filterContainer ? Array.from(filterContainer.querySelectorAll('.filter__item')) : [];
	const cards = Array.from(document.querySelectorAll('.library-card'));

	function seekToPointer(audio, wave, event) {
		if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
			return;
		}

		const rect = wave.getBoundingClientRect();
		const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
		audio.currentTime = (x / rect.width) * audio.duration;
	}

	function setFilterState(filterValue) {
		cards.forEach(card => {
			const tags = (card.dataset.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
			const matches = filterValue === 'all' || tags.includes(filterValue);
			card.classList.toggle('is-hidden', !matches);

			const audio = card.querySelector('.library-card__audio-element');
			if (!matches && audio && !audio.paused) {
				audio.pause();
			}
		});
	}

	if (filterButtons.length) {
		const initialButton = filterButtons.find(button => button.classList.contains('is-active')) || filterButtons[0];

		filterButtons.forEach(button => {
			button.setAttribute('aria-pressed', button === initialButton ? 'true' : 'false');
		});

		setFilterState(initialButton.dataset.filter || 'all');

		filterButtons.forEach(button => {
			button.addEventListener('click', () => {
				filterButtons.forEach(item => {
					item.classList.remove('is-active');
					item.setAttribute('aria-pressed', 'false');
				});

				button.classList.add('is-active');
				button.setAttribute('aria-pressed', 'true');
				setFilterState(button.dataset.filter || 'all');
			});
		});
	}

	cards.forEach(card => {
		const audio = card.querySelector('.library-card__audio-element');
		const playButton = card.querySelector('.library-card__play');
		const wave = card.querySelector('.library-card__wave');
		const waveBars = wave ? Array.from(wave.querySelectorAll('.library-card__wave-bar')) : [];
		const media = card.querySelector('.library-card__media');

		if (!audio || !playButton || !wave || !waveBars.length || !media) {
			return;
		}

		function updatePlayState() {
			const playing = !audio.paused;
			playButton.classList.toggle('is-playing', playing);
			wave.classList.toggle('is-playing', playing);
			playButton.setAttribute('aria-label', playing ? 'Mettre l’audio en pause' : 'Lire l’audio');
			playButton.innerHTML = playing
				? '<span class="library-card__play-icon" aria-hidden="true">❚❚</span>'
				: '<span class="library-card__play-icon" aria-hidden="true">▶</span>';
		}

		function updateProgress() {
			const duration = audio.duration;
			if (!Number.isFinite(duration) || duration <= 0) {
				wave.setAttribute('aria-valuenow', '0');
				waveBars.forEach(bar => bar.classList.remove('is-active'));
				return;
			}

			const percentage = (audio.currentTime / duration) * 100;
			const activeBars = Math.round((percentage / 100) * waveBars.length);

			wave.setAttribute('aria-valuenow', String(Math.round(percentage)));
			waveBars.forEach((bar, index) => {
				bar.classList.toggle('is-active', index < activeBars);
			});
		}

		async function toggleAudio() {
			if (audio.paused) {
				try {
					await audio.play();
				} catch {
					return;
				}
			} else {
				audio.pause();
			}
		}

		playButton.addEventListener('click', event => {
			event.stopPropagation();
			toggleAudio();
		});

		wave.addEventListener('click', async event => {
			event.stopPropagation();
			seekToPointer(audio, wave, event);
			updateProgress();

			if (audio.paused) {
				try {
					await audio.play();
				} catch {
					return;
				}
			}
		});

		wave.addEventListener('keydown', async event => {
			if (event.key !== 'Enter' && event.key !== ' ') {
				return;
			}

			event.preventDefault();
			toggleAudio();
		});

		audio.addEventListener('loadedmetadata', () => {
			updateProgress();
		});

		audio.addEventListener('timeupdate', updateProgress);
		audio.addEventListener('play', updatePlayState);
		audio.addEventListener('pause', updatePlayState);
		audio.addEventListener('ended', () => {
			updatePlayState();
			wave.setAttribute('aria-valuenow', '100');
		});

		media.addEventListener('click', event => {
			if (event.target.closest('button, input, .library-card__wave')) {
				return;
			}
			toggleAudio();
		});

		updatePlayState();
		updateProgress();
	});
});