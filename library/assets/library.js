/* Band plan library - theme toggle, navigation helpers, client-side search (no dependencies).
   Base: the x3650 library script. Differences: the page language comes from the URL (library/ Turkish,
   library/en/ English) and is never detected or stored; only the theme is stored; the search index of the page
   language is loaded from the shared assets directory (data-assets). */
(function () {
  "use strict";
  var doc = document, root = doc.body.getAttribute("data-root") || "";
  var assets = doc.body.getAttribute("data-assets") || root;
  var lang = doc.body.getAttribute("data-lang") || "tr";
  var T = {};
  try { T = JSON.parse(doc.body.getAttribute("data-i18n") || "{}"); } catch (e) { T = {}; }
  var KEY = "bandplan-theme";

  /* theme */
  var toggle = doc.querySelector(".theme-toggle");
  function currentTheme() {
    var t = doc.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (toggle) toggle.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    doc.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });

  /* collapse the navigation on small screens */
  var nav = doc.querySelector(".sidenav details");
  if (nav && window.matchMedia && window.matchMedia("(max-width: 820px)").matches) nav.removeAttribute("open");

  /* tree expand / collapse */
  Array.prototype.forEach.call(doc.querySelectorAll("[data-tree]"), function (b) {
    b.addEventListener("click", function () {
      var open = b.getAttribute("data-tree") === "open";
      Array.prototype.forEach.call(doc.querySelectorAll(".tree-root details"), function (d) { d.open = open; });
    });
  });
  /* open tree branches leading to a #target */
  function revealTarget() {
    if (!location.hash) return;
    var id = location.hash.slice(1);
    try { id = decodeURIComponent(id); } catch (err) { /* malformed escape: use the raw fragment */ }
    var el = doc.getElementById(id);
    while (el) { if (el.tagName === "DETAILS") el.open = true; el = el.parentElement; }
  }
  revealTarget();
  window.addEventListener("hashchange", revealTarget);

  /* active entry in the side table of contents */
  var tocLinks = doc.querySelectorAll(".side-toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    Array.prototype.forEach.call(tocLinks, function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && map[e.target.id]) {
          Array.prototype.forEach.call(tocLinks, function (a) { a.classList.remove("active"); });
          map[e.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "0px 0px -75% 0px" });
    Object.keys(map).forEach(function (id) { var h = doc.getElementById(id); if (h) obs.observe(h); });
  }

  /* search */
  var index = null, waiting = [];
  function loadIndex(cb) {
    if (index) return cb(index);
    waiting.push(cb);
    if (waiting.length > 1) return;
    var s = doc.createElement("script");
    s.src = assets + "assets/search-index" + (lang === "tr" ? "" : "-" + lang) + ".js";
    s.onload = function () {
      index = (window.LIBRARY_SEARCH_INDEX || { entries: [] }).entries;
      index.forEach(function (e) { e._h = (e.h || "").toLowerCase(); e._p = (e.p || "").toLowerCase(); e._x = (e.x || "").toLowerCase(); });
      waiting.splice(0).forEach(function (f) { f(index); });
    };
    s.onerror = function () { waiting.splice(0); };
    doc.head.appendChild(s);
  }
  function terms(q) { return q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 0; }); }
  function search(q, limit) {
    var ts = terms(q), out = [];
    if (!ts.length || !index) return out;
    var phrase = q.toLowerCase().trim();
    for (var i = 0; i < index.length; i++) {
      var e = index[i], score = 0, ok = true;
      for (var j = 0; j < ts.length; j++) {
        var t = ts[j], s = 0;
        if (e._h.indexOf(t) >= 0) s += 10;
        if (e._p.indexOf(t) >= 0) s += 3;
        if (e._x.indexOf(t) >= 0) s += 1;
        if (!s) { ok = false; break; }
        score += s;
      }
      if (!ok) continue;
      if (ts.length > 1 && (e._h.indexOf(phrase) >= 0 || e._x.indexOf(phrase) >= 0)) score += 8;
      if (e._h === phrase) score += 20;
      out.push([score, e]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, limit).map(function (p) { return p[1]; });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function highlight(text, q) {
    /* match on the raw text, escape every piece separately (entities are never split) */
    text = String(text);
    var ts = terms(q).filter(Boolean).map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    if (!ts.length) return escapeHtml(text);
    var re = new RegExp("(" + ts.join("|") + ")", "ig"), out = "", last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      out += escapeHtml(text.slice(last, m.index)) + "<mark>" + escapeHtml(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }
  function snippet(e, q) {
    var x = e.x || "", ts = terms(q), pos = -1;
    for (var i = 0; i < ts.length && pos < 0; i++) pos = e._x.indexOf(ts[i]);
    var start = Math.max(0, pos - 60);
    var s = x.substr(start, 200);
    return (start > 0 ? "... " : "") + s + (start + 200 < x.length ? " ..." : "");
  }
  function resultHtml(e, q, tag) {
    return "<" + tag + ' href="' + root + escapeHtml(e.u) + '"><span class="r-h">' + highlight(e.h, q) +
      '</span> <span class="r-p">' + escapeHtml(e.p) + '</span><span class="r-x">' + highlight(snippet(e, q), q) + "</span></" + tag + ">";
  }
  var input = doc.getElementById("q"), pop = doc.getElementById("search-pop"), sel = -1;
  if (input && pop) {
    var render = function () {
      var q = input.value;
      if (!q.trim()) { pop.hidden = true; return; }
      loadIndex(function () {
        var res = search(q, 8);
        sel = -1;
        pop.innerHTML = res.length ? res.map(function (e) { return resultHtml(e, q, "a"); }).join("") +
          '<a href="' + root + "search.html?q=" + encodeURIComponent(q) + '"><em>' + escapeHtml(T.search_all || "All results for") + ' "' + escapeHtml(q) + '"</em></a>'
          : '<p class="none">' + escapeHtml(T.search_none || "No results.") + "</p>";
        pop.hidden = false;
      });
    };
    input.addEventListener("focus", function () { loadIndex(function () {}); });
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (ev) {
      var links = pop.querySelectorAll("a");
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (!links.length) return;
        ev.preventDefault();
        sel = (sel + (ev.key === "ArrowDown" ? 1 : links.length - 1)) % links.length;
        Array.prototype.forEach.call(links, function (a, i) { a.classList.toggle("sel", i === sel); });
      } else if (ev.key === "Enter" && sel >= 0 && links[sel]) {
        ev.preventDefault(); location.href = links[sel].href;
      } else if (ev.key === "Escape") { pop.hidden = true; }
    });
    doc.addEventListener("click", function (ev) { if (!pop.contains(ev.target) && ev.target !== input) pop.hidden = true; });
  }
  var results = doc.getElementById("search-results");
  if (results) {
    var m = /[?&]q=([^&]*)/.exec(location.search), q = "";
    try { q = m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; } catch (e) { q = ""; }
    var box = doc.getElementById("sq"), status = doc.getElementById("search-status");
    if (box) box.value = q;
    if (q) {
      /* the language switch keeps the query */
      Array.prototype.forEach.call(doc.querySelectorAll(".lang a"), function (a) {
        a.setAttribute("href", a.getAttribute("href") + "?q=" + encodeURIComponent(q));
      });
      loadIndex(function () {
        var res = search(q, 200);
        status.textContent = res.length + (res.length === 200 ? "+" : "") + " " + (T.search_results_for || "result(s) for") + " \"" + q + "\"";
        results.innerHTML = res.map(function (e) { return "<li>" + resultHtml(e, q, "a") + "</li>"; }).join("");
      });
    }
  }
  /* band spectrum charts: zoom / pan and the licence-class filter. Progressive enhancement over the static inline
     SVG (the same maths as src/lib/chart.ts); without JavaScript the chart stays at full width and the controls
     stay hidden. Every number comes from the data-* attributes the generator wrote from the YAML. */
  var SVGNS = "http://www.w3.org/2000/svg";
  function niceStep(raw) {
    var base = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / base;
    var nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return Math.max(1, Math.round(nice * base));
  }
  function genTicks(d, target) {
    var step = niceStep((d.end - d.start) / target), out = [];
    for (var v = Math.ceil(d.start / step) * step; v <= d.end; v += step) out.push(Math.round(v));
    return out.length ? out : [d.start];
  }
  var EXP = { Hz: 0, kHz: 3, MHz: 6, GHz: 9 };
  /* exact decimal text of an integer Hz value in a unit (no rounding); minDec is a floor, as in site_bandplan.py */
  function fmtHz(hz, unit, minDec) {
    var e = EXP[unit], div = Math.pow(10, e), ip = Math.floor(hz / div), rem = hz - ip * div;
    var frac = e ? String(rem) : "";
    while (frac.length < e) frac = "0" + frac;
    var floor = Math.min(minDec, e), end = frac.length;
    while (end > floor && frac.charAt(end - 1) === "0") end--;
    frac = frac.slice(0, end);
    while (frac.length < minDec) frac += "0";
    return frac ? ip + "." + frac : String(ip);
  }
  function clampDomain(d, bounds, minSpan) {
    var s = d.start, e = d.end;
    if (e - s < minSpan) { var m = (s + e) / 2; s = m - minSpan / 2; e = m + minSpan / 2; }
    var bs = bounds.end - bounds.start, cs = Math.min(e - s, bs);
    if (e - s !== cs) { var m2 = (s + e) / 2; s = m2 - cs / 2; e = m2 + cs / 2; }
    if (s < bounds.start) { e += bounds.start - s; s = bounds.start; }
    if (e > bounds.end) { s -= e - bounds.end; e = bounds.end; }
    return { start: Math.round(Math.max(bounds.start, s)), end: Math.round(Math.min(bounds.end, e)) };
  }
  var tip = null;
  function showTip(el, text) {
    if (!tip) {
      tip = doc.createElement("div");
      tip.className = "chart-tooltip"; tip.setAttribute("role", "status"); tip.setAttribute("aria-live", "polite");
      doc.body.appendChild(tip);
    }
    tip.textContent = text; tip.classList.add("visible");
    var r = el.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 20 - tip.offsetWidth)) + "px";
    tip.style.top = (r.bottom + 6) + "px";
  }
  function hideTip() { if (tip) tip.classList.remove("visible"); }

  function initChart(svg) {
    var id = svg.id, W = Number(svg.getAttribute("data-width")) || 800, unit = svg.getAttribute("data-unit") || "MHz";
    var decimals = Number(svg.getAttribute("data-axis-decimals")) || 0, minSpan = Number(svg.getAttribute("data-min-span")) || 1;
    var axisY = Number(svg.getAttribute("data-axis-y")), spotY = Number(svg.getAttribute("data-spot-y"));
    var bounds = { start: Number(svg.getAttribute("data-domain-start")), end: Number(svg.getAttribute("data-domain-end")) };
    if (!id || !(bounds.end > bounds.start)) return;
    var cur = { start: bounds.start, end: bounds.end };
    function fx(hz) { return (hz - cur.start) / (cur.end - cur.start) * W; }
    var controls = doc.querySelector('[data-chart-controls="' + id + '"]');
    var rangeEl = doc.querySelector('[data-chart-range="' + id + '"]');
    var filterBox = doc.querySelector('[data-class-filter-group="' + id + '"]');

    /* keyboard reachable segments with a tooltip taken from their <title> */
    Array.prototype.forEach.call(svg.querySelectorAll("rect.seg, polygon.spot-marker"), function (el) {
      var t = el.querySelector("title"), text = t ? t.textContent : "";
      el.setAttribute("tabindex", "0");
      if (!text) return;
      el.addEventListener("mouseenter", function () { showTip(el, text); });
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("focus", function () { showTip(el, text); });
      el.addEventListener("blur", hideTip);
      el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hideTip(); });
    });

    function redraw() {
      svg.setAttribute("data-view-start", String(cur.start));
      svg.setAttribute("data-view-end", String(cur.end));
      svg.classList.toggle("zoomed", cur.start > bounds.start || cur.end < bounds.end);
      Array.prototype.forEach.call(svg.querySelectorAll("rect[data-start]"), function (el) {
        var a = Number(el.getAttribute("data-start")), b = Number(el.getAttribute("data-end"));
        if (b < cur.start || a > cur.end) { el.style.display = "none"; return; }
        el.style.display = "";
        var x = fx(Math.max(a, cur.start));
        el.setAttribute("x", String(x));
        el.setAttribute("width", String(Math.max(0, fx(Math.min(b, cur.end)) - x)));
      });
      Array.prototype.forEach.call(svg.querySelectorAll("text.seg-label[data-start]"), function (el) {
        var a = Number(el.getAttribute("data-start")), b = Number(el.getAttribute("data-end"));
        var x1 = fx(Math.max(a, cur.start)), x2 = fx(Math.min(b, cur.end));
        var show = b >= cur.start && a <= cur.end && x2 - x1 > Number(el.getAttribute("data-min-w") || 0);
        el.style.display = show ? "" : "none";
        if (show) el.setAttribute("x", String((x1 + x2) / 2));
      });
      Array.prototype.forEach.call(svg.querySelectorAll("polygon[data-freq]"), function (el) {
        var hz = Number(el.getAttribute("data-freq")), ok = hz >= cur.start && hz <= cur.end;
        el.style.display = ok ? "" : "none";
        if (ok) { var x = fx(hz); el.setAttribute("points", (x - 4) + "," + (spotY + 6) + " " + (x + 4) + "," + (spotY + 6) + " " + x + "," + (spotY - 2)); }
      });
      var axis = svg.querySelector("g.axis");
      if (axis) {
        Array.prototype.forEach.call(axis.querySelectorAll("g.tick"), function (n) { axis.removeChild(n); });
        var ticks = genTicks(cur, 6);
        ticks.forEach(function (hz, i) {
          var x = fx(hz), g = doc.createElementNS(SVGNS, "g"), ln = doc.createElementNS(SVGNS, "line"), tx = doc.createElementNS(SVGNS, "text");
          g.setAttribute("class", "tick"); g.setAttribute("data-hz", String(hz));
          ln.setAttribute("x1", String(x)); ln.setAttribute("y1", String(axisY)); ln.setAttribute("x2", String(x)); ln.setAttribute("y2", String(axisY + 5));
          tx.setAttribute("x", String(x)); tx.setAttribute("y", String(axisY + 16));
          tx.setAttribute("text-anchor", i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle");
          tx.textContent = fmtHz(hz, unit, decimals);
          g.appendChild(ln); g.appendChild(tx); axis.appendChild(g);
        });
      }
      if (rangeEl) rangeEl.textContent = fmtHz(cur.start, unit, decimals) + "\u2013" + fmtHz(cur.end, unit, decimals) + " " + unit;
    }
    function setView(d) { cur = clampDomain(d, bounds, minSpan); redraw(); }
    function zoom(f) {
      var m = (cur.start + cur.end) / 2, half = (cur.end - cur.start) * f / 2;
      setView({ start: m - half, end: m + half });
    }
    function pan(frac) { var d = (cur.end - cur.start) * frac; setView({ start: cur.start + d, end: cur.end + d }); }
    function act(a) {
      if (a === "in") zoom(0.5); else if (a === "out") zoom(2);
      else if (a === "reset") setView({ start: bounds.start, end: bounds.end });
      else if (a === "left") pan(-0.25); else if (a === "right") pan(0.25);
    }
    if (controls) {
      controls.hidden = false;
      Array.prototype.forEach.call(controls.querySelectorAll("[data-zoom]"), function (b) {
        b.addEventListener("click", function () { act(b.getAttribute("data-zoom")); });
      });
      if (rangeEl) redraw();
    }
    /* mouse / pen drag pans a zoomed chart; touch users scroll the chart or use the buttons */
    var drag = null;
    svg.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "touch" || ev.button !== 0 || !svg.classList.contains("zoomed")) return;
      drag = { x: ev.clientX, s: cur.start, e: cur.end };
      svg.classList.add("dragging");
      if (svg.setPointerCapture) { try { svg.setPointerCapture(ev.pointerId); } catch (err) {} }
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var wpx = svg.getBoundingClientRect().width || W, d = -(ev.clientX - drag.x) / wpx * (drag.e - drag.s);
      setView({ start: drag.s + d, end: drag.e + d });
    });
    function endDrag() { drag = null; svg.classList.remove("dragging"); }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    /* keyboard on a focused segment: + / - zoom, arrows pan, 0 resets */
    svg.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      var map = { "+": "in", "=": "in", "-": "out", "_": "out", "0": "reset", "ArrowLeft": "left", "ArrowRight": "right" };
      if (map[ev.key]) { ev.preventDefault(); act(map[ev.key]); }
    });

    /* licence-class filter: dims what the selected class may not use; classes with a narrowed sub-range also dim
       the plain allocation bar */
    if (filterBox) {
      filterBox.hidden = false;
      var buttons = filterBox.querySelectorAll("[data-class-filter]");
      Array.prototype.forEach.call(buttons, function (btn) {
        btn.addEventListener("click", function () {
          var sel = btn.getAttribute("data-class-filter"), all = sel === "ALL";
          Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
          Array.prototype.forEach.call(svg.querySelectorAll(".class-seg"), function (el) {
            el.parentNode.classList.toggle("class-dimmed", !all && el.getAttribute("data-class") !== sel);
          });
          Array.prototype.forEach.call(svg.querySelectorAll(".tr-seg"), function (el) {
            el.parentNode.classList.toggle("class-dimmed", !all && btn.hasAttribute("data-has-narrow"));
          });
          Array.prototype.forEach.call(doc.querySelectorAll(".class-access-list li[data-class]"), function (li) {
            li.classList.toggle("class-dimmed-item", !all && li.getAttribute("data-class") !== sel);
          });
        });
      });
    }
  }
  Array.prototype.forEach.call(doc.querySelectorAll("svg.spectrum[data-domain-start][id]"), initChart);
})();
