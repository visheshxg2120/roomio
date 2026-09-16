(function () {
  "use strict";

  const STORAGE_KEY = "roomio-checklist-progress-v1";
  const OPEN_KEY = "roomio-checklist-open-v1";

  const state = {
    categories: [],
    checked: loadJSON(STORAGE_KEY, {}),
    openCards: loadJSON(OPEN_KEY, {}),
    search: "",
    priority: "all",
    hideCompleted: false,
  };

  const els = {
    grid: document.getElementById("categoryGrid"),
    emptyState: document.getElementById("emptyState"),
    searchInput: document.getElementById("searchInput"),
    priorityChips: document.getElementById("priorityChips"),
    hideCompletedToggle: document.getElementById("hideCompletedToggle"),
    resetBtn: document.getElementById("resetBtn"),
    summaryLabel: document.getElementById("summaryLabel"),
    summaryPercent: document.getElementById("summaryPercent"),
    summaryFill: document.getElementById("summaryFill"),
    statEssentialLeft: document.getElementById("statEssentialLeft"),
    statCategoriesDone: document.getElementById("statCategoriesDone"),
    statTotalItems: document.getElementById("statTotalItems"),
  };

  const cardTemplate = document.getElementById("categoryCardTemplate");
  const itemTemplate = document.getElementById("itemRowTemplate");

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable (private mode, quota) — progress just won't persist */
    }
  }

  function isChecked(itemId) {
    return !!state.checked[itemId];
  }

  function setChecked(itemId, value) {
    if (value) state.checked[itemId] = true;
    else delete state.checked[itemId];
    saveJSON(STORAGE_KEY, state.checked);
  }

  function matchesFilters(item) {
    if (state.priority !== "all" && item.priority !== state.priority) return false;
    if (state.hideCompleted && isChecked(item.id)) return false;
    if (state.search) {
      const q = state.search;
      const hay = (item.name + " " + (item.notes || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function categoryStats(category) {
    const total = category.items.length;
    const done = category.items.filter((i) => isChecked(i.id)).length;
    const essentialLeft = category.items.filter(
      (i) => i.priority === "Essential" && !isChecked(i.id)
    ).length;
    return { total, done, essentialLeft };
  }

  function buildItemRow(item) {
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector(".item-checkbox");
    const name = node.querySelector(".item-name");
    const notes = node.querySelector(".item-notes");
    const qty = node.querySelector(".item-qty");
    const priority = node.querySelector(".item-priority");

    checkbox.checked = isChecked(item.id);
    checkbox.addEventListener("change", () => {
      setChecked(item.id, checkbox.checked);
      render();
    });

    name.textContent = item.name;
    notes.textContent = item.notes || "";
    qty.textContent = item.qty ? `×${item.qty}` : "";
    priority.textContent = item.priority;
    priority.dataset.priority = item.priority;

    if (!matchesFilters(item)) node.hidden = true;

    return node;
  }

  function buildCategoryCard(category) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.categoryId = category.id;

    const header = node.querySelector(".card-header");
    const icon = node.querySelector(".card-icon");
    const title = node.querySelector(".card-title");
    const fill = node.querySelector(".progress-bar-fill");
    const count = node.querySelector(".card-count");
    const essentialBadge = node.querySelector(".badge-essential");
    const list = node.querySelector(".item-list");

    icon.textContent = category.icon;
    title.textContent = category.name;

    const stats = categoryStats(category);
    const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    fill.style.width = pct + "%";
    count.textContent = `${stats.done}/${stats.total}`;
    node.dataset.complete = String(stats.total > 0 && stats.done === stats.total);

    if (stats.essentialLeft > 0) {
      essentialBadge.hidden = false;
      essentialBadge.textContent = `${stats.essentialLeft} essential left`;
    }

    const visibleItems = category.items.filter(matchesFilters);
    const isOpen = !!state.openCards[category.id];
    const forceOpenBySearch = state.search.length > 0 && visibleItems.length > 0;

    if (isOpen || forceOpenBySearch) {
      node.classList.add("open");
      list.hidden = false;
    }

    category.items.forEach((item) => {
      list.appendChild(buildItemRow(item));
    });

    header.addEventListener("click", () => {
      const nowOpen = list.hidden;
      list.hidden = !nowOpen;
      node.classList.toggle("open", nowOpen);
      state.openCards[category.id] = nowOpen;
      saveJSON(OPEN_KEY, state.openCards);
    });

    if (category.items.every((i) => !matchesFilters(i)) && (state.search || state.priority !== "all" || state.hideCompleted)) {
      node.hidden = true;
    }

    return node;
  }

  function render() {
    els.grid.innerHTML = "";
    let anyVisible = false;

    state.categories.forEach((category) => {
      const card = buildCategoryCard(category);
      if (!card.hidden) anyVisible = true;
      els.grid.appendChild(card);
    });

    els.emptyState.hidden = anyVisible;
    renderSummary();
  }

  function renderSummary() {
    const allItems = state.categories.flatMap((c) => c.items);
    const total = allItems.length;
    const done = allItems.filter((i) => isChecked(i.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    els.summaryLabel.textContent = `${done} of ${total} done`;
    els.summaryPercent.textContent = `${pct}%`;
    els.summaryFill.style.width = pct + "%";

    const essentialLeft = allItems.filter(
      (i) => i.priority === "Essential" && !isChecked(i.id)
    ).length;
    const categoriesDone = state.categories.filter((c) => {
      const s = categoryStats(c);
      return s.total > 0 && s.done === s.total;
    }).length;

    els.statEssentialLeft.textContent = essentialLeft;
    els.statCategoriesDone.textContent = `${categoriesDone}/${state.categories.length}`;
    els.statTotalItems.textContent = total;
  }

  function wireControls() {
    els.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value.trim().toLowerCase();
      render();
    });

    els.priorityChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.priority = chip.dataset.priority;
      els.priorityChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      render();
    });

    els.hideCompletedToggle.addEventListener("change", (e) => {
      state.hideCompleted = e.target.checked;
      render();
    });

    els.resetBtn.addEventListener("click", () => {
      if (!confirm("Clear all checked progress? This can't be undone.")) return;
      state.checked = {};
      saveJSON(STORAGE_KEY, state.checked);
      render();
    });
  }

  function init() {
    fetch("data/checklist.json")
      .then((res) => res.json())
      .then((data) => {
        state.categories = data.categories;
        wireControls();
        render();
      })
      .catch((err) => {
        els.grid.innerHTML = `<p class="empty-state">Couldn't load checklist data. ${err.message}</p>`;
      });
  }

  init();
})();
