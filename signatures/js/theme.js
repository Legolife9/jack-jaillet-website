// Same theme switch as the rest of jackjaillet.com: dark unless the visitor chose light.
// Runs in <head> so the page never flashes the wrong theme.
try { if (localStorage.getItem('theme') === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) {}
