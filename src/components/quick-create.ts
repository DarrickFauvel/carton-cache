/**
 * <quick-create api="/locations" target="select-id" label="New Location">
 *   <button type="button" class="btn btn--icon">+</button>
 *   <template>
 *     <!-- form fields rendered here inside the dialog -->
 *   </template>
 * </quick-create>
 *
 * On successful creation the server must return JSON: { id, name, sku? }
 * The component appends a new <option> to the <select> identified by [target]
 * and selects it automatically.
 */

class QuickCreate extends HTMLElement {
  private dialog: HTMLDialogElement | null = null;
  private form: HTMLFormElement | null = null;
  private errorEl: HTMLElement | null = null;

  /** Open the dialog, optionally pre-filling named fields. */
  open(prefill: Record<string, string> = {}) {
    if (!this.dialog || !this.form || !this.errorEl) return;
    this.form.reset();
    // Close all <details> before re-opening so state is fresh
    for (const d of this.form.querySelectorAll<HTMLDetailsElement>("details")) d.open = false;
    this.errorEl.hidden = true;
    for (const [key, value] of Object.entries(prefill)) {
      const input = this.form.querySelector<HTMLInputElement>(`[name="${key}"]`);
      if (input) { input.value = value; continue; }
      // Also support non-input hint elements via data-prefill="key"
      const hint = this.form.querySelector<HTMLElement>(`[data-prefill="${key}"]`);
      if (hint) { hint.textContent = value; hint.hidden = !value; }
    }
    // Auto-expand any <details> that contain a prefilled field
    for (const d of this.form.querySelectorAll<HTMLDetailsElement>("details")) {
      const hasFilled = [...d.querySelectorAll<HTMLInputElement>("input")].some((i) => i.value);
      if (hasFilled) d.open = true;
    }
    this.dialog.showModal();
    // Focus first empty required field, or first field
    const firstEmpty = [...this.dialog.querySelectorAll<HTMLInputElement>("input[required]")]
      .find((i) => !i.value);
    (firstEmpty ?? this.dialog.querySelector<HTMLElement>("input, select, textarea"))?.focus();
  }

  connectedCallback() {
    const trigger = this.querySelector<HTMLButtonElement>("button");
    const tmpl   = this.querySelector<HTMLTemplateElement>("template");
    if (!trigger || !tmpl) return;

    const api      = this.getAttribute("api")    ?? "";
    const targetId = this.getAttribute("target") ?? "";
    const label    = this.getAttribute("label")  ?? "Create";

    // ── Build <dialog> ──────────────────────────────────────────────────────
    const dialog = document.createElement("dialog");
    dialog.className = "quick-create-dialog";
    this.dialog = dialog;

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
    document.body.appendChild(dialog);

    // Expose to the open() method
    this.form = form;
    this.errorEl = errorEl;

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
      new FormData(form).forEach((v, k) => params.append(k, v as string));

      try {
        const res = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: params.toString(),
        });

        const json = await res.json() as { id?: string; name?: string; sku?: string; error?: string };

        if (!res.ok) {
          errorEl.textContent = json.error ?? "Something went wrong.";
          errorEl.hidden = false;
          return;
        }

        // Inject new <option> into the target <select>
        const select = document.getElementById(targetId) as HTMLSelectElement | null;
        if (select && json.id && json.name) {
          const opt = document.createElement("option");
          opt.value = json.id;
          opt.textContent = json.sku ? `${json.name} — ${json.sku}` : json.name;
          for (const o of select.options) o.selected = false;
          select.appendChild(opt);
          opt.selected = true;
          select.dispatchEvent(new Event("change", { bubbles: true }));
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
    this.dialog?.remove();
  }
}

customElements.define("quick-create", QuickCreate);
