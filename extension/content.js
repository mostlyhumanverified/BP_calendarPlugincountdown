// Meeting Countdown Link for Google Calendar — content script.
//
// Google Calendar's DOM is unofficial, minified, and changes over time, so
// this script is deliberately defensive:
//   - It tries several selector strategies to find the description field
//     and the event title field, and pierces open shadow roots.
//   - It never *requires* auto-detection to succeed. The end time is always
//     confirmed by the user in a small popup before anything is inserted,
//     and if we can't find a description field at all, the generated link
//     is copied to the clipboard instead of silently failing.

(() => {
  const MARK_BTN = "data-countdown-btn-injected";
  const MARK_FALLBACK = "data-countdown-fallback-injected";
  const PANEL_ID = "gcal-countdown-panel";
  const TOAST_ID = "gcal-countdown-toast";
  const Z = 2147483647;

  // ---------- DOM helpers (shadow-DOM aware) ----------

  function queryAllDeep(selector, root = document) {
    const found = new Set();
    const seenRoots = new Set();

    const walk = (node) => {
      if (!node || seenRoots.has(node)) return;
      seenRoots.add(node);
      if (!node.querySelectorAll) return;
      node.querySelectorAll(selector).forEach((el) => found.add(el));
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    };
    walk(root);
    return Array.from(found);
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  // ---------- Field detection ----------

  function findDescriptionFields() {
    const selectors = [
      'div[aria-label="Description"][contenteditable="true"]',
      'div[role="textbox"][aria-label*="description" i]',
      'div[aria-label*="description" i][contenteditable="true"]',
      'textarea[aria-label*="description" i]',
      'input[aria-label*="description" i]',
    ];
    const els = new Set();
    selectors.forEach((sel) => queryAllDeep(sel).forEach((el) => els.add(el)));
    return Array.from(els)
      .filter(isVisible)
      .map((el) => ({
        el,
        kind: el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? "plain" : "richtext",
      }));
  }

  function findTitleField() {
    const selectors = [
      'input[aria-label="Add title"]',
      'input[aria-label="Add title and time"]',
      'input[aria-label*="title" i]',
      'textarea[aria-label*="title" i]',
    ];
    for (const sel of selectors) {
      const match = queryAllDeep(sel).find(isVisible);
      if (match) return match;
    }
    return null;
  }

  function isEditingAnEvent() {
    if (/\/r\/eventedit/i.test(location.pathname) || /eventedit/i.test(location.href)) {
      return true;
    }
    return Boolean(findTitleField()) || findDescriptionFields().length > 0;
  }

  // ---------- Best-effort end-time guess (never blocks, never trusted blindly) ----------

  function roundUpToQuarterHour(date) {
    const ms = 15 * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }

  function defaultGuess() {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    return roundUpToQuarterHour(inOneHour);
  }

  function guessEndDateTime() {
    try {
      const candidates = queryAllDeep('[aria-label*="end time" i], [aria-label*="end date" i]');
      for (const el of candidates) {
        const label = el.getAttribute("aria-label") || el.innerText || "";
        const match = label.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (!match) continue;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridiem = (match[3] || "").toLowerCase();
        if (meridiem === "pm" && hours < 12) hours += 12;
        if (meridiem === "am" && hours === 12) hours = 0;
        const guess = new Date();
        guess.setHours(hours, minutes, 0, 0);
        // Only trust it if it lands in a sane near-future window; otherwise
        // it's more likely a misparse than a real end time.
        const diffMs = guess.getTime() - Date.now();
        if (diffMs > -5 * 60 * 1000 && diffMs < 24 * 60 * 60 * 1000) {
          return guess;
        }
      }
    } catch (err) {
      // Swallow — heuristic failures always fall back to defaultGuess().
    }
    return defaultGuess();
  }

  function toDatetimeLocalValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  // ---------- Insertion ----------

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertIntoRichText(el, url, linkText) {
    el.focus();
    const doc = el.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(true); // start of field

    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = linkText;

    const br = doc.createElement("br");

    range.insertNode(br);
    range.insertNode(anchor);

    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertIntoPlainField(el, url, linkText) {
    const line = `${linkText}: ${url}`;
    const existing = el.value || "";
    const next = existing ? `${line}\n${existing}` : line;
    setNativeValue(el, next);
  }

  async function insertLink({ field, url, linkText }) {
    if (!field) {
      await copyToClipboard(url);
      showToast("Couldn't find the description field — link copied to clipboard instead.");
      return;
    }
    try {
      if (field.kind === "richtext") {
        insertIntoRichText(field.el, url, linkText);
      } else {
        insertIntoPlainField(field.el, url, linkText);
      }
      showToast("⏳ Countdown link added to the description.");
    } catch (err) {
      await copyToClipboard(url);
      showToast("Couldn't insert automatically — link copied to clipboard instead.");
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Clipboard API can be blocked in some contexts; nothing more we can do.
    }
  }

  // ---------- UI: toast ----------

  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("gcal-countdown-toast--visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("gcal-countdown-toast--visible");
    }, 3500);
  }

  // ---------- UI: popup panel ----------

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    document.removeEventListener("mousedown", onOutsideClick, true);
  }

  function onOutsideClick(evt) {
    const panel = document.getElementById(PANEL_ID);
    if (panel && !panel.contains(evt.target)) closePanel();
  }

  async function openPanel(anchorEl, field) {
    closePanel();

    const baseUrl = await getCountdownBaseUrl();
    const guessed = guessEndDateTime();
    const titleEl = findTitleField();
    const eventTitle = (titleEl && titleEl.value && titleEl.value.trim()) || "Meeting";

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "gcal-countdown-panel";
    panel.innerHTML = `
      <div class="gcal-countdown-panel__title">⏳ Add countdown link</div>
      <label class="gcal-countdown-panel__label">
        Meeting ends at
        <input type="datetime-local" class="gcal-countdown-panel__input" data-role="end" />
      </label>
      <label class="gcal-countdown-panel__label">
        Link text
        <input type="text" class="gcal-countdown-panel__input" data-role="label" />
      </label>
      <p class="gcal-countdown-panel__hint">Double-check the end time — it's a best-effort guess.</p>
      <div class="gcal-countdown-panel__row">
        <button type="button" data-role="cancel" class="gcal-countdown-panel__btn gcal-countdown-panel__btn--ghost">Cancel</button>
        <button type="button" data-role="insert" class="gcal-countdown-panel__btn gcal-countdown-panel__btn--primary">Insert link</button>
      </div>
    `;
    document.body.appendChild(panel);

    const endInput = panel.querySelector('[data-role="end"]');
    const labelInput = panel.querySelector('[data-role="label"]');
    endInput.value = toDatetimeLocalValue(guessed);
    labelInput.value = "⏳ Countdown to end of meeting";

    // Position near the button that opened it, clamped to the viewport.
    const rect = anchorEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;
    if (left + panelRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelRect.width - 8);
    }
    if (top + panelRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - panelRect.height - 8);
    }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    panel.querySelector('[data-role="cancel"]').addEventListener("click", closePanel);
    panel.querySelector('[data-role="insert"]').addEventListener("click", async () => {
      const endValue = endInput.value;
      if (!endValue) {
        endInput.focus();
        return;
      }
      const endDate = new Date(endValue);
      if (Number.isNaN(endDate.getTime())) {
        endInput.focus();
        return;
      }
      const url = new URL(baseUrl);
      url.searchParams.set("to", endDate.toISOString());
      url.searchParams.set("title", eventTitle);

      await insertLink({
        field,
        url: url.toString(),
        linkText: labelInput.value.trim() || "⏳ Countdown to end of meeting",
      });
      closePanel();
    });

    setTimeout(() => document.addEventListener("mousedown", onOutsideClick, true), 0);
  }

  // ---------- Buttons ----------

  function createButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gcal-countdown-btn";
    btn.textContent = label;
    return btn;
  }

  function injectButtonForField(field) {
    const { el } = field;
    if (el.getAttribute(MARK_BTN)) return;
    el.setAttribute(MARK_BTN, "1");

    const btn = createButton("⏳ Add countdown link");
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openPanel(btn, field);
    });

    const host = el.parentElement || el;
    host.insertAdjacentElement("afterend", btn);
  }

  function ensureFallbackButton() {
    const editing = isEditingAnEvent();
    let btn = document.getElementById("gcal-countdown-fallback-btn");

    if (!editing) {
      if (btn) btn.remove();
      return;
    }
    if (btn) return;

    btn = createButton("⏳ Countdown link");
    btn.id = "gcal-countdown-fallback-btn";
    btn.classList.add("gcal-countdown-btn--fallback");
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const fields = findDescriptionFields();
      openPanel(btn, fields[0] || null);
    });
    document.body.appendChild(btn);
  }

  // ---------- Scan loop ----------

  function scan() {
    findDescriptionFields().forEach(injectButtonForField);
    ensureFallbackButton();
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedScan = debounce(scan, 350);

  const observer = new MutationObserver(debouncedScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();
})();
