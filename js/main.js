// Jack Jaillet site: nav toggle, scroll reveals, image fallbacks, print.

(function () {
  // Mobile nav
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    // Matches the 820px nav breakpoint in the stylesheet. Keep them in sync.
    var navQuery = window.matchMedia("(max-width: 820px)");

    var isOpen = function () { return menu.classList.contains("open"); };

    var focusable = function () {
      return Array.prototype.filter.call(
        menu.querySelectorAll("a[href], button"),
        function (el) { return el.offsetParent !== null; }
      );
    };

    var setOpen = function (open, restoreFocus) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      // Stop the page scrolling away behind the open menu.
      document.documentElement.classList.toggle("nav-locked", open);
      if (open) {
        var first = focusable()[0];
        if (first) first.focus();
      } else if (restoreFocus) {
        toggle.focus();
      }
    };

    toggle.addEventListener("click", function () { setOpen(!isOpen(), true); });

    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") { setOpen(false, true); return; }
      if (e.key !== "Tab") return;
      // Keep Tab inside the menu while it is covering the page.
      var items = focusable();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Tapping anywhere off the menu closes it. Clicks inside are left alone
    // so the theme switch still works with the menu open.
    document.addEventListener("click", function (e) {
      if (!isOpen()) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false, false);
    });

    // Rotating or resizing past the breakpoint would otherwise leave the
    // menu stuck open behind the restored desktop nav.
    var onBreakpoint = function (e) { if (!e.matches && isOpen()) setOpen(false, false); };
    if (navQuery.addEventListener) navQuery.addEventListener("change", onBreakpoint);
    else if (navQuery.addListener) navQuery.addListener(onBreakpoint);
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
    // Keeps the mobile browser chrome in step with the page. The <head>
    // bootstrap sets this before first paint; this handles the switch.
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    var syncTheme = function () {
      var dark = effectiveTheme() === "dark";
      themeBtn.setAttribute("aria-checked", dark ? "true" : "false");
      if (themeMeta) themeMeta.setAttribute("content", dark ? "#10131a" : "#f7f8fa");
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
})();
