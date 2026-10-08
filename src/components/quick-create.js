/**
 * <quick-create api="/locations" target="select-id" label="New Location">
 *   <button type="button" class="btn btn--icon">+</button>
 *   <template>
 *     <!-- form fields rendered here inside the dialog -->
 *   </template>
 * </quick-create>
 *
 * On successful creation the server must return JSON:
 *   { id, name, label?, printUrl?, printLabel? }
 * The component appends a new <option> to the <select> identified by [target]
 * and selects it automatically. If printUrl is set, the dialog stays open on a
 * "Created" step with a link to it (opened in a new tab) instead of closing.
 */

class QuickCreate extends HTMLElement {
  /** @type {HTMLDialogElement | null} */
  #dialog = null;
  /** @type {HTMLFormElement | null} */
  #form = null;
  /** @type {HTMLElement | null} */
  #errorEl = null;
  /** @type {HTMLElement | null} */
  #successEl = null;

  /**
   * Open the dialog, optionally pre-filling named fields.
   * @param {Record<string, string>} [prefill]
   */
  open(prefill = {}) {
    if (!this.#dialog || !this.#form || !this.#errorEl) return;
    this.#form.reset();
    this.#form.hidden = false;
    if (this.#successEl) this.#successEl.hidden = true;
    // Close all <details> before re-opening so state is fresh
    for (const d of this.#form.querySelectorAll("details")) d.open = false;
    this.#errorEl.hidden = true;
    for (const [key, value] of Object.entries(prefill)) {
      const input = /** @type {HTMLInputElement | null} */ (this.#form.querySelector(`[name="${key}"]`));
      if (input) { input.value = value; continue; }
      // Also support non-input hint elements via data-prefill="key"
      const hint = /** @type {HTMLElement | null} */ (this.#form.querySelector(`[data-prefill="${key}"]`));
      if (hint) { hint.textContent = value; hint.hidden = !value; }
    }
    // Auto-expand any <details> that contain a prefilled field
    for (const d of this.#form.querySelectorAll("details")) {
      const hasFilled = [...d.querySelectorAll("input")].some((i) => i.value);
      if (hasFilled) d.open = true;
    }
    this.#dialog.showModal();
    // Focus first empty required field, or first field
    const firstEmpty = /** @type {HTMLElement | undefined} */ (
      [...this.#dialog.querySelectorAll("input[required]")]
        .find((i) => !/** @type {HTMLInputElement} */ (i).value)
    );
    const fallback = /** @type {HTMLElement | null} */ (this.#dialog.querySelector("input, select, textarea"));
    (firstEmpty ?? fallback)?.focus();
  }

  connectedCallback() {
    const trigger = this.querySelector("button");
    const tmpl   = this.querySelector("template");
    if (!trigger || !tmpl) return;

    const api      = this.getAttribute("api")    ?? "";
    const targetId = this.getAttribute("target") ?? "";
    const label    = this.getAttribute("label")  ?? "Create";

    // ── Build <dialog> ──────────────────────────────────────────────────────
    const dialog = document.createElement("dialog");
    dialog.className = "quick-create-dialog";
    this.#dialog = dialog;

    const form = document.createElement("form");
    form.className = "stack";

    const heading = document.createElement("h2");
    heading.className = "quick-create-dialog__title";
    heading.textContent = label;
    form.appendChild(heading);

    const fieldsWrap = document.createElement("div");
    fieldsWrap.appendChild(tmpl.content.cloneNode(true));
    form.appendChild(fieldsWrap);

    const errorEl = document.createElement("p");
    errorEl.className = "alert alert--error";
    errorEl.hidden = true;
    form.appendChild(errorEl);

    const actionRow = document.createElement("div");
    actionRow.className = "action-row action-row--end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => dialog.close());
    actionRow.appendChild(cancelBtn);

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn btn--primary";
    submitBtn.textContent = "Create";
    actionRow.appendChild(submitBtn);

    form.appendChild(actionRow);
    dialog.appendChild(form);

    // ── Success step (only shown when the server returns a printUrl) ────────
    const success = document.createElement("div");
    success.className = "stack";
    success.hidden = true;

    const successMsg = document.createElement("p");
    successMsg.className = "alert alert--success";
    successMsg.setAttribute("role", "status");
    success.appendChild(successMsg);

    const successActions = document.createElement("div");
    successActions.className = "action-row action-row--end";

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn";
    doneBtn.textContent = "Done";
    doneBtn.addEventListener("click", () => dialog.close());
    successActions.appendChild(doneBtn);

    const printLink = document.createElement("a");
    printLink.className = "btn btn--primary";
    printLink.target = "_blank";
    printLink.addEventListener("click", () => dialog.close());
    successActions.appendChild(printLink);

    success.appendChild(successActions);
    dialog.appendChild(success);
    this.#successEl = success;
    document.body.appendChild(dialog);

    // Expose to the open() method
    this.#form = form;
    this.#errorEl = errorEl;

    // ── Wire events ─────────────────────────────────────────────────────────
    trigger.addEventListener("click", () => this.open());

    // Close on backdrop click
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      submitBtn.disabled = true;

      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => params.append(k, /** @type {string} */ (v)));

      try {
        const res = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: params.toString(),
        });

        const json = /** @type {{ id?: string; name?: string; label?: string; printUrl?: string; printLabel?: string; error?: string }} */ (await res.json());

        if (!res.ok) {
          errorEl.textContent = json.error ?? "Something went wrong.";
          errorEl.hidden = false;
          return;
        }

        // Inject new <option> into the target <select>
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(targetId));
        if (select && json.id && json.name) {
          const opt = document.createElement("option");
          opt.value = json.id;
          opt.textContent = json.label ?? json.name;
          for (const o of select.options) o.selected = false;
          select.appendChild(opt);
          opt.selected = true;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (json.printUrl) {
          successMsg.textContent = `Created ${json.label ?? json.name ?? ""}.`;
          printLink.href = json.printUrl;
          printLink.textContent = json.printLabel ?? "Print";
          form.hidden = true;
          success.hidden = false;
          printLink.focus();
          return;
        }

        dialog.close();
      } catch {
        errorEl.textContent = "Network error. Please try again.";
        errorEl.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  disconnectedCallback() {
    this.#dialog?.remove();
  }
}

customElements.define("quick-create", QuickCreate);
