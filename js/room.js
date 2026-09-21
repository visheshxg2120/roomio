(function () {
  "use strict";

  const STORAGE_KEY = "roomio-checklist-progress-v1";
  const ZONE_IDS = ["balcony", "workstation", "entryway", "bedroom", "wardrobe", "bathroom"];
  const SUCCESS_HEX = 0x4d7c5f;

  const state = {
    categories: [],
    checked: loadJSON(STORAGE_KEY, {}),
    activeCategoryId: null,
    zoneGroups: {},
    zoneAnchors: {},
    zoneLabels: {},
  };

  const els = {
    summaryLabel: document.getElementById("summaryLabel"),
    summaryPercent: document.getElementById("summaryPercent"),
    summaryFill: document.getElementById("summaryFill"),
    panelOverlay: document.getElementById("panelOverlay"),
    sidePanel: document.getElementById("sidePanel"),
    panelIcon: document.getElementById("panelIcon"),
    panelTitle: document.getElementById("panelTitle"),
    panelFill: document.getElementById("panelFill"),
    panelCount: document.getElementById("panelCount"),
    panelItemList: document.getElementById("panelItemList"),
    panelClose: document.getElementById("panelClose"),
    canvasWrap: document.getElementById("roomCanvasWrap"),
    canvas: document.getElementById("roomCanvas"),
    roomLabels: document.getElementById("roomLabels"),
    roomLoading: document.getElementById("roomLoading"),
    otherCategories: document.getElementById("otherCategories"),
  };

  const itemTemplate = document.getElementById("itemRowTemplate");
  const otherChipTemplate = document.getElementById("otherChipTemplate");

  let renderer, scene, camera, controls;

  // ---------- storage / data helpers ----------

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
      /* storage unavailable — progress just won't persist */
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

  function categoryStats(category) {
    const total = category.items.length;
    const done = category.items.filter((i) => isChecked(i.id)).length;
    return { total, done, pct: total ? done / total : 0 };
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : value;
  }

  // ---------- side panel ----------

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
      onProgressChanged(state.activeCategoryId);
    });

    name.textContent = item.name;
    notes.textContent = item.notes || "";
    qty.textContent = item.qty ? `×${item.qty}` : "";
    priority.textContent = item.priority;
    priority.dataset.priority = item.priority;

    return node;
  }

  function renderPanelItems(category) {
    els.panelIcon.textContent = category.icon;
    els.panelTitle.textContent = category.name;
    els.panelItemList.innerHTML = "";
    category.items.forEach((item) => els.panelItemList.appendChild(buildItemRow(item)));
    refreshPanelSummary();
  }

  function refreshPanelSummary() {
    const category = getCategory(state.activeCategoryId);
    if (!category) return;
    const stats = categoryStats(category);
    els.panelFill.style.width = Math.round(stats.pct * 100) + "%";
    els.panelCount.textContent = `${stats.done}/${stats.total}`;
  }

  function setLabelActive(categoryId, active) {
    const label = state.zoneLabels[categoryId];
    if (label) label.classList.toggle("active", active);
    const chip = els.otherCategories.querySelector(`.other-chip[data-category-id="${cssEscape(categoryId)}"]`);
    if (chip) chip.classList.toggle("active", active);
    if (ZONE_IDS.includes(categoryId)) liftZone(categoryId, active);
  }

  function openPanel(categoryId) {
    const category = getCategory(categoryId);
    if (!category) return;

    if (state.activeCategoryId === categoryId) {
      closePanel();
      return;
    }

    if (state.activeCategoryId) setLabelActive(state.activeCategoryId, false);
    state.activeCategoryId = categoryId;
    setLabelActive(categoryId, true);

    renderPanelItems(category);

    els.sidePanel.classList.add("open");
    els.sidePanel.setAttribute("aria-hidden", "false");
    els.panelOverlay.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  function closePanel() {
    if (!state.activeCategoryId) return;
    setLabelActive(state.activeCategoryId, false);
    state.activeCategoryId = null;
    els.sidePanel.classList.remove("open");
    els.sidePanel.setAttribute("aria-hidden", "true");
    els.panelOverlay.classList.remove("visible");
    document.body.style.overflow = "";
  }

  function wirePanelControls() {
    els.panelClose.addEventListener("click", closePanel);
    els.panelOverlay.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
  }

  // ---------- summary bar ----------

  function refreshSummary() {
    const allItems = state.categories.flatMap((c) => c.items);
    const total = allItems.length;
    const done = allItems.filter((i) => isChecked(i.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    els.summaryLabel.textContent = `${done} of ${total} done`;
    els.summaryPercent.textContent = `${pct}%`;
    els.summaryFill.style.width = pct + "%";
  }

  // ---------- zone labels (floating over the 3D scene) ----------

  function createZoneLabels() {
    ZONE_IDS.forEach((id) => {
      const category = getCategory(id);
      if (!category) return;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "zone-label";
      el.innerHTML =
        `<span class="zone-label-icon">${category.icon}</span>` +
        `<span class="zone-label-text">` +
        `<span class="zone-label-name">${category.name}</span>` +
        `<span class="zone-label-count"></span>` +
        `</span>`;
      el.addEventListener("click", () => openPanel(id));
      el.addEventListener("mouseenter", () => {
        if (state.activeCategoryId !== id) liftZone(id, true);
      });
      el.addEventListener("mouseleave", () => {
        if (state.activeCategoryId !== id) liftZone(id, false);
      });
      els.roomLabels.appendChild(el);
      state.zoneLabels[id] = el;
    });
    updateAllZoneLabels();
  }

  function updateZoneLabel(id) {
    const category = getCategory(id);
    const label = state.zoneLabels[id];
    if (!category || !label) return;
    const stats = categoryStats(category);
    label.querySelector(".zone-label-count").textContent = `${stats.done}/${stats.total}`;
    label.dataset.complete = String(stats.total > 0 && stats.done === stats.total);
  }

  function updateAllZoneLabels() {
    ZONE_IDS.forEach(updateZoneLabel);
  }

  function liftZone(id, up) {
    const group = state.zoneGroups[id];
    if (!group || typeof gsap === "undefined") return;
    gsap.to(group.position, { y: up ? 0.07 : 0, duration: 0.25, ease: "power2.out" });
  }

  function tintZoneFloor(id) {
    const group = state.zoneGroups[id];
    if (!group || !group.userData.floorMaterial) return;
    const category = getCategory(id);
    const stats = categoryStats(category);
    const base = group.userData.baseColor;
    const success = new THREE.Color(SUCCESS_HEX);
    const target = new THREE.Color().lerpColors(base, success, stats.pct * 0.5);
    const mat = group.userData.floorMaterial;
    if (typeof gsap !== "undefined") {
      gsap.to(mat.color, { r: target.r, g: target.g, b: target.b, duration: 0.5, ease: "power2.out" });
    } else {
      mat.color.copy(target);
    }
  }

  // ---------- "everything else" chip strip ----------

  function renderOtherCategories() {
    els.otherCategories.innerHTML = "";
    state.categories
      .filter((c) => !ZONE_IDS.includes(c.id))
      .forEach((category) => {
        const node = otherChipTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.categoryId = category.id;
        node.querySelector(".other-chip-icon").textContent = category.icon;
        node.querySelector(".other-chip-name").textContent = category.name;
        node.addEventListener("click", () => openPanel(category.id));
        els.otherCategories.appendChild(node);
      });
    updateAllOtherChips();
  }

  function updateOtherChip(id) {
    const category = getCategory(id);
    const chip = els.otherCategories.querySelector(`.other-chip[data-category-id="${cssEscape(id)}"]`);
    if (!category || !chip) return;
    const stats = categoryStats(category);
    chip.querySelector(".other-chip-count").textContent = `${stats.done}/${stats.total}`;
    chip.dataset.complete = String(stats.total > 0 && stats.done === stats.total);
  }

  function updateAllOtherChips() {
    state.categories.filter((c) => !ZONE_IDS.includes(c.id)).forEach((c) => updateOtherChip(c.id));
  }

  // ---------- progress change fan-out ----------

  function onProgressChanged(categoryId) {
    refreshPanelSummary();
    refreshSummary();
    if (ZONE_IDS.includes(categoryId)) {
      updateZoneLabel(categoryId);
      tintZoneFloor(categoryId);
    } else {
      updateOtherChip(categoryId);
    }
  }

  // ---------- Three.js scene ----------

  function addBox(parent, w, h, d, color, x, y, z, opts) {
    opts = opts || {};
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness != null ? opts.roughness : 0.85,
      metalness: opts.metalness != null ? opts.metalness : 0.05,
      transparent: !!opts.transparent,
      opacity: opts.opacity != null ? opts.opacity : 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    if (opts.edges !== false) {
      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgesMat = new THREE.LineBasicMaterial({
        color: opts.edgeColor || 0x3a332b,
        transparent: true,
        opacity: 0.3,
      });
      mesh.add(new THREE.LineSegments(edgesGeo, edgesMat));
    }
    parent.add(mesh);
    return mesh;
  }

  function addCylinder(parent, radiusTop, radiusBottom, h, color, x, y, z, opts) {
    opts = opts || {};
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, opts.segments || 16);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness != null ? opts.roughness : 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addWall(x1, z1, x2, z2, height, thickness, color) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    const geo = new THREE.BoxGeometry(length, height, thickness);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x3a332b, transparent: true, opacity: 0.18 });
    mesh.add(new THREE.LineSegments(edgesGeo, edgesMat));
    scene.add(mesh);
    return mesh;
  }

  function makeZoneGroup(id, floorSpec, baseColorHex) {
    const group = new THREE.Group();
    group.userData.categoryId = id;

    const floor = addBox(
      group,
      floorSpec.w,
      0.03,
      floorSpec.d,
      baseColorHex,
      floorSpec.x,
      floorSpec.y,
      floorSpec.z,
      { castShadow: false, receiveShadow: true, edges: false }
    );
    group.userData.floorMaterial = floor.material;
    group.userData.baseColor = new THREE.Color(baseColorHex);

    scene.add(group);
    state.zoneGroups[id] = group;
    return group;
  }

  function buildLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.68));

    const key = new THREE.DirectionalLight(0xfff2e0, 0.95);
    key.position.set(6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.3);
    fill.position.set(-5, 6, -2);
    scene.add(fill);
  }

  function buildRoom() {
    const WALL_EXT_H = 1.5;
    const WALL_INT_H = 1.1;
    const WALL_T = 0.1;
    const wallColorExt = 0xece2d2;
    const wallColorInt = 0xf4eee2;

    // perimeter (outer footprint: bedroom 0-4.6, closet+bath 4.6-6, all 0-4 deep)
    addWall(0, 0, 6, 0, WALL_EXT_H, WALL_T, wallColorExt); // north
    addWall(0, 0, 0, 4, WALL_EXT_H, WALL_T, wallColorExt); // west
    addWall(6, 0, 6, 4, WALL_EXT_H, WALL_T, wallColorExt); // east
    addWall(0, 4, 0.6, 4, WALL_EXT_H, WALL_T, wallColorExt); // south, left of main door
    addWall(1.4, 4, 6, 4, WALL_EXT_H, WALL_T, wallColorExt); // south, right of main door

    // internal partitions (closet open to bedroom; bathroom doorway near closet)
    addWall(4.6, 2.0, 4.6, 4.0, WALL_INT_H, WALL_T, wallColorInt);
    addWall(4.6, 1.15, 6, 1.15, WALL_INT_H, WALL_T, wallColorInt);

    // decorative window insets on north wall
    [
      [1.5, 2.1],
      [3.5, 4.1],
    ].forEach(([x1, x2]) => {
      addBox(scene, x2 - x1, 0.5, 0.04, 0xbfe0e6, (x1 + x2) / 2, 1.0, 0.06, {
        castShadow: false,
        receiveShadow: false,
        roughness: 0.3,
        metalness: 0.2,
        edges: false,
      });
    });

    // ---- bedroom zone ----
    const bedroom = makeZoneGroup(
      "bedroom",
      { w: 4.6, d: 4.0, x: 2.3, y: 0, z: 2.0 },
      0xe9dfcf
    );
    // bed frame + mattress
    addBox(bedroom, 1.6, 0.3, 2.1, 0x9c6b45, 3.3, 0.15, 2.55);
    addBox(bedroom, 1.5, 0.18, 2.0, 0xf7f1e8, 3.3, 0.39, 2.55);
    addBox(bedroom, 1.5, 0.14, 0.55, 0xb5673a, 3.3, 0.42, 3.35);
    // pillows near headboard (north side of bed)
    addBox(bedroom, 0.6, 0.14, 0.4, 0xffffff, 2.95, 0.53, 1.75);
    addBox(bedroom, 0.6, 0.14, 0.4, 0xffffff, 3.65, 0.53, 1.75);
    // headboard
    addBox(bedroom, 1.6, 0.75, 0.12, 0x9c6b45, 3.3, 0.5, 1.5);
    // nightstands at foot end
    addBox(bedroom, 0.4, 0.45, 0.4, 0x9c6b45, 2.35, 0.22, 3.4);
    addBox(bedroom, 0.4, 0.45, 0.4, 0x9c6b45, 4.25, 0.22, 3.4);
    state.zoneAnchors.bedroom = new THREE.Vector3(3.3, 1.7, 2.5);

    // ---- workstation zone ----
    const workstation = makeZoneGroup(
      "workstation",
      { w: 1.15, d: 1.4, x: 0.575, y: 0, z: 2.0 },
      0xe3d6c0
    );
    addBox(workstation, 1.0, 0.06, 0.55, 0x9c6b45, 0.55, 0.7, 1.55);
    addBox(workstation, 0.06, 0.7, 0.5, 0x8a5a3a, 0.15, 0.35, 1.55);
    addBox(workstation, 0.4, 0.28, 0.03, 0x2e2a26, 0.55, 0.9, 1.32);
    addCylinder(workstation, 0.22, 0.22, 0.06, 0x5b7a9c, 0.55, 0.46, 2.15);
    addBox(workstation, 0.35, 0.4, 0.35, 0x5b7a9c, 0.55, 0.66, 2.15, { castShadow: true });
    state.zoneAnchors.workstation = new THREE.Vector3(0.6, 1.55, 1.85);

    // ---- balcony zone ----
    const balcony = makeZoneGroup(
      "balcony",
      { w: 1.0, d: 0.9, x: 0.5, y: 0, z: 0.45 },
      0xc9ae84
    );
    addCylinder(balcony, 0.1, 0.13, 0.3, 0x9c6b45, 0.75, 0.15, 0.25);
    addCylinder(balcony, 0.22, 0.22, 0.05, 0x4d7c5f, 0.75, 0.33, 0.25, { segments: 8 });
    state.zoneAnchors.balcony = new THREE.Vector3(0.5, 1.3, 0.45);

    // ---- entryway (main door) zone ----
    const entryway = makeZoneGroup(
      "entryway",
      { w: 0.8, d: 0.45, x: 1.0, y: 0, z: 3.77 },
      0x8a7256
    );
    addBox(entryway, 0.7, 0.85, 0.05, 0x9c6b45, 0.98, 0.43, 3.98, { rotY: -0.55 });
    addBox(entryway, 0.4, 0.5, 0.28, 0x9c6b45, 0.35, 0.25, 3.55);
    state.zoneAnchors.entryway = new THREE.Vector3(1.0, 1.3, 3.75);

    // ---- wardrobe / almirah zone ----
    const wardrobe = makeZoneGroup(
      "wardrobe",
      { w: 1.4, d: 1.15, x: 5.3, y: 0, z: 0.575 },
      0xe0d3be
    );
    addBox(wardrobe, 1.2, 1.3, 0.5, 0x9c6b45, 5.3, 0.65, 0.35);
    addBox(wardrobe, 0.03, 1.3, 0.02, 0x6f4a2e, 5.3, 0.65, 0.61);
    state.zoneAnchors.wardrobe = new THREE.Vector3(5.3, 1.85, 0.5);

    // ---- bathroom zone ----
    const bathroom = makeZoneGroup(
      "bathroom",
      { w: 1.4, d: 2.85, x: 5.3, y: 0, z: 2.575 },
      0xdce7e6
    );
    // WC
    addCylinder(bathroom, 0.22, 0.26, 0.35, 0xffffff, 5.55, 0.18, 3.7);
    addBox(bathroom, 0.4, 0.35, 0.18, 0xffffff, 5.55, 0.36, 3.95);
    // wash basin
    addBox(bathroom, 0.55, 0.6, 0.4, 0xf4f0e8, 4.85, 0.3, 1.5);
    addCylinder(bathroom, 0.24, 0.24, 0.08, 0xffffff, 4.85, 0.63, 1.5);
    // shower corner (glass panel, translucent)
    addBox(bathroom, 0.03, 1.3, 0.9, 0x8fd3e8, 5.9, 0.65, 3.3, { transparent: true, opacity: 0.28, castShadow: false, edges: false });
    addBox(bathroom, 0.9, 0.02, 0.9, 0xc7dede, 5.55, 0.02, 3.3, { receiveShadow: true, castShadow: false, edges: false });
    state.zoneAnchors.bathroom = new THREE.Vector3(5.3, 1.6, 2.5);
  }

  function fitCamera() {
    const rect = els.canvasWrap.getBoundingClientRect();
    const aspect = rect.width / rect.height || 1.6;
    const baseView = 3.6;
    const viewSize = aspect >= 1 ? baseView : baseView / aspect;
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }

  function updateLabelPositions() {
    const rect = els.canvasWrap.getBoundingClientRect();
    ZONE_IDS.forEach((id) => {
      const el = state.zoneLabels[id];
      const anchor = state.zoneAnchors[id];
      if (!el || !anchor) return;
      const v = anchor.clone().project(camera);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (1 - (v.y * 0.5 + 0.5)) * rect.height;
      el.style.left = x + "px";
      el.style.top = y + "px";
    });
  }

  let firstFrameRendered = false;

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateLabelPositions();
    renderer.render(scene, camera);
    if (!firstFrameRendered) {
      firstFrameRendered = true;
      els.roomLoading.classList.add("hidden");
    }
  }

  function initThree() {
    scene = new THREE.Scene();

    const center = new THREE.Vector3(3, 0, 2);
    camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(center.x + 6.2, 6.4, center.z + 6.4);
    camera.lookAt(center);

    renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minZoom = 0.6;
    controls.maxZoom = 2.2;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = 1.15;
    controls.update();

    buildLights();
    buildRoom();
    createZoneLabels();

    fitCamera();
    if (window.ResizeObserver) {
      new ResizeObserver(fitCamera).observe(els.canvasWrap);
    } else {
      window.addEventListener("resize", fitCamera);
    }

    animate();
  }

  // ---------- boot ----------

  function init() {
    fetch("data/checklist.json")
      .then((res) => res.json())
      .then((data) => {
        state.categories = data.categories;
        wirePanelControls();
        renderOtherCategories();
        refreshSummary();
        initThree();
      })
      .catch((err) => {
        els.roomLoading.textContent = "Couldn't load your room: " + err.message;
      });
  }

  init();
})();
