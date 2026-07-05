/**
 * <avatar-menu>
 *
 * Purely behavioural wrapper around a server-rendered <details> dropdown.
 * Adds click-outside-to-close and Escape-key handling.
 * The <details>/<summary> provides the open/close toggle without JS.
 */

class AvatarMenu extends HTMLElement {
  /** @type {HTMLDetailsElement | null} */
  #details = null;
  /** @type {(e: MouseEvent) => void} */
  #outsideHandler = () => {};
  /** @type {(e: KeyboardEvent) => void} */
  #keyHandler = () => {};

  connectedCallback() {
    this.#details = this.querySelector("details");
    if (!this.#details) return;

    this.#outsideHandler = (e) => {
      if (this.#details?.open && !this.contains(/** @type {Node} */ (e.target))) {
        this.#details.open = false;
      }
    };

    this.#keyHandler = (e) => {
      if (e.key === "Escape" && this.#details?.open) {
        this.#details.open = false;
      }
    };

    // Capture phase so we intercept before other handlers
    document.addEventListener("click", this.#outsideHandler, true);
    document.addEventListener("keydown", this.#keyHandler);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.#outsideHandler, true);
    document.removeEventListener("keydown", this.#keyHandler);
  }
}

customElements.define("avatar-menu", AvatarMenu);
