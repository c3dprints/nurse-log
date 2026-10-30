// Runs in <head> before anything draws: puts back the last theme used on this PC
// so the sign-in screen does not flash. The signed-in user's own choice comes
// from the server and replaces it once app.js loads.
try {
  const t = localStorage.getItem('nl.theme');
  if (t && /^[a-z]+$/.test(t)) document.documentElement.setAttribute('data-theme', t);
  if (localStorage.getItem('nl.style') === 'material') document.documentElement.setAttribute('data-style', 'material');
  // Text size picked on this PC (Settings > Appearance); phones use pinch zoom instead.
  const z = Number(localStorage.getItem('nl.zoom'));
  if (z > 0 && z !== 1 && !matchMedia('(max-width: 760px)').matches) { document.documentElement.style.zoom = String(z); document.documentElement.style.setProperty('--zoom', String(z)); }
} catch { /* storage blocked */ }
