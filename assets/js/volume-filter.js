// In-page filter for a single volume page. Progressive enhancement: the toolbar is in
// the HTML, but if this script doesn't run, every article is simply visible (the default),
// so nothing is ever hidden from a no-JS reader.
(function () {
  "use strict";

  var filterInput = document.getElementById("vol-filter");
  var statusButtons = document.querySelectorAll(".chip[data-filter-status]");
  var emptyMsg = document.getElementById("filter-empty");
  var liveStatus = document.getElementById("filter-status");
  var items = Array.prototype.slice.call(document.querySelectorAll(".article-item"));
  var issueCards = Array.prototype.slice.call(document.querySelectorAll(".issue-card"));
  if (!filterInput || !items.length) return;

  // Fold diacritics so an ASCII query ("miclau") matches an accented title ("Miclău").
  // Same transform as the site search. Precompute each item's folded title once.
  function fold(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  items.forEach(function (li) {
    var title = li.getAttribute("data-title") || "";
    var authors = li.getAttribute("data-authors") || "";
    li._foldedText = fold(title + " " + authors);
  });

  var activeStatus = "all";

  function apply() {
    var q = fold(filterInput.value.trim());
    var visible = 0;

    items.forEach(function (li) {
      var matchesText = !q || li._foldedText.indexOf(q) !== -1;
      var matchesStatus = activeStatus === "all" || li.getAttribute("data-status") === activeStatus;
      var show = matchesText && matchesStatus;
      li.hidden = !show;
      if (show) visible++;
    });

    // Hide an issue card entirely if none of its articles are visible.
    issueCards.forEach(function (card) {
      card.hidden = card.querySelectorAll(".article-item:not([hidden])").length === 0;
    });

    var filtering = q !== "" || activeStatus !== "all";
    if (emptyMsg) emptyMsg.hidden = visible !== 0;
    if (liveStatus) {
      liveStatus.textContent = !filtering ? "" :
        visible === 0 ? "No articles match your filter." :
        visible + (visible === 1 ? " article" : " articles") + " shown.";
    }
  }

  filterInput.addEventListener("input", apply);

  Array.prototype.forEach.call(statusButtons, function (btn) {
    btn.addEventListener("click", function () {
      activeStatus = btn.getAttribute("data-filter-status");
      Array.prototype.forEach.call(statusButtons, function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      apply();
    });
  });
})();
