/**
 * <qty-stepper>
 *   <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
 *   <input type="number" min="1" value="1" />
 *   <button type="button" data-step="1" aria-label="Increase quantity">+</button>
 *   <button type="button" data-step="10" aria-label="Add 10">+10</button>
 * </qty-stepper>
 *
 * Adds each clicked button's data-step to the number input inside it, clamped
 * to the input's min/max. Fires `input` and `change` on the input so anything
 * listening sees the new value as if it had been typed. The buttons are hidden
 * by CSS until this element is defined, so the plain input still works without JS.
 */

class QtyStepper extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", this.#onClick);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
  }

  /** @param {MouseEvent} e */
  #onClick = (e) => {
    const button = /** @type {HTMLElement} */ (e.target).closest("button[data-step]");
    const input = this.querySelector("input[type='number']");
    if (!button || !(input instanceof HTMLInputElement)) return;

    const step = Number(/** @type {HTMLElement} */ (button).dataset.step);
    if (!Number.isFinite(step)) return;

    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    // An empty or garbled field counts as 0, so +10 gives 10 and − gives min.
    const current = Number.isNaN(input.valueAsNumber) ? 0 : input.valueAsNumber;
    const next = Math.min(max, Math.max(min, current + step));

    if (String(next) === input.value) return;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
}

customElements.define("qty-stepper", QtyStepper);
