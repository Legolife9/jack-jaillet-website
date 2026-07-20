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

  // Theme switch: dark is the site default; the switch opts into light
  // and the choice is remembered.
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) {
    var effectiveTheme = function () {
      return document.documentElement.dataset.theme || "dark";
    };
    var syncTheme = function () {
      themeBtn.setAttribute("aria-checked", effectiveTheme() === "dark" ? "true" : "false");
    };
    themeBtn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      syncTheme();
    });
    syncTheme();
  }

  // Glow parallax: the hero light leans toward the cursor (or device tilt);
  // CSS transitions on `translate` provide the damped, light-like lag.
  var hero = document.querySelector(".hero");
  if (hero && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    var setGlow = function (nx, ny) {
      hero.style.setProperty("--glow-x", (nx * 34).toFixed(1) + "px");
      hero.style.setProperty("--glow-y", (ny * 24).toFixed(1) + "px");
      hero.style.setProperty("--glow-x2", (nx * -16).toFixed(1) + "px");
      hero.style.setProperty("--glow-y2", (ny * -11).toFixed(1) + "px");
    };
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        setGlow(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
      });
      hero.addEventListener("pointerleave", function () { setGlow(0, 0); });
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma === null || e.beta === null) return;
        var nx = Math.max(-1, Math.min(1, e.gamma / 20));
        var ny = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
        setGlow(nx, ny);
      });
    }
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
