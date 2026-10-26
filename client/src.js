// dsh-plugin-workspace-discovery client — the browser half.
// ---------------------------------------------------------------
// Registered through window.__ModuleLoader__ (the contract every DSH client
// plugin uses): the factory returns module.exports carrying { name, inject,
// apply }. This bundle deliberately needs no client services: it talks to
// the host half over the plugin's own HTTP routes (/api/workspace-discovery)
// and mounts a small entry at the bottom of the sidebar, following the
// pattern proven by other sidebar widgets (e.g. dsh-pr-board).
//
// UI strings come from the plugin's own dictionaries in locale/ (en is the
// source; zh and ja ship with identical key sets, enforced by tests). The
// build script (scripts/build-client.mjs) inlines them below.
(function () {
  "use strict";

  /*__LOCALES__*/

  var API = "/api/workspace-discovery";

  var CSS_TEXT = [
    "#wsd-widget{flex:none;margin-top:8px;padding:8px 2px 2px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);font-size:12px;color:inherit;min-width:0;cursor:pointer}",
    "#wsd-widget .wsd-head{display:flex;align-items:center;justify-content:space-between;font-weight:600;gap:6px}",
    "#wsd-widget .wsd-count{min-width:18px;text-align:center;padding:0 5px;border-radius:8px;background:color-mix(in srgb,currentColor 12%,transparent);font-size:11px;font-weight:700}",
    "#wsd-widget .wsd-hint{opacity:.6;font-size:11px;margin-top:2px}",
    "#wsd-overlay{position:fixed;inset:0;z-index:2147483000;display:none;background:color-mix(in srgb,#000 62%,transparent);backdrop-filter:blur(3px)}",
    "#wsd-overlay.wsd-show{display:flex;align-items:center;justify-content:center}",
    "#wsd-panel{width:min(860px,94vw);max-height:88vh;display:flex;flex-direction:column;background:#161b22;color:#e6edf3;border:1px solid rgba(255,255,255,.14);border-radius:12px;overflow:hidden}",
    "#wsd-panel .wsd-p-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1)}",
    "#wsd-panel .wsd-p-title{font-size:15px;font-weight:700}",
    "#wsd-panel .wsd-spacer{flex:1}",
    "#wsd-panel .wsd-controls{padding:10px 16px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid rgba(255,255,255,.08)}",
    "#wsd-panel label{font-size:12px;opacity:.75}",
    "#wsd-panel textarea,#wsd-panel input[type=text],#wsd-panel input[type=number]{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:6px;color:#fff;padding:5px 8px;font-size:12px}",
    "#wsd-panel textarea{width:100%;box-sizing:border-box;min-height:52px;font-family:ui-monospace,monospace}",
    "#wsd-panel .wsd-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    "#wsd-panel button{padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-size:12px;cursor:pointer}",
    "#wsd-panel button:hover{background:rgba(255,255,255,.16)}",
    "#wsd-panel button.wsd-primary{background:rgba(31,111,235,.4);border-color:rgba(96,165,250,.55)}",
    "#wsd-panel button[disabled]{opacity:.45;cursor:default}",
    "#wsd-panel .wsd-status{font-size:12px;opacity:.8;min-height:16px}",
    "#wsd-panel .wsd-list{overflow:auto;padding:6px 10px}",
    "#wsd-panel .wsd-item{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;font-size:12px}",
    "#wsd-panel .wsd-item:hover{background:rgba(255,255,255,.06)}",
    "#wsd-panel .wsd-name{font-weight:600;white-space:nowrap}",
    "#wsd-panel .wsd-path{opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:120px}",
    "#wsd-panel .wsd-badge{flex:none;padding:0 6px;border-radius:8px;background:rgba(52,211,153,.2);color:#34d399;font-size:10px;font-weight:700}",
    "#wsd-panel .wsd-act{flex:none;opacity:.5;font-size:11px;white-space:nowrap}",
    "#wsd-panel .wsd-foot{display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid rgba(255,255,255,.1)}",
  ].join("\n");

  // ---------- i18n ----------
  function detectLang() {
    var raw = "";
    try { raw = document.documentElement.lang || navigator.language || "en"; } catch (e) { raw = "en"; }
    raw = String(raw).toLowerCase();
    if (raw.indexOf("ja") === 0) return "ja";
    if (raw.indexOf("zh") === 0) return "zh";
    return "en";
  }
  var LANG = detectLang();
  function t(key, vars) {
    var dict = LOCALES[LANG] || LOCALES.en || {};
    var text = dict[key] || (LOCALES.en && LOCALES.en[key]) || key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] === undefined ? m : String(vars[name]);
      });
    }
    return text;
  }

  // ---------- state ----------
  var config = null;
  var candidates = [];
  var scanned = false;
  var selected = new Set();
  var filterText = "";
  var showRegistered = false;

  function api(path, opts) {
    return fetch(path, opts).then(function (r) { return r.json(); });
  }
  function post(path, body) {
    return api(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- widget ----------
  function findSidebar() {
    var els = document.querySelectorAll("aside, nav, div");
    for (var i = 0; i < els.length; i++) {
      var cs = getComputedStyle(els[i]);
      if (cs.getPropertyValue("--dsh-sidebar-inline-padding")) return els[i];
    }
    return document.querySelector("aside");
  }

  function mountWidget() {
    if (document.getElementById("wsd-widget")) return true;
    var sidebar = findSidebar();
    if (!sidebar) return false;
    var w = el("div");
    w.id = "wsd-widget";
    var head = el("div", "wsd-head");
    head.appendChild(el("span", null, t("title")));
    var count = el("span", "wsd-count", "…");
    count.id = "wsd-count";
    head.appendChild(count);
    w.appendChild(head);
    w.appendChild(el("div", "wsd-hint", t("widgetHint")));
    w.addEventListener("click", openPanel);
    sidebar.insertBefore(w, sidebar.lastChild);
    refreshCount();
    return true;
  }

  function refreshCount() {
    post(API + "/scan", {}).then(function (res) {
      if (!res || !res.ok) return;
      candidates = res.candidates || [];
      scanned = true;
      var badge = document.getElementById("wsd-count");
      if (badge) badge.textContent = String(res.unregisteredCount || 0);
    }).catch(function () {});
  }

  // ---------- panel ----------
  function openPanel() {
    var overlay = document.getElementById("wsd-overlay");
    if (!overlay) overlay = buildPanel();
    overlay.classList.add("wsd-show");
    if (!config) {
      api(API + "/state").then(function (res) {
        if (res && res.ok) {
          config = res.config;
          fillConfig();
        }
      }).catch(function () { setStatus(t("loadFailed")); });
    } else {
      fillConfig();
    }
    renderList();
    if (!scanned) runScan();
  }
  function closePanel() {
    var overlay = document.getElementById("wsd-overlay");
    if (overlay) overlay.classList.remove("wsd-show");
  }

  var refs = {};
  function buildPanel() {
    injectStyle();
    var overlay = el("div");
    overlay.id = "wsd-overlay";
    var panel = el("div");
    panel.id = "wsd-panel";
    overlay.appendChild(panel);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closePanel(); });

    var head = el("div", "wsd-p-head");
    head.appendChild(el("span", "wsd-p-title", t("title")));
    head.appendChild(el("span", "wsd-spacer"));
    var closeBtn = el("button", null, t("close"));
    closeBtn.addEventListener("click", closePanel);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var controls = el("div", "wsd-controls");
    controls.appendChild(el("label", null, t("rootsLabel")));
    refs.roots = el("textarea");
    controls.appendChild(refs.roots);
    var row1 = el("div", "wsd-row");
    row1.appendChild(el("label", null, t("maxDepthLabel")));
    refs.maxDepth = el("input");
    refs.maxDepth.type = "number";
    refs.maxDepth.min = "0";
    refs.maxDepth.max = "10";
    refs.maxDepth.style.width = "56px";
    row1.appendChild(refs.maxDepth);
    refs.save = el("button", null, t("save"));
    refs.save.addEventListener("click", saveConfigFromPanel);
    row1.appendChild(refs.save);
    refs.scan = el("button", "wsd-primary", t("scan"));
    refs.scan.addEventListener("click", runScan);
    row1.appendChild(refs.scan);
    controls.appendChild(row1);
    var row2 = el("div", "wsd-row");
    refs.search = el("input");
    refs.search.type = "text";
    refs.search.placeholder = t("searchPlaceholder");
    refs.search.style.flex = "1";
    refs.search.addEventListener("input", function () { filterText = refs.search.value.toLowerCase(); renderList(); });
    row2.appendChild(refs.search);
    var showLabel = el("label");
    refs.showRegistered = el("input");
    refs.showRegistered.type = "checkbox";
    refs.showRegistered.addEventListener("change", function () { showRegistered = refs.showRegistered.checked; renderList(); });
    showLabel.appendChild(refs.showRegistered);
    showLabel.appendChild(document.createTextNode(" " + t("showRegistered")));
    row2.appendChild(showLabel);
    controls.appendChild(row2);
    refs.status = el("div", "wsd-status", t("notScannedYet"));
    controls.appendChild(refs.status);
    panel.appendChild(controls);

    refs.list = el("div", "wsd-list");
    panel.appendChild(refs.list);

    var foot = el("div", "wsd-foot");
    refs.selectAll = el("button", null, t("selectAll"));
    refs.selectAll.addEventListener("click", function () {
      candidates.forEach(function (c) { if (!c.registered) selected.add(c.path); });
      renderList();
    });
    foot.appendChild(refs.selectAll);
    refs.clear = el("button", null, t("clearSelection"));
    refs.clear.addEventListener("click", function () { selected.clear(); renderList(); });
    foot.appendChild(refs.clear);
    foot.appendChild(el("span", "wsd-spacer"));
    refs.registerAll = el("button", null, t("registerAll"));
    refs.registerAll.addEventListener("click", function () {
      registerPaths(candidates.filter(function (c) { return !c.registered; }).map(function (c) { return c.path; }));
    });
    foot.appendChild(refs.registerAll);
    refs.register = el("button", "wsd-primary", "");
    refs.register.addEventListener("click", function () { registerPaths([...selected]); });
    foot.appendChild(refs.register);
    panel.appendChild(foot);

    document.body.appendChild(overlay);
    return overlay;
  }

  function fillConfig() {
    if (!config || !refs.roots) return;
    refs.roots.value = (config.roots || []).join("\n");
    refs.maxDepth.value = String(config.maxDepth ?? 4);
  }

  function setStatus(text) {
    if (refs.status) refs.status.textContent = text;
  }

  function saveConfigFromPanel() {
    var roots = refs.roots.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var maxDepth = parseInt(refs.maxDepth.value, 10);
    post(API + "/config", { config: { roots: roots, maxDepth: Number.isFinite(maxDepth) ? maxDepth : 4, exclude: (config && config.exclude) || [], autoRegister: !!(config && config.autoRegister) } })
      .then(function (res) {
        if (res && res.ok) { config = res.config; setStatus(t("saved")); }
        else setStatus(t("scanFailed"));
      })
      .catch(function () { setStatus(t("scanFailed")); });
  }

  function runScan() {
    setStatus(t("scanning"));
    refs.scan.disabled = true;
    var roots = refs.roots && refs.roots.value
      ? refs.roots.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
      : undefined;
    post(API + "/scan", roots ? { roots: roots } : {})
      .then(function (res) {
        refs.scan.disabled = false;
        if (!res || !res.ok) { setStatus(t("scanFailed")); return; }
        candidates = res.candidates || [];
        scanned = true;
        selected.clear();
        var msg = t("foundSummary", { total: candidates.length, unregistered: res.unregisteredCount || 0 });
        if (res.errors && res.errors.length) msg += " · " + t("scanErrors", { count: res.errors.length });
        setStatus(msg);
        var badge = document.getElementById("wsd-count");
        if (badge) badge.textContent = String(res.unregisteredCount || 0);
        renderList();
      })
      .catch(function () { refs.scan.disabled = false; setStatus(t("scanFailed")); });
  }

  function visibleCandidates() {
    return candidates.filter(function (c) {
      if (!showRegistered && c.registered) return false;
      if (filterText && (c.name + " " + c.path).toLowerCase().indexOf(filterText) < 0) return false;
      return true;
    });
  }

  function renderList() {
    if (!refs.list) return;
    refs.list.textContent = "";
    var rows = visibleCandidates();
    if (scanned && rows.length === 0) refs.list.appendChild(el("div", "wsd-item", t("noResults")));
    rows.forEach(function (c) {
      var row = el("div", "wsd-item");
      var box = el("input");
      box.type = "checkbox";
      box.checked = selected.has(c.path);
      box.disabled = c.registered;
      box.addEventListener("change", function () {
        if (box.checked) selected.add(c.path); else selected.delete(c.path);
        updateRegisterButton();
      });
      row.appendChild(box);
      row.appendChild(el("span", "wsd-name", c.name));
      row.appendChild(el("span", "wsd-path", c.path));
      if (c.gitMtime) {
        var date = new Date(c.gitMtime);
        row.appendChild(el("span", "wsd-act", t("lastActivity", { date: date.toLocaleDateString() })));
      }
      if (c.registered) row.appendChild(el("span", "wsd-badge", t("registeredBadge")));
      refs.list.appendChild(row);
    });
    updateRegisterButton();
  }

  function updateRegisterButton() {
    if (refs.register) {
      refs.register.textContent = t("registerSelected", { count: selected.size });
      refs.register.disabled = selected.size === 0;
    }
    if (refs.registerAll) {
      refs.registerAll.disabled = !candidates.some(function (c) { return !c.registered; });
    }
  }

  function registerPaths(paths) {
    if (!paths.length) return;
    setStatus(t("registering"));
    post(API + "/register", { paths: paths })
      .then(function (res) {
        if (!res || !res.ok) { setStatus(t("registerFailed")); return; }
        var parts = [];
        if (res.created && res.created.length) parts.push(t("doneCreated", { count: res.created.length }));
        if (res.alreadyRegistered && res.alreadyRegistered.length) parts.push(t("doneAlready", { count: res.alreadyRegistered.length }));
        if (res.failed && res.failed.length) parts.push(t("doneFailed", { count: res.failed.length }));
        setStatus(parts.join(" "));
        var donePaths = new Set();
        (res.created || []).forEach(function (w) { donePaths.add(w.path); });
        (res.alreadyRegistered || []).forEach(function (w) { donePaths.add(w.path); });
        candidates.forEach(function (c) { if (donePaths.has(c.path)) c.registered = true; });
        donePaths.forEach(function (p) { selected.delete(p); });
        var badge = document.getElementById("wsd-count");
        if (badge) badge.textContent = String(candidates.filter(function (c) { return !c.registered; }).length);
        renderList();
      })
      .catch(function () { setStatus(t("registerFailed")); });
  }

  function injectStyle() {
    if (document.getElementById("wsd-style")) return;
    var st = document.createElement("style");
    st.id = "wsd-style";
    st.textContent = CSS_TEXT;
    document.head.appendChild(st);
  }

  function init() {
    injectStyle();
    var tries = 0;
    var timer = setInterval(function () {
      if (mountWidget() || ++tries > 20) clearInterval(timer);
    }, 1000);
    mountWidget();
  }

  function apply(_ctx) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  window.__ModuleLoader__.load({
    id: "dsh-plugin-workspace-discovery",
    factory: function () {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
      exports.name = "workspace-discovery";
      exports.inject = [];
      exports.apply = apply;
      return module.exports;
    },
  });
})();
