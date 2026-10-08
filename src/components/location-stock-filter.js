/**
 * <location-stock-filter
 *   location="from_location_id"
 *   condition="condition"
 *   target="carton_type_id"
 *   quantity="quantity">
 * </location-stock-filter>
 *
 * Limits the [target] <select> to options in stock at the location chosen in
 * the [location] <select>, in the condition chosen in the optional [condition]
 * <select> (without one, stock in any condition counts).
 * Each target option lists its stock as a space-separated `data-stock`
 * attribute of "location_id:condition:quantity" entries (rendered by the
 * server); the placeholder option (value "") is always kept. Until a location
 * is chosen, the target is disabled. If something else (e.g. a barcode scan)
 * selects an option that isn't in stock there, the selection is cleared and
 * the placeholder says so.
 *
 * Alternatively, [condition-choice] names a condition <select> that is chosen
 * *after* the target: its options are limited to the conditions the selected
 * target has in stock at the location, switching to the first available one
 * if the current choice isn't. Use either [condition] or [condition-choice].
 *
 * If [quantity] names a number input, its `max` is capped at the stock of the
 * selected option (in the chosen condition, if there is a condition select),
 * and an element with id "<quantity>_available" (if present) shows how many
 * are available.
 */

class LocationStockFilter extends HTMLElement {
  /** @type {HTMLSelectElement | null} */
  #location = null;
  /** @type {HTMLSelectElement | null} */
  #condition = null;
  /** @type {HTMLSelectElement | null} */
  #conditionChoice = null;
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
    this.#conditionChoice = /** @type {HTMLSelectElement | null} */ (byAttr("condition-choice"));
    this.#target = /** @type {HTMLSelectElement | null} */ (byAttr("target"));
    this.#quantity = /** @type {HTMLInputElement | null} */ (byAttr("quantity"));
    this.#available = this.#quantity ? document.getElementById(`${this.#quantity.id}_available`) : null;
    if (!this.#location || !this.#target) return;

    this.#placeholder = [...this.#target.options].find((o) => o.value === "") ?? null;
    const filter = () => this.#filter();
    this.#location.addEventListener("change", filter);
    this.#condition?.addEventListener("change", filter);
    this.#conditionChoice?.addEventListener("change", () => this.#updateQuantity());
    this.#target.addEventListener("change", () => this.#onTargetChange());
    filter();
  }

  /**
   * Quantity of `opt` in stock at the chosen location, in `condition` (or in
   * any condition when it's empty).
   * @param {HTMLOptionElement} opt
   * @param {string} [condition]
   * @returns {number}
   */
  #stockOf(opt, condition = this.#condition?.value ?? "") {
    const locationId = this.#location?.value ?? "";
    if (!locationId) return 0;
    let total = 0;
    for (const entry of (opt.dataset.stock ?? "").split(" ")) {
      const [loc, cond, qty] = entry.split(":");
      if (loc === locationId && (!condition || cond === condition)) total += Number(qty) || 0;
    }
    return total;
  }

  /** @returns {HTMLOptionElement | null} the selected target option, or null for the placeholder */
  #selected() {
    const selected = this.#target?.selectedOptions[0];
    return selected && selected !== this.#placeholder ? selected : null;
  }

  #onTargetChange() {
    const selected = this.#selected();
    if (selected && this.#stockOf(selected) === 0) {
      selected.selected = false;
      if (this.#placeholder) {
        this.#placeholder.selected = true;
        this.#placeholder.textContent = `${selected.textContent?.trim()} isn't in stock here`;
      }
    } else if (selected && this.#placeholder) {
      this.#placeholder.textContent = "Select carton…";
    }
    this.#filterConditions();
    this.#updateQuantity();
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
        ? "Select a location first…"
        : available === 0
          ? this.#condition ? "No cartons in stock in this condition here" : "No cartons in stock here"
          : "Select carton…";
      if (target.value === "") this.#placeholder.selected = true;
    }
    this.#filterConditions();
    this.#updateQuantity();
  }

  /** Limits [condition-choice] to the selected target's conditions in stock here. */
  #filterConditions() {
    const select = this.#conditionChoice;
    if (!select) return;
    const selected = this.#selected();
    /** @type {HTMLOptionElement | null} */
    let firstAvailable = null;
    for (const opt of select.options) {
      // With no carton chosen yet, every condition stays available.
      const inStock = !selected || this.#stockOf(selected, opt.value) > 0;
      opt.hidden = !inStock;
      opt.disabled = !inStock;
      if (inStock) firstAvailable ??= opt;
    }
    if (select.selectedOptions[0]?.disabled && firstAvailable) firstAvailable.selected = true;
  }

  #updateQuantity() {
    if (!this.#quantity) return;
    const selected = this.#selected();
    const stock = selected ? this.#stockOf(selected, (this.#condition ?? this.#conditionChoice)?.value ?? "") : 0;
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
