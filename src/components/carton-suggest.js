/**
 * <carton-suggest
 *   endpoint="/cartons/suggest"
 *   target="carton_type_id"
 *   location-target="location_id">
 * </carton-suggest>
 *
 * Renders its own L/W/H + unit + dunnage inputs (the host page has no such
 * fields), calls [endpoint] on "Find carton", and shows results:
 *   - on-site matches are clickable buttons that select the matching
 *     <option> in the [target] select (same fill+dispatch pattern as
 *     carton-scanner.js);
 *   - retail-catalog matches (only returned when nothing is in stock) are
 *     informational rows, not clickable — there's no carton_type_id to fill.
 */

import { inToCm } from "../lib/units.js";

/**
 * @typedef {import("../types.js").CartonSuggestion} CartonSuggestion
 * @typedef {import("../types.js").RetailCartonSuggestion} RetailCartonSuggestion
 * @typedef {import("../types.js").SuggestCartonResult} SuggestCartonResult
 */

const DEFAULT_DUNNAGE_CM = 2.5;

class CartonSuggest extends HTMLElement {
  /** @type {HTMLDivElement | null} */
  #resultsEl = null;
  /** @type {HTMLParagraphElement | null} */
  #statusEl = null;
  /** @type {HTMLSelectElement | null} */
  #unitEl = null;
  /** @type {HTMLInputElement | null} */
  #dunnageEl = null;

  connectedCallback() {
    const defaultDunnage = parseFloat(this.getAttribute("default-dunnage") ?? "") || DEFAULT_DUNNAGE_CM;

    this.innerHTML = `
      <div class="stack">
        <div class="input-row">
          <div class="form-group">
            <label>Length</label>
            <input type="number" step="any" min="0" data-field="length" inputmode="decimal" />
          </div>
          <div class="form-group">
            <label>Width</label>
            <input type="number" step="any" min="0" data-field="width" inputmode="decimal" />
          </div>
          <div class="form-group">
            <label>Height</label>
            <input type="number" step="any" min="0" data-field="height" inputmode="decimal" />
          </div>
          <div class="form-group">
            <label>Unit</label>
            <select data-field="unit">
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Packing padding (dunnage) per side</label>
          <input type="number" step="any" min="0" data-field="dunnage" inputmode="decimal" value="${defaultDunnage}" />
        </div>
        <button type="button" class="btn">Find carton</button>
        <p role="status" hidden></p>
        <div data-results></div>
      </div>
    `;

    this.#resultsEl = /** @type {HTMLDivElement} */ (this.querySelector("[data-results]"));
    this.#statusEl = /** @type {HTMLParagraphElement} */ (this.querySelector("[role=status]"));
    this.#unitEl = /** @type {HTMLSelectElement} */ (this.querySelector('[data-field="unit"]'));
    this.#dunnageEl = /** @type {HTMLInputElement} */ (this.querySelector('[data-field="dunnage"]'));

    this.querySelector("button")?.addEventListener("click", () => void this.#findCarton());
  }

  async #findCarton() {
    this.#setStatus("", false);

    const lengthRaw = this.#fieldValue("length");
    const widthRaw = this.#fieldValue("width");
    const heightRaw = this.#fieldValue("height");
    const dunnageRaw = this.#dunnageEl?.value ?? "";
    const unit = this.#unitEl?.value === "in" ? "in" : "cm";

    const values = [lengthRaw, widthRaw, heightRaw, dunnageRaw].map((v) => parseFloat(v));
    if (values.slice(0, 3).some((n) => !Number.isFinite(n) || n <= 0)) {
      this.#setStatus("Enter positive length, width, and height.", true);
      return;
    }
    if (!Number.isFinite(values[3]) || values[3] < 0) {
      this.#setStatus("Dunnage must be a non-negative number.", true);
      return;
    }

    const [length, width, height, dunnage] = values;
    const toCm = unit === "in" ? inToCm : (/** @type {number} */ n) => n;

    const endpoint = this.getAttribute("endpoint") ?? "/cartons/suggest";
    const locationTargetId = this.getAttribute("location-target");
    const locationId = locationTargetId
      ? /** @type {HTMLSelectElement | null} */ (document.getElementById(locationTargetId))?.value
      : "";

    const params = new URLSearchParams({
      length_cm: String(toCm(length)),
      width_cm: String(toCm(width)),
      height_cm: String(toCm(height)),
      dunnage_cm: String(toCm(dunnage)),
    });
    if (locationId) params.set("location_id", locationId);

    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) {
        this.#setStatus("Could not find carton suggestions. Please try again.", true);
        return;
      }
      const result = /** @type {SuggestCartonResult} */ (await res.json());
      this.#renderResults(result);
    } catch {
      this.#setStatus("Network error. Please try again.", true);
    }
  }

  /** @param {"length" | "width" | "height"} field */
  #fieldValue(field) {
    return /** @type {HTMLInputElement | null} */ (this.querySelector(`[data-field="${field}"]`))?.value ?? "";
  }

  /** @param {SuggestCartonResult} result */
  #renderResults(result) {
    if (!this.#resultsEl) return;
    this.#resultsEl.innerHTML = "";

    if (result.onSite.length === 0 && result.retail.length === 0) {
      this.#setStatus("No suitable carton found.", false);
      return;
    }

    if (result.onSite.length > 0) {
      const list = document.createElement("ul");
      for (const carton of result.onSite) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-ghost";
        btn.textContent = `${carton.name}${carton.sku ? ` — ${carton.sku}` : ""} · ${this.#formatDims(carton)} · ${carton.quantity} in stock`;
        btn.addEventListener("click", () => this.#selectCarton(carton));
        li.appendChild(btn);
        list.appendChild(li);
      }
      this.#resultsEl.appendChild(list);
    }

    if (result.retail.length > 0) {
      const heading = document.createElement("p");
      heading.textContent = "Not in stock — available to buy:";
      this.#resultsEl.appendChild(heading);

      const list = document.createElement("ul");
      for (const option of result.retail) {
        const li = document.createElement("li");
        const parts = [
          `${option.name}${option.sku ? ` — ${option.sku}` : ""}`,
          this.#formatDims(option),
          `${option.store_name}${option.city ? ` (${option.city})` : ""}`,
        ];
        if (option.cost != null) parts.push(`$${option.cost.toFixed(2)}`);
        li.textContent = parts.join(" · ");
        list.appendChild(li);
      }
      this.#resultsEl.appendChild(list);
    }
  }

  /** @param {{ length_cm: number; width_cm: number; height_cm: number }} carton */
  #formatDims(carton) {
    return `${carton.length_cm.toFixed(1)}×${carton.width_cm.toFixed(1)}×${carton.height_cm.toFixed(1)} cm`;
  }

  /** @param {CartonSuggestion} carton */
  #selectCarton(carton) {
    const targetId = this.getAttribute("target") ?? "";
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

customElements.define("carton-suggest", CartonSuggest);
