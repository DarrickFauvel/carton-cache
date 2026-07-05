/**
 * <carton-scanner
 *   lookup="/cartons/lookup"
 *   target="carton_type_id"
 *   quantity-target="quantity"
 *   notes-target="notes"
 *   create="quick-create[target='carton_type_id']">
 *   <barcode-scanner>
 *     <button type="button" class="btn">Scan</button>
 *   </barcode-scanner>
 * </carton-scanner>
 *
 * On barcode-detected:
 *   1. Parse GS1-128 Application Identifiers (GTIN, quantity, lot, expiry).
 *   2. Lookup the carton type by GTIN (or raw barcode as fallback).
 *   3a. Found   → select it; pre-fill [quantity-target] and [notes-target].
 *   3b. Not found → open the <quick-create> modal with barcode pre-filled.
 */

import { parseGS1 } from "./gs1.js";

/**
 * @typedef {HTMLElement & { open(prefill?: Record<string, string>): void }} QuickCreateElement
 */

class CartonScanner extends HTMLElement {
  /** @type {HTMLParagraphElement | null} */
  #statusEl = null;

  connectedCallback() {
    const inputRow = this.closest(".input-row") ?? this;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.hidden = true;
    inputRow.insertAdjacentElement("afterend", status);
    this.#statusEl = status;

    this.addEventListener("barcode-detected", (e) => {
      const barcode = /** @type {CustomEvent<{ value: string }>} */ (e).detail.value;
      void this.#handleBarcode(barcode);
    });
  }

  disconnectedCallback() {
    this.#statusEl?.remove();
  }

  /** @param {string} barcode */
  async #handleBarcode(barcode) {
    const parsed        = parseGS1(barcode);
    const lookupValue   = parsed.gtin ?? barcode;
    const lookupUrl     = this.getAttribute("lookup")          ?? "/cartons/lookup";
    const targetId      = this.getAttribute("target")          ?? "";
    const qtyTargetId   = this.getAttribute("quantity-target") ?? "";
    const notesTargetId = this.getAttribute("notes-target")    ?? "";
    const createSel     = this.getAttribute("create");

    this.#setStatus("", false);

    try {
      const res = await fetch(`${lookupUrl}?barcode=${encodeURIComponent(lookupValue)}`);

      if (res.ok) {
        const carton = /** @type {{ id: string; name: string; sku?: string | null }} */ (await res.json());
        this.#selectCarton(targetId, carton);
        this.#prefillQuantity(qtyTargetId, parsed.quantity);
        this.#prefillNotes(notesTargetId, parsed.lot, parsed.expiry);
      } else if (res.status === 404) {
        if (createSel) {
          const qc = /** @type {QuickCreateElement | null} */ (document.querySelector(createSel));
          /** @type {Record<string, string>} */
          const prefill = { barcode: lookupValue, _scanned: parsed.raw };
          if (lookupValue === parsed.raw) {
            prefill._barcode_hint = "Decoded from scan";
          }
          qc?.open?.(prefill);
        } else {
          this.#setStatus("No carton found with that barcode.", true);
        }
      } else {
        this.#setStatus("Lookup failed. Please try again.", true);
      }
    } catch {
      this.#setStatus("Network error. Please try again.", true);
    }
  }

  /**
   * @param {string} targetId
   * @param {{ id: string; name: string; sku?: string | null }} carton
   */
  #selectCarton(targetId, carton) {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(targetId));
    if (!select) return;

    let opt = [...select.options].find((o) => o.value === carton.id) ?? null;
    if (!opt) {
      opt = document.createElement("option");
      opt.value = carton.id;
      opt.textContent = carton.sku ? `${carton.name} — ${carton.sku}` : carton.name;
      select.appendChild(opt);
    }

    for (const o of select.options) o.selected = false;
    opt.selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * @param {string} targetId
   * @param {number | undefined} quantity
   */
  #prefillQuantity(targetId, quantity) {
    if (!quantity || !targetId) return;
    const field = /** @type {HTMLInputElement | null} */ (document.getElementById(targetId));
    if (field) {
      field.value = String(quantity);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /**
   * @param {string} targetId
   * @param {string | undefined} lot
   * @param {string | undefined} expiry
   */
  #prefillNotes(targetId, lot, expiry) {
    if (!targetId) return;
    /** @type {string[]} */
    const parts = [];
    if (lot)    parts.push(`Lot: ${lot}`);
    if (expiry) parts.push(`Expiry: ${expiry}`);
    if (!parts.length) return;
    const field = /** @type {HTMLTextAreaElement | null} */ (document.getElementById(targetId));
    // Only pre-fill if the field is currently empty
    if (field && !field.value.trim()) {
      field.value = parts.join(" · ");
    }
  }

  /**
   * @param {string} message
   * @param {boolean} isError
   */
  #setStatus(message, isError) {
    if (!this.#statusEl) return;
    if (!message) {
      this.#statusEl.hidden = true;
      this.#statusEl.textContent = "";
      return;
    }
    this.#statusEl.className = isError ? "alert alert--error" : "alert alert--warning";
    this.#statusEl.textContent = message;
    this.#statusEl.hidden = false;
  }
}

customElements.define("carton-scanner", CartonScanner);
