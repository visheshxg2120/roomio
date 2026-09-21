(function () {
  "use strict";

  const STORAGE_KEY = "roomio-checklist-progress-v1";

  const state = {
    categories: [],
    checked: loadJSON(STORAGE_KEY, {}),
    search: "",
    priority: "all",
    hideCompleted: false,
    activeCategoryId: null,
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
    panelOverlay: document.getElementById("panelOverlay"),
    sidePanel: document.getElementById("sidePanel"),
    panelIcon: document.getElementById("panelIcon"),
    panelTitle: document.getElementById("panelTitle"),
    panelFill: document.getElementById("panelFill"),
    panelCount: document.getElementById("panelCount"),
    panelItemList: document.getElementById("panelItemList"),
    panelClose: document.getElementById("panelClose"),
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

  function getCategory(id) {
    return state.categories.find((c) => c.id === id) || null;
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
      refreshCardSummary(item.categoryId);
      refreshPanelSummary();
      renderSummary();
    });

    name.textContent = item.name;
    notes.textContent = item.notes || "";
    qty.textContent = item.qty ? `×${item.qty}` : "";
    priority.textContent = item.priority;
    priority.dataset.priority = item.priority;

    return node;
  }

  function categoryHasVisibleItems(category) {
    return category.items.some(matchesFilters);
  }

  function buildCategoryCard(category) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.categoryId = category.id;

    const icon = node.querySelector(".card-icon");
    const title = node.querySelector(".card-title");
    const essentialBadge = node.querySelector(".badge-essential");

    icon.textContent = category.icon;
    title.textContent = category.name;

    applyCardSummary(node, category);

    if (category.id === state.activeCategoryId) {
      node.classList.add("active");
    }

    const filtersActive = state.search || state.priority !== "all" || state.hideCompleted;
    if (!categoryHasVisibleItems(category) && filtersActive && category.id !== state.activeCategoryId) {
      node.hidden = true;
    }

    node.querySelector(".card-header").addEventListener("click", () => {
      openPanel(category.id);
    });

    return node;
  }

  function applyCardSummary(cardNode, category) {
    const fill = cardNode.querySelector(".progress-bar-fill");
    const count = cardNode.querySelector(".card-count");
    const essentialBadge = cardNode.querySelector(".badge-essential");

    const stats = categoryStats(category);
    const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    fill.style.width = pct + "%";
    count.textContent = `${stats.done}/${stats.total}`;
    cardNode.dataset.complete = String(stats.total > 0 && stats.done === stats.total);

    if (stats.essentialLeft > 0) {
      essentialBadge.hidden = false;
      essentialBadge.textContent = `${stats.essentialLeft} essential left`;
    } else {
      essentialBadge.hidden = true;
    }
  }

  function refreshCardSummary(categoryId) {
    const category = getCategory(categoryId);
    const cardNode = els.grid.querySelector(`.card[data-category-id="${cssEscape(categoryId)}"]`);
    if (category && cardNode) applyCardSummary(cardNode, category);
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : value;
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

    if (state.activeCategoryId) {
      const category = getCategory(state.activeCategoryId);
      if (category) renderPanelItems(category);
    }
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

  function renderPanelItems(category) {
    els.panelIcon.textContent = category.icon;
    els.panelTitle.textContent = category.name;

    els.panelItemList.innerHTML = "";
    const visibleItems = category.items.filter(matchesFilters);
    visibleItems.forEach((item) => {
      els.panelItemList.appendChild(buildItemRow(Object.assign({}, item, { categoryId: category.id })));
    });

    if (visibleItems.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.style.marginTop = "24px";
      empty.textContent = "No items match your search.";
      els.panelItemList.appendChild(empty);
    }

    refreshPanelSummary();
  }

  function refreshPanelSummary() {
    const category = getCategory(state.activeCategoryId);
    if (!category) return;
    const stats = categoryStats(category);
    const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    els.panelFill.style.width = pct + "%";
    els.panelCount.textContent = `${stats.done}/${stats.total}`;
  }

  function openPanel(categoryId) {
    const category = getCategory(categoryId);
    if (!category) return;

    if (state.activeCategoryId === categoryId) {
      closePanel();
      return;
    }

    const prevActiveId = state.activeCategoryId;
    state.activeCategoryId = categoryId;

    if (prevActiveId) {
      const prevCard = els.grid.querySelector(`.card[data-category-id="${cssEscape(prevActiveId)}"]`);
      if (prevCard) prevCard.classList.remove("active");
    }
    const card = els.grid.querySelector(`.card[data-category-id="${cssEscape(categoryId)}"]`);
    if (card) card.classList.add("active");

    renderPanelItems(category);

    els.sidePanel.classList.add("open");
    els.sidePanel.setAttribute("aria-hidden", "false");
    els.panelOverlay.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  function closePanel() {
    if (!state.activeCategoryId) return;
    const card = els.grid.querySelector(`.card[data-category-id="${cssEscape(state.activeCategoryId)}"]`);
    if (card) card.classList.remove("active");

    state.activeCategoryId = null;
    els.sidePanel.classList.remove("open");
    els.sidePanel.setAttribute("aria-hidden", "true");
    els.panelOverlay.classList.remove("visible");
    document.body.style.overflow = "";
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

    els.panelClose.addEventListener("click", closePanel);
    els.panelOverlay.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
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
