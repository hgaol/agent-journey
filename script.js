(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = (element) => element.classList.add('visible');
  const revealElements = [...document.querySelectorAll('.reveal')];

  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach(reveal);
  } else {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealElements.forEach((element) => observer.observe(element));
  }

  const toast = document.getElementById('copy-toast');
  let toastTimer;
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'Copied';
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
        setTimeout(() => { button.textContent = 'Copy'; }, 1400);
      } catch {
        button.textContent = 'Select command';
      }
    });
  });

  const demo = document.getElementById('live-demo');
  document.getElementById('reset-demo')?.addEventListener('click', () => {
    if (!demo) return;
    const source = demo.getAttribute('src');
    demo.removeAttribute('src');
    requestAnimationFrame(() => demo.setAttribute('src', source || './demo/'));
  });

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
