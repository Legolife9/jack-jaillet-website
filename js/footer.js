// Jack Jaillet site: shared footer behaviour, loaded on every page (Signature Studio too).
// Footer year, the current-page marker, and Google Analytics, which loads only after a
// visitor allows it. Europe must opt in (Accept); elsewhere it runs unless the visitor says
// No thanks. The choice is kept in localStorage under "consent".

(function () {
  // Google Analytics 4 measurement ID, e.g. "G-ABC123XYZ". Empty = no analytics and no banner.
  var GA_ID = "G-GRX0SDYLVG";

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // One footer for every page, so the current-page marker is set here, not in the markup.
  document.querySelectorAll(".site-footer a[href^='/']").forEach(function (a) {
    if (a.pathname.replace(/\.html$/, "") === location.pathname.replace(/\.html$/, "")) a.setAttribute("aria-current", "page");
  });

  if (!/^G-[A-Z0-9]+$/.test(GA_ID)) return;

  var KEY = "consent";
  var choice = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var remember = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };

  // Europe (EU, EEA, UK, Switzerland and neighbours) is told apart by the device's time zone.
  // ponytail: time zone, not IP; an unknown zone counts as Europe, so the error is on the safe side.
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var optIn = !tz || /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)|Asia\/(Nicosia|Famagusta)|America\/(Guadeloupe|Martinique|Cayenne)|Indian\/(Reunion|Mayotte))/.test(tz);

  var loaded = false;
  var declined = false;
  function load() {
    // Said no, then yes, without leaving the page: GA is already here, so just switch it back on.
    window["ga-disable-" + GA_ID] = false;
    if (loaded) {
      // Only re-send the page view if collection was switched off in between.
      if (declined) { gtag("consent", "update", { analytics_storage: "granted" }); gtag("event", "page_view"); declined = false; }
      return;
    }
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("js", new Date());
    // Query strings are dropped (campaign utm_ tags kept) so private Signature Studio
    // links (?p=...) never reach Google, from this page or as a referrer. "set" makes
    // every event on the page use the cleaned addresses, not just the first page view.
    var utm = location.search.slice(1).split("&").filter(function (kv) { return /^utm_/.test(kv); }).join("&");
    gtag("set", {
      page_location: location.origin + location.pathname + (utm ? "?" + utm : ""),
      page_referrer: document.referrer.split(/[?#]/)[0]
    });
    gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  // Declining after accepting: stop collection and delete the _ga cookies on every domain form GA uses.
  function forget() {
    declined = true;
    window["ga-disable-" + GA_ID] = true;
    if (loaded) gtag("consent", "update", { analytics_storage: "denied" });
    var host = location.hostname.replace(/^www\./, "");
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^_ga/.test(name)) return;
      ["", "; domain=" + host, "; domain=." + host].forEach(function (d) {
        document.cookie = name + "=; max-age=0; path=/" + d;
      });
    });
  }

  // Both answers look the same, so saying no is as easy as saying yes. "notice" is the
  // outside-Europe version: analytics are already on and the visitor can turn them off.
  function ask(notice) {
    var old = document.getElementById("consent");
    if (old) old.remove();
    var b = document.createElement("div");
    b.id = "consent";
    b.className = "consent";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", "Cookie choice");
    b.innerHTML =
      (notice
        ? '<p>This site uses Google Analytics cookies to see which pages people visit. Nothing is used for ads. <a href="/privacy#analytics">Privacy policy</a></p>'
        : '<p>May I use Google Analytics cookies to see which pages people visit? Nothing is used for ads. <a href="/privacy#analytics">Privacy policy</a></p>') +
      '<div class="consent-actions">' +
      '<button type="button" class="btn btn-small btn-ghost sm" data-consent="denied">No thanks</button>' +
      '<button type="button" class="btn btn-small btn-ghost sm" data-consent="granted">' + (notice ? "OK" : "Accept") + "</button>" +
      "</div>";
    var returnTo = document.activeElement;
    var choose = function (v) {
      remember(v);
      b.remove();
      document.removeEventListener("keydown", onKey);
      document.body.style.paddingBottom = "";
      document.documentElement.style.scrollPaddingBottom = "";
      if (v === "granted") load(); else forget();
      // Focus goes back where it was (the Cookie settings button), or to the
      // start of the content when the banner opened on its own.
      var main = document.getElementById("main");
      if (returnTo && returnTo !== document.body && returnTo.isConnected) returnTo.focus();
      else if (main) { if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
    };
    var onKey = function (e) { if (e.key === "Escape" && !document.documentElement.classList.contains("nav-locked")) choose("denied"); };
    b.addEventListener("click", function (e) {
      var v = e.target.getAttribute("data-consent");
      if (v) choose(v);
    });
    document.addEventListener("keydown", onKey);
    // Right after the skip link in the tab order, so keyboard users meet it first.
    var skip = document.querySelector(".skip-link");
    if (skip && skip.parentNode === document.body) skip.after(b);
    else document.body.insertBefore(b, document.body.firstChild);
    var pad = function () {
      if (!b.isConnected) return;
      var h = b.offsetHeight + 16 + "px";
      document.body.style.paddingBottom = h;
      document.documentElement.style.scrollPaddingBottom = h;
    };
    pad();
    if ("ResizeObserver" in window) new ResizeObserver(pad).observe(b);
  }

  document.querySelectorAll("[data-cookie-settings]").forEach(function (li) {
    li.hidden = false;
    li.querySelector("button").addEventListener("click", function () { ask(false); });
  });

  var c = choice();
  if (c === "denied") window["ga-disable-" + GA_ID] = true;
  if (c === "granted") load();
  else if (c !== "denied") {
    if (!optIn) load();
    ask(!optIn);
  }
})();
