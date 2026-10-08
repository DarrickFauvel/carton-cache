/**
 * <label-preview source="source_code" unit="in"></label-preview>
 *
 * Shows the label code the carton form will produce, updated as the user
 * types. Reads the [source] input plus the form's printed_length/width/height
 * inputs (falling back to length/width/height when the printed size isn't
 * fully filled in), all in [unit], mirroring buildLabelCode() on the server.
 * Hidden while the source code is blank.
 */

import { formatLabelCode } from "../lib/labels.js";
import { parseUnit, toCm } from "../lib/units.js";

class LabelPreview extends HTMLElement {
  /** @type {HTMLInputElement | null} */
  #source = null;
  /** @type {HTMLFormElement | null} */
  #form = null;

  connectedCallback() {
    this.#source = /** @type {HTMLInputElement | null} */ (document.getElementById(this.getAttribute("source") ?? ""));
    this.#form = this.#source?.form ?? null;
    if (!this.#form) return;
    this.#form.addEventListener("input", () => this.#update());
    // "reset" fires before the fields clear (e.g. <quick-create> reopening).
    this.#form.addEventListener("reset", () => setTimeout(() => this.#update()));
    this.#update();
  }

  /**
   * @param {string} prefix "printed_" or ""
   * @returns {(number | null)[]}
   */
  #dims(prefix) {
    const unit = parseUnit(this.getAttribute("unit"));
    return ["length", "width", "height"].map((dim) => {
      const input = /** @type {HTMLInputElement | null} */ (this.#form?.elements.namedItem(prefix + dim));
      const value = parseFloat(input?.value ?? "");
      return Number.isFinite(value) ? toCm(value, unit) : null;
    });
  }

  #update() {
    const source = this.#source?.value.trim() ?? "";
    this.hidden = !source;
    if (!source) return;

    const printed = this.#dims("printed_");
    const dims = printed.every((d) => d != null) ? printed : this.#dims("");
    const code = formatLabelCode(source, dims);
    this.textContent = code
      ? `Label: ${code}`
      : `Label: …-${source.toLowerCase()} (enter the printed or inside dimensions to finish the label)`;
  }
}

customElements.define("label-preview", LabelPreview);
