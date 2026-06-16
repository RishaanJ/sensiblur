// SensiBlur — content script
// Walks text nodes in Gmail, wraps sensitive matches in pixelated censor spans.
// Click a span to reveal/re-blur. Floating pill toggles everything.

(() => {
  const PROCESSED = "data-sb-done";


  const PATTERNS = {
    // IDs: "ID: ABC-12345", "Member ID 99887", "user id: x9k2"
    idKeyword:    () => /\b(?:[A-Za-z]+[\s\-_])?ID\b\s*[:#\-]?\s*[A-Za-z0-9][A-Za-z0-9\-_.]{2,}/gi,
    // Hash numbers: "#12345", "Order # 88-291"
    hashNumber:   () => /#\s?[A-Za-z0-9][A-Za-z0-9\-]{2,}/g,
    // 6+ consecutive digits: account numbers, tracking, OTP codes
    longDigits:   () => /\b\d(?:[\d\- ]{4,}\d)\b/g,
    // Currency amounts: $1,234.56  €500  £12.99  ₹2,000
    money:        () => /[$€£₹¥]\s?\d[\d,]*(?:\.\d{1,2})?/g,
    // SSN: 123-45-6789
    ssn:          () => /\b\d{3}-\d{2}-\d{4}\b/g,
    // US phone: (555) 123-4567, +1 555-123-4567
    phone:        () => /\b(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}\b/g,
    // Email addresses
    email:        () => /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    // Credit card shaped: 4 groups of 4 digits
    creditCard:   () => /\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b/g,
    // Date of birth labels + value: "DOB: 01/15/1990", "Date of Birth: Jan 5, 1998"
    dob:          () => /\b(?:DOB|Date\s+of\s+Birth|Born|Birthday)\s*[:#\-]?\s*[\w\d][\w\d,\/\-.\s]{4,16}/gi,
    // Street addresses: "123 Main St", "4502 Elm Blvd Apt 3B"
    address:      () => /\b\d{1,6}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:St|Ave|Blvd|Dr|Ln|Rd|Ct|Way|Pl|Pkwy|Cir|Ter|Loop)\.?\b(?:\s*(?:Apt|Suite|Ste|Unit|#)\s*\S+)?/g,
    // IP addresses: 192.168.1.1
    ipAddress:    () => /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    // Passport: 1-2 letters + 6-9 digits, preceded by "passport"
    passport:     () => /\b(?:Passport)\s*[:#\-]?\s*[A-Z]{0,2}\d{6,9}\b/gi,
    // API keys / tokens: long alphanumeric strings 20+ chars (sk_live_..., ghp_..., etc.)
    apiKey:       () => /\b(?:sk_live_|sk_test_|pk_live_|pk_test_|ghp_|gho_|xox[bpas]\-|AKIA)[A-Za-z0-9\-_]{16,}\b/g,
    // Routing / account labels: "Account: ...", "Routing: ..."
    bankLabels:   () => /\b(?:Account|Routing|Acct)\s*[:#\-]?\s*\d[\d\-\s]{4,}\d\b/gi,
    // Confirmation / reference / tracking codes: "Confirmation: ABC123XYZ"
    confirmCodes: () => /\b(?:Confirm(?:ation)?|Ref(?:erence)?|Tracking|Booking|Reservation)\s*[:#\-]?\s*[A-Z0-9][A-Z0-9\-]{4,}/gi,
    // Usernames: "username: foo", "login: bar"
    username:     () => /\b(?:User(?:name)?|Login|Handle)\s*[:#\-]\s*\S{2,}/gi,
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    blurStyle: "pixel",   // "pixel" | "blur" | "solid"
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
    customRules: [],   // [{ id, label, value, type:"keyword"|"regex", enabled }]
  };

  let settings = structuredClone(DEFAULT_SETTINGS);
  let activeRegexes = [];
  let revealedAll = false;
  let scanQueued = false;

  // ---- Pixelated censor pattern ----------------------------------------
  const PIXEL = 7;
  const TILE_COLS = 12;
  const TILE_ROWS = 3;
  const PALETTE = [
    "#e9f4ee", "#e9f4ee", "#e9f4ee",
    "#dfeee6", "#d3e2da",
    "#b9c6c0",
    "#7d8a84", "#6b756f",
  ];
  const pixelTiles = (() => {
    const tiles = [];
    for (let t = 0; t < 6; t++) {
      const c = document.createElement("canvas");
      c.width = TILE_COLS * PIXEL;
      c.height = TILE_ROWS * PIXEL;
      const ctx = c.getContext("2d");
      for (let y = 0; y < TILE_ROWS; y++) {
        for (let x = 0; x < TILE_COLS; x++) {
          ctx.fillStyle = PALETTE[(Math.random() * PALETTE.length) | 0];
          ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
      }
      tiles.push(`url("${c.toDataURL("image/png")}")`);
    }
    return tiles;
  })();

  function applyPixelStyle(span) {
    span.style.backgroundImage = pixelTiles[(Math.random() * pixelTiles.length) | 0];
  }

  // ---- Compile all active regexes (built-in + custom) -------------------
  function compileRegexes() {
    activeRegexes = [];
    // Built-ins
    for (const [key, build] of Object.entries(PATTERNS)) {
      if (settings.patterns[key]) activeRegexes.push(build());
    }
    // Custom rules
    for (const rule of (settings.customRules || [])) {
      if (!rule.enabled || !rule.value) continue;
      try {
        if (rule.type === "regex") {
          activeRegexes.push(new RegExp(rule.value, "gi"));
        } else {
          // Keyword: escape special chars, match as whole-ish token
          const escaped = rule.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          activeRegexes.push(new RegExp(escaped, "gi"));
        }
      } catch (_) { /* skip invalid regex */ }
    }
  }

  // ---- Where to look ---------------------------------------------------
  const CONTAINER_SELECTOR = ".a3s, .y6, .y2, .bog, .bqe";

  function isSkippable(node) {
    const el = node.parentElement;
    if (!el) return true;
    if (el.closest(`[${PROCESSED}-wrap], script, style, textarea, input, [contenteditable='true']`)) return true;
    if (el.classList.contains("sb-blur")) return true;
    return false;
  }

  // ---- Core: find matches in a text node, split & wrap ------------------
  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.trim().length < 2) return;

    const ranges = [];
    for (const re of activeRegexes) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const start = m.index, end = m.index + m[0].length;
        if (!ranges.some((r) => start < r.end && end > r.start)) {
          ranges.push({ start, end });
        }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    if (!ranges.length) return;
    ranges.sort((a, b) => a.start - b.start);

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const { start, end } of ranges) {
      if (start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      const span = document.createElement("span");
      span.className = "sb-blur sb-style-" + settings.blurStyle;
      if (revealedAll) span.classList.add("sb-revealed");
      span.textContent = text.slice(start, end);
      if (settings.blurStyle === "pixel") applyPixelStyle(span);
      span.title = "Click to reveal";
      span.setAttribute(`${PROCESSED}-wrap`, "1");
      frag.appendChild(span);
      cursor = end;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function scan(root = document.body) {
    if (!settings.enabled || !activeRegexes.length) return;
    const containers = root.matches?.(CONTAINER_SELECTOR)
      ? [root]
      : root.querySelectorAll?.(CONTAINER_SELECTOR) ?? [];
    for (const container of containers) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (isSkippable(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(processTextNode);
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scan(); });
  }

  // ---- Reveal interactions -----------------------------------------------
  document.addEventListener("click", (e) => {
    const span = e.target.closest?.(".sb-blur");
    if (span) {
      e.preventDefault();
      e.stopPropagation();
      span.classList.toggle("sb-revealed");
    }
  }, true);

  function setAll(revealed) {
    revealedAll = revealed;
    document.querySelectorAll(".sb-blur").forEach((s) => s.classList.toggle("sb-revealed", revealed));
    pill.textContent = revealed ? "Blur all" : "Reveal all";
    pill.classList.toggle("sb-pill-revealed", revealed);
  }

  function unwrapAll() {
    document.querySelectorAll(".sb-blur").forEach((s) => {
      s.replaceWith(document.createTextNode(s.textContent));
    });
    document.body.normalize();
  }

  // ---- Floating pill ---------------------------------------------------
  const pill = document.createElement("button");
  pill.id = "sb-pill";
  pill.textContent = "Reveal all";
  pill.addEventListener("click", () => setAll(!revealedAll));

  function syncPillVisibility() {
    pill.style.display = settings.enabled ? "" : "none";
  }

  // ---- Settings + boot --------------------------------------------------
  function applySettings(next) {
    const p = { ...DEFAULT_SETTINGS.patterns, ...(next?.patterns ?? {}) };
    settings = { ...DEFAULT_SETTINGS, ...next, patterns: p, customRules: next?.customRules ?? [] };
    compileRegexes();
    syncPillVisibility();
    if (!settings.enabled) { unwrapAll(); } else { unwrapAll(); queueScan(); }
  }

  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    applySettings(stored);
    document.body.appendChild(pill);
    syncPillVisibility();
    scan();
    const observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;
      for (const mut of mutations) {
        if (mut.addedNodes.length) { queueScan(); break; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    chrome.storage.sync.get(DEFAULT_SETTINGS, applySettings);
  });
})();
