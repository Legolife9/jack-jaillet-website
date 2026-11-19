// Jack Jaillet site: nav toggle, theme switch, scroll reveals, the home
// page's photo stage and year list, image fallbacks, print.

(function () {
  var root = document.documentElement;
  // Tells the stylesheet this script is running (see the reveal failsafe).
  root.classList.add("js-ready");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- mobile nav ----------
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    // Matches the 860px nav breakpoint in the stylesheet. Keep them in sync.
    var navQuery = window.matchMedia("(max-width: 860px)");
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
      toggle.textContent = open ? "Close" : "Menu";
      root.classList.toggle("nav-locked", open);
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
      // Keep Tab inside the menu (and its toggle) while it covers the page.
      var items = [toggle].concat(focusable());
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (!isOpen()) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false, false);
    });
    var onBreakpoint = function (e) { if (!e.matches && isOpen()) setOpen(false, false); };
    if (navQuery.addEventListener) navQuery.addEventListener("change", onBreakpoint);
    else if (navQuery.addListener) navQuery.addListener(onBreakpoint);
  }

  // ---------- theme switch ----------
  // With no stored choice the page follows the system setting; the switch
  // stores an explicit choice that overrides it.
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) {
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    var effective = function () {
      return root.dataset.theme || (systemDark.matches ? "dark" : "light");
    };
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    var sync = function () {
      var dark = effective() === "dark";
      themeBtn.setAttribute("aria-checked", dark ? "true" : "false");
      if (root.dataset.theme) {
        for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", dark ? "#151515" : "#dedad3");
      }
    };
    themeBtn.addEventListener("click", function () {
      var next = effective() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      sync();
    });
    if (systemDark.addEventListener) systemDark.addEventListener("change", sync);
    sync();
  }

  // ---------- image fallbacks ----------
  // About portrait: show the styled placeholder instead of a broken image.
  document.querySelectorAll(".portrait img").forEach(function (img) {
    var miss = function () { img.closest(".portrait").classList.add("missing"); };
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener("error", miss);
  });
  // Logos always sit beside the organisation's name in text, so a missing
  // file just drops the mark.
  document.querySelectorAll(".work-meta img").forEach(function (img) {
    var drop = function () { img.style.display = "none"; };
    if (img.complete && img.naturalWidth === 0) drop();
    img.addEventListener("error", drop);
  });

  // ---------- scroll reveal ----------
  // The stylesheet only hides .reveal children under html.js, and skips the
  // whole thing under reduced motion.
  var revealed = document.querySelectorAll(".reveal");
  var showAll = function () { revealed.forEach(function (el) { el.classList.add("in"); }); };
  var seen = false;
  if (!reduce && "IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        seen = true;
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px 10% 0px" });
    revealed.forEach(function (el) { io.observe(el); });
    // Failsafe: if the observer never reports (a throttled or never
    // composited tab), show everything rather than leave copy invisible.
    setTimeout(function () {
      if (!seen) { io.disconnect(); showAll(); }
    }, 2500);
    // Printing should never catch a half-revealed page.
    window.addEventListener("beforeprint", showAll);
  } else {
    showAll();
  }

  // ---------- home: the photo stage ----------
  // The fixed portrait changes to the second photo once the reading column
  // reaches a section marked data-photo="2", and back again on the way up.
  var stage = document.querySelector(".stage-photo");
  var cues = document.querySelectorAll("[data-photo]");
  // The second photo is only fetched once its first section is a screen away.
  var lateImg = stage && stage.querySelector("img[data-src]");
  var firstCue = document.querySelector('[data-photo="2"]');
  if (lateImg && firstCue) {
    var fetchLate = function () {
      if (!lateImg.dataset.src) return;
      lateImg.srcset = lateImg.dataset.srcset || "";
      lateImg.src = lateImg.dataset.src;
      delete lateImg.dataset.src;
    };
    if ("IntersectionObserver" in window) {
      var lateIo = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { fetchLate(); lateIo.disconnect(); }
      }, { rootMargin: "100% 0px 100% 0px" });
      lateIo.observe(firstCue);
    } else {
      fetchLate();
    }
  }
  if (stage && cues.length && "IntersectionObserver" in window) {
    var stageIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) stage.dataset.show = entry.target.dataset.photo;
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    cues.forEach(function (el) { stageIo.observe(el); });
  }

  // ---------- home: year by year ----------
  // Each year is a disclosure. Without script every year stays open.
  var yearBtns = document.querySelectorAll(".year-btn");
  if (yearBtns.length) {
    var setYear = function (btn, open) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (panel) panel.hidden = !open;
    };
    yearBtns.forEach(function (btn, i) {
      setYear(btn, i === 0);
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") !== "true";
        // Measured before anything collapses, so the tapped year stays put.
        var before = btn.getBoundingClientRect().top;
        // One year at a time, so the list reads as a single answer.
        yearBtns.forEach(function (other) { if (other !== btn) setYear(other, false); });
        setYear(btn, open);
        var shift = btn.getBoundingClientRect().top - before;
        if (shift) window.scrollBy({ top: shift, behavior: "instant" });
      });
    });
  }

  // ---------- resume print button ----------
  var printBtn = document.getElementById("print-btn");
  if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
})();
