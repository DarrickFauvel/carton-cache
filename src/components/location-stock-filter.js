/**
 * <location-stock-filter
 *   location="from_location_id"
 *   condition="condition"
 *   target="carton_type_id"
 *   quantity="quantity">
 * </location-stock-filter>
 *
 * Limits the [target] <select> to options in stock at the location chosen in
 * the [location] <select>, in the condition chosen in the [condition] <select>.
 * Each target option lists its stock as a space-separated `data-stock`
 * attribute of "location_id:condition:quantity" entries (rendered by the
 * server); the placeholder option (value "") is always kept. Until a location
 * is chosen, the target is disabled.
 *
 * If [quantity] names a number input, its `max` is capped at the stock of the
 * selected option, and an element with id "<quantity>_available" (if present)
 * shows how many are available.
 */

class LocationStockFilter extends HTMLElement {
  /** @type {HTMLSelectElement | null} */
  #location = null;
  /** @type {HTMLSelectElement | null} */
  #condition = null;
  /** @type {HTMLSelectElement | null} */
  #target = null;
  /** @type {HTMLInputElement | null} */
  #quantity = null;
  /** @type {HTMLElement | null} */
  #available = null;
  /** @type {HTMLOptionElement | null} */
  #placeholder = null;

  connectedCallback() {
    /** @param {string} attr */
    const byAttr = (attr) => document.getElementById(this.getAttribute(attr) ?? "");
    this.#location = /** @type {HTMLSelectElement | null} */ (byAttr("location"));
    this.#condition = /** @type {HTMLSelectElement | null} */ (byAttr("condition"));
    this.#target = /** @type {HTMLSelectElement | null} */ (byAttr("target"));
    this.#quantity = /** @type {HTMLInputElement | null} */ (byAttr("quantity"));
    this.#available = this.#quantity ? document.getElementById(`${this.#quantity.id}_available`) : null;
    if (!this.#location || !this.#target) return;

    this.#placeholder = [...this.#target.options].find((o) => o.value === "") ?? null;
    const filter = () => this.#filter();
    this.#location.addEventListener("change", filter);
    this.#condition?.addEventListener("change", filter);
    this.#target.addEventListener("change", () => this.#updateQuantity());
    filter();
  }

  /**
   * Quantity of `opt` in stock at the chosen location and condition.
   * @param {HTMLOptionElement} opt
   * @returns {number}
   */
  #stockOf(opt) {
    const locationId = this.#location?.value ?? "";
    const condition = this.#condition?.value ?? "";
    if (!locationId) return 0;
    for (const entry of (opt.dataset.stock ?? "").split(" ")) {
      const [loc, cond, qty] = entry.split(":");
      if (loc === locationId && (!this.#condition || cond === condition)) return Number(qty) || 0;
    }
    return 0;
  }

  #filter() {
    const target = /** @type {HTMLSelectElement} */ (this.#target);
    let available = 0;
    for (const opt of target.options) {
      if (opt === this.#placeholder) continue;
      const inStock = this.#stockOf(opt) > 0;
      // `hidden` alone doesn't hide <option> in Safari; `disabled` also keeps it unselectable.
      opt.hidden = !inStock;
      opt.disabled = !inStock;
      if (inStock) available++;
      else if (opt.selected) opt.selected = false;
    }

    const hasLocation = !!this.#location?.value;
    target.disabled = !hasLocation || available === 0;
    if (this.#placeholder) {
      this.#placeholder.textContent = !hasLocation
        ? "Select a from location first…"
        : available === 0
          ? "No cartons in stock in this condition here"
          : "Select carton…";
      if (target.value === "") this.#placeholder.selected = true;
    }
    this.#updateQuantity();
  }

  #updateQuantity() {
    if (!this.#quantity) return;
    const selected = this.#target?.selectedOptions[0];
    const stock = selected && selected !== this.#placeholder ? this.#stockOf(selected) : 0;
    if (stock > 0) {
      this.#quantity.max = String(stock);
    } else {
      this.#quantity.removeAttribute("max");
    }
    if (this.#available) {
      this.#available.textContent = `${stock} available`;
      this.#available.hidden = stock === 0;
    }
  }
}

customElements.define("location-stock-filter", LocationStockFilter);
