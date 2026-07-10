// Client-side full-text search over the article-title index (search-index.json).
// Everything runs in the browser: no query is ever sent to a server. Replaces the old
// third-party FreeFind box. Matching is token-based (all tokens must appear as a prefix
// of some word in the title), which handles partial words ("cosmo" -> "cosmology") and
// multi-term queries ("icon restoration") sensibly for a title index.
(function () {
  "use strict";

  var input = document.getElementById("search-input");
  var status = document.getElementById("search-status");
  var results = document.getElementById("search-results");
  var form = document.getElementById("search-form");
  if (!input || !results || !status) return;

  var INDEX = null;
  var MAX_RESULTS = 200;
  var debounceTimer = null;

  // Fold diacritics (NFD + strip combining marks) so accented letters in titles —
  // ~16% of the corpus (Romanian, Slovak, German …) — aren't shredded into fragments.
  // The SAME transform runs on index and query, so "Iasi" matches "Iași" and vice versa.
  // A handful of letters aren't NFD-decomposable (they're base letters, not letter+accent)
  // but do have an obvious ASCII equivalent \u2014 e.g. Polish \u0142 (73 occurrences in this
  // corpus alone), Danish/Norwegian \u00f8, Turkish dotless \u0131, \u0111, \u00e6. Map
  // those explicitly so an ASCII-typed query ("walkowski") still finds the accented form.
  var EXTRA_FOLD = { "\u0142": "l", "\u00f8": "o", "\u0131": "i", "\u0111": "d", "\u00e6": "ae" };
  function fold(s) {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return s.replace(/[\u0142\u00f8\u0131\u0111\u00e6]/g, function (c) { return EXTRA_FOLD[c]; });
  }
  function tokenize(s) {
    // \p{L}/\p{N} (Unicode letter/number, not just ASCII a-z0-9) so a title/author/keyword
    // in Polish, Cyrillic, Greek, or CJK script tokenizes as whole words instead of being
    // split apart at every character its script doesn't share with ASCII.
    return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  // Pre-tokenize each entry once, after load, for fast repeated matching. Indexes title,
  // authors, and keywords together, so a search for an author's surname or a subject
  // keyword matches the same way a title word would.
  function prepare(data) {
    var arr = data.articles || [];
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      a._tokens = tokenize([a.t, a.au, a.k].filter(Boolean).join(" "));
    }
    return arr;
  }

  function matches(article, queryTokens) {
    // Every query token must prefix-match at least one token from this article's combined
    // title + authors + keywords (see prepare() above), not just its title.
    for (var q = 0; q < queryTokens.length; q++) {
      var qt = queryTokens[q];
      var hit = false;
      var toks = article._tokens;
      for (var t = 0; t < toks.length; t++) {
        if (toks[t].indexOf(qt) === 0) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c];
    });
  }

  function render(list, query) {
    results.innerHTML = "";
    if (!list.length) {
      status.textContent = query
        ? 'No articles match “' + query + '”.'
        : "Type to search " + (INDEX ? INDEX.length.toLocaleString() : "") + " articles.";
      return;
    }
    var shown = Math.min(list.length, MAX_RESULTS);
    status.textContent =
      list.length.toLocaleString() + (list.length === 1 ? " article" : " articles") +
      " match" + (list.length > MAX_RESULTS ? " — showing first " + MAX_RESULTS : "") + ".";

    var frag = document.createDocumentFragment();
    for (var i = 0; i < shown; i++) {
      var a = list[i];
      var li = document.createElement("li");
      li.className = "search-result";

      var titleHtml;
      if (a.s === "open" && a.h) {
        titleHtml = '<a class="result-title" href="' + escapeHtml(a.h) + '">' + escapeHtml(a.t) + "</a>";
      } else {
        titleHtml = '<span class="result-title result-restricted">' + escapeHtml(a.t) + "</span>";
      }
      var authorsHtml = a.au ? '<span class="result-authors">' + escapeHtml(a.au) + "</span>" : "";
      // Keywords are indexed for matching but otherwise invisible — without this, a result
      // that matched only on a keyword (not the title or author) looks unexplained.
      var keywordsHtml = a.k ? '<span class="result-keywords">' + escapeHtml(a.k) + "</span>" : "";
      var tag = a.s === "restricted"
        ? '<span class="tag tag-restricted">Restricted</span>'
        : '<span class="tag tag-open">Open</span>';
      // a.v/a.i/a.y are integers from the build, so they can't carry HTML metacharacters —
      // but escaping them anyway keeps one invariant: everything entering innerHTML is escaped.
      var meta =
        '<span class="result-meta">' + tag +
        '<a href="' + escapeHtml(a.p) + '">Vol. ' + escapeHtml(String(a.v)) +
        " no. " + escapeHtml(String(a.i)) + " · " + escapeHtml(String(a.y)) + "</a></span>";

      li.innerHTML = titleHtml + authorsHtml + keywordsHtml + meta;
      frag.appendChild(li);
    }
    results.appendChild(frag);
  }

  function runSearch() {
    var query = input.value.trim();
    if (!INDEX) return;
    if (!query) { render([], ""); return; }
    var qTokens = tokenize(query);
    if (!qTokens.length) { render([], ""); return; }
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      if (matches(INDEX[i], qTokens)) out.push(INDEX[i]);
    }
    render(out, query);
  }

  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 120);
  }

  // The index is delivered as a global by search-index.js (a <script> tag before this one),
  // NOT fetched — so search works from file:// (double-clicked locally) as well as when hosted.
  var data = window.EJST_SEARCH_INDEX;
  if (!data || !data.articles) {
    status.textContent = "Could not load the search index. You can still browse the archive by volume.";
    return;
  }

  INDEX = prepare(data);
  input.addEventListener("input", onInput);
  if (form) form.addEventListener("submit", function (e) { e.preventDefault(); runSearch(); });

  // Suggested-search chips.
  var chips = document.querySelectorAll(".chip[data-q]");
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener("click", function () {
      input.value = chip.getAttribute("data-q");
      input.focus();
      runSearch();
    });
  });

  // Support a ?q= deep link (e.g. from elsewhere on the site), or a query already typed in.
  var params = new URLSearchParams(window.location.search);
  var q = params.get("q");
  if (q) { input.value = q; runSearch(); }
  else if (input.value.trim()) { runSearch(); }
  else { status.textContent = "Type to search " + INDEX.length.toLocaleString() + " articles."; }
})();
