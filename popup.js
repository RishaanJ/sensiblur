const DEFAULTS = {
  enabled: true,
  patterns: {
    idKeyword: true,
    hashNumber: true,
    longDigits: true,
    money: true,
    ssn: true,
    phone: true,
    email: true,
    creditCard: true,
    dob: true,
    address: false,
    ipAddress: false,
    passport: true,
    apiKey: true,
    bankLabels: true,
    confirmCodes: true,
    username: false,
  },
  customRules: [],
};

const enabledEl      = document.getElementById("enabled");
const patternEls     = [...document.querySelectorAll("[data-pattern]")];
const customRowsEl   = document.getElementById("customRows");
const customCountEl  = document.getElementById("customCount");
const customEmptyEl  = document.getElementById("customEmpty");
const addInput       = document.getElementById("addInput");
const addBtn         = document.getElementById("addBtn");
const typeToggle     = document.getElementById("typeToggle");
const addHint        = document.getElementById("addHint");

let currentType = "keyword";   // "keyword" | "regex"
let customRules = [];

// ---- Load & render --------------------------------------------------------
chrome.storage.sync.get(DEFAULTS, (s) => {
  enabledEl.checked = s.enabled;
  patternEls.forEach((el) => { el.checked = !!s.patterns[el.dataset.pattern]; });
  customRules = s.customRules || [];
  renderCustom();
});

// ---- Save helper -----------------------------------------------------------
function save() {
  const patterns = {};
  patternEls.forEach((el) => (patterns[el.dataset.pattern] = el.checked));
  chrome.storage.sync.set({ enabled: enabledEl.checked, patterns, customRules });
}

enabledEl.addEventListener("change", save);
patternEls.forEach((el) => el.addEventListener("change", save));

// ---- Type toggle -----------------------------------------------------------
typeToggle.addEventListener("click", () => {
  currentType = currentType === "keyword" ? "regex" : "keyword";
  typeToggle.textContent = currentType === "keyword" ? "kw" : "re";
  typeToggle.classList.toggle("active", currentType === "regex");
  addHint.textContent = currentType === "keyword"
    ? "type a word, name, or phrase to blur"
    : "enter a regex pattern (flags added auto)";
});

// ---- Add custom rule -------------------------------------------------------
function addRule() {
  const raw = addInput.value.trim();
  if (!raw) return;

  // Auto-detect /regex/ syntax even if user is in keyword mode
  let type = currentType;
  let value = raw;
  const reMatch = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  if (reMatch) {
    type = "regex";
    value = reMatch[1];
  }

  // Validate regex
  if (type === "regex") {
    try { new RegExp(value); } catch (e) {
      addHint.textContent = "⚠ invalid regex";
      addHint.style.color = "#d95757";
      setTimeout(() => { addHint.textContent = "enter a regex pattern (flags added auto)"; addHint.style.color = ""; }, 2000);
      return;
    }
  }

  // Avoid dupes
  if (customRules.some((r) => r.value === value && r.type === type)) {
    addHint.textContent = "⚠ already exists";
    addHint.style.color = "#e0b35a";
    setTimeout(() => { addHint.textContent = currentType === "keyword" ? "type a word, name, or phrase to blur" : "enter a regex pattern (flags added auto)"; addHint.style.color = ""; }, 2000);
    return;
  }

  customRules.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label: value.length > 28 ? value.slice(0, 26) + "…" : value,
    value,
    type,
    enabled: true,
  });

  addInput.value = "";
  save();
  renderCustom();
}

addBtn.addEventListener("click", addRule);
addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addRule(); });

// ---- Render custom list ---------------------------------------------------
function renderCustom() {
  customRowsEl.innerHTML = "";
  customCountEl.textContent = customRules.length;
  customEmptyEl.style.display = customRules.length ? "none" : "";

  for (const rule of customRules) {
    const row = document.createElement("div");
    row.className = "custom-entry";

    const info = document.createElement("span");
    info.className = "info";

    const val = document.createElement("span");
    val.className = "value";
    val.textContent = rule.value;
    info.appendChild(val);

    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = rule.type === "regex" ? "regex" : "keyword";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = rule.enabled;
    toggle.addEventListener("change", () => { rule.enabled = toggle.checked; save(); });

    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "×";
    del.title = "Remove rule";
    del.addEventListener("click", () => {
      customRules = customRules.filter((r) => r.id !== rule.id);
      save();
      renderCustom();
    });

    row.appendChild(info);
    row.appendChild(badge);
    row.appendChild(toggle);
    row.appendChild(del);
    customRowsEl.appendChild(row);
  }
}
