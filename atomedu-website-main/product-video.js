const slides = [...document.querySelectorAll('.slide')];
const previous = document.getElementById('prev-slide');
const next = document.getElementById('next-slide');
const count = document.getElementById('slide-count');
const progress = document.getElementById('deck-progress-fill');
const hashMatch = /^#slide-(\d+)$/.exec(location.hash);
let current = hashMatch ? Math.max(0, Math.min(slides.length - 1, Number(hashMatch[1]) - 1)) : 0;

function show(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, position) => {
    slide.hidden = position !== current;
    slide.classList.toggle('is-active', position === current);
  });
  count.textContent = `${current + 1} of ${slides.length}`;
  previous.disabled = current === 0;
  next.disabled = current === slides.length - 1;
  progress.style.width = `${(current + 1) / slides.length * 100}%`;
  history.replaceState(null, '', `#slide-${current + 1}`);
}

previous.addEventListener('click', () => show(current - 1));
next.addEventListener('click', () => show(current + 1));
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); show(current + 1); }
  else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); show(current - 1); }
  else if (event.key === 'Home') { event.preventDefault(); show(0); }
  else if (event.key === 'End') { event.preventDefault(); show(slides.length - 1); }
});
window.addEventListener('hashchange', () => {
  const match = /^#slide-(\d+)$/.exec(location.hash);
  if (match) show(Number(match[1]) - 1);
});
show(current);
