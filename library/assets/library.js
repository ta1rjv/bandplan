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
    var el = doc.getElementById(decodeURIComponent(location.hash.slice(1)));
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
    var html = escapeHtml(text);
    terms(q).forEach(function (t) {
      var et = escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp("(" + et + ")", "ig"), "<mark>$1</mark>");
    });
    return html;
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
})();
