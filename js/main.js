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

  // Logo fallback: every logo sits beside its organisation's name in text,
  // so a missing file should just drop the mark rather than leave a broken
  // image box behind. (The whole set went missing once during an asset
  // rename; the text alone still reads fine.)
  document.querySelectorAll(".org-item img, .hl-logo").forEach(function (img) {
    var drop = function () { img.style.display = "none"; };
    if (img.complete && img.naturalWidth === 0) drop();
    img.addEventListener("error", drop);
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

    // Failsafe. The reveal styles start at opacity 0, so if the observer
    // never reports (a browser quirk, or a tab that is throttled or never
    // composited), the copy would stay invisible permanently. If nothing at
    // all has been revealed shortly after load, assume the observer isn't
    // working and just show everything.
    setTimeout(function () {
      if (!document.querySelector(".reveal.in")) {
        io.disconnect();
        revealed.forEach(function (el) { el.classList.add("in"); });
      }
    }, 2500);
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

  // Organisations marquee: the strip scrolls on its own, so WCAG 2.2.2 needs
  // a way to stop it that doesn't depend on a mouse. CSS already pauses on
  // hover and focus-within; this adds an explicit control for everyone else.
  var orgs = document.querySelector(".orgs");
  var orgsPause = document.querySelector(".orgs-pause");
  if (orgs && orgsPause) {
    if (reduce) {
      // The reduced-motion layout is a static wrapped grid. Nothing to pause.
      orgsPause.remove();
    } else {
      orgsPause.addEventListener("click", function () {
        var paused = orgs.dataset.paused === "true";
        orgs.dataset.paused = paused ? "false" : "true";
        orgsPause.setAttribute(
          "aria-label",
          paused ? "Pause the scrolling organization list" : "Resume the scrolling organization list"
        );
      });
    }
  }

  // Glow parallax: the hero light leans toward the cursor (or device tilt);
  // CSS transitions on `translate` provide the damped, light-like lag.
  var hero = document.querySelector(".hero");
  if (hero && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    // The rect is cached and refreshed on resize/scroll. Reading it inside the
    // move handler forced a layout on every pointer event.
    var rect = null;
    var refreshRect = function () { rect = null; };
    window.addEventListener("resize", refreshRect);
    window.addEventListener("scroll", refreshRect, { passive: true });

    var pending = false;
    var nx = 0;
    var ny = 0;

    // One style write per frame instead of one per pointer event.
    var flush = function () {
      pending = false;
      hero.style.setProperty("--glow-x", (nx * 34).toFixed(1) + "px");
      hero.style.setProperty("--glow-y", (ny * 24).toFixed(1) + "px");
      hero.style.setProperty("--glow-x2", (nx * -16).toFixed(1) + "px");
      hero.style.setProperty("--glow-y2", (ny * -11).toFixed(1) + "px");
    };
    var setGlow = function (x, y) {
      nx = x;
      ny = y;
      if (!pending) {
        pending = true;
        requestAnimationFrame(flush);
      }
    };

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        if (!rect) rect = hero.getBoundingClientRect();
        setGlow(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          ((e.clientY - rect.top) / rect.height) * 2 - 1
        );
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { setGlow(0, 0); });
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma === null || e.beta === null) return;
        setGlow(
          Math.max(-1, Math.min(1, e.gamma / 20)),
          Math.max(-1, Math.min(1, (e.beta - 45) / 25))
        );
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
