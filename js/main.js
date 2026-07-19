// Jack Jaillet site: nav toggle, scroll reveals, image fallbacks, print.

(function () {
  // Mobile nav
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
        toggle.focus();
      }
    });
  }

  // Headshot fallback: if the image file isn't in assets/ yet,
  // show the styled placeholder instead of a broken image.
  document.querySelectorAll(".portrait img").forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) {
      img.closest(".portrait").classList.add("missing");
    }
    img.addEventListener("error", function () {
      img.closest(".portrait").classList.add("missing");
    });
  });

  // Scroll reveal (skipped entirely under prefers-reduced-motion,
  // where the CSS keeps everything visible and static).
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealed = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("in"); });
  }

  // Theme toggle: overrides the system preference and remembers the choice
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) {
    var darkMedia = window.matchMedia("(prefers-color-scheme: dark)");
    var effectiveTheme = function () {
      return document.documentElement.dataset.theme || (darkMedia.matches ? "dark" : "light");
    };
    var syncTheme = function () {
      var dark = effectiveTheme() === "dark";
      themeBtn.setAttribute("aria-pressed", dark ? "true" : "false");
      themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    themeBtn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      syncTheme();
    });
    darkMedia.addEventListener("change", syncTheme);
    syncTheme();
  }

  // Cursor spotlight on highlight cards (real pointers only)
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".hl").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  // Resume print button
  var printBtn = document.getElementById("print-btn");
  if (printBtn) {
    printBtn.addEventListener("click", function () { window.print(); });
  }

  // Footer year
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
