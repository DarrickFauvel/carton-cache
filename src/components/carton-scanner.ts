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

interface QuickCreateElement extends HTMLElement {
  open(prefill?: Record<string, string>): void;
}

class CartonScanner extends HTMLElement {
  private statusEl: HTMLParagraphElement | null = null;

  connectedCallback() {
    const inputRow = this.closest(".input-row") ?? this;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.hidden = true;
    inputRow.insertAdjacentElement("afterend", status);
    this.statusEl = status;

    this.addEventListener("barcode-detected", (e: Event) => {
      const barcode = (e as CustomEvent<{ value: string }>).detail.value;
      void this.handleBarcode(barcode);
    });
  }

  disconnectedCallback() {
    this.statusEl?.remove();
  }

  private async handleBarcode(barcode: string) {
    const parsed        = parseGS1(barcode);
    const lookupValue   = parsed.gtin ?? barcode;
    const lookupUrl     = this.getAttribute("lookup")          ?? "/cartons/lookup";
    const targetId      = this.getAttribute("target")          ?? "";
    const qtyTargetId   = this.getAttribute("quantity-target") ?? "";
    const notesTargetId = this.getAttribute("notes-target")    ?? "";
    const createSel     = this.getAttribute("create");

    this.setStatus("", false);

    try {
      const res = await fetch(`${lookupUrl}?barcode=${encodeURIComponent(lookupValue)}`);

      if (res.ok) {
        const carton = await res.json() as { id: string; name: string; sku?: string | null };
        this.selectCarton(targetId, carton);
        this.prefillQuantity(qtyTargetId, parsed.quantity);
        this.prefillNotes(notesTargetId, parsed.lot, parsed.expiry);
      } else if (res.status === 404) {
        if (createSel) {
          const qc = document.querySelector<QuickCreateElement>(createSel);
          const prefill: Record<string, string> = { barcode: lookupValue, _scanned: parsed.raw };
          if (lookupValue === parsed.raw) {
            prefill._barcode_hint = "Decoded from scan";
          }
          qc?.open?.(prefill);
        } else {
          this.setStatus("No carton found with that barcode.", true);
        }
      } else {
        this.setStatus("Lookup failed. Please try again.", true);
      }
    } catch {
      this.setStatus("Network error. Please try again.", true);
    }
  }

  private selectCarton(
    targetId: string,
    carton: { id: string; name: string; sku?: string | null }
  ) {
    const select = document.getElementById(targetId) as HTMLSelectElement | null;
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

  private prefillQuantity(targetId: string, quantity: number | undefined) {
    if (!quantity || !targetId) return;
    const field = document.getElementById(targetId) as HTMLInputElement | null;
    if (field) {
      field.value = String(quantity);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  private prefillNotes(targetId: string, lot: string | undefined, expiry: string | undefined) {
    if (!targetId) return;
    const parts: string[] = [];
    if (lot)    parts.push(`Lot: ${lot}`);
    if (expiry) parts.push(`Expiry: ${expiry}`);
    if (!parts.length) return;
    const field = document.getElementById(targetId) as HTMLTextAreaElement | null;
    // Only pre-fill if the field is currently empty
    if (field && !field.value.trim()) {
      field.value = parts.join(" · ");
    }
  }

  private setStatus(message: string, isError: boolean) {
    if (!this.statusEl) return;
    if (!message) {
      this.statusEl.hidden = true;
      this.statusEl.textContent = "";
      return;
    }
    this.statusEl.className = isError ? "alert alert--error" : "alert alert--warning";
    this.statusEl.textContent = message;
    this.statusEl.hidden = false;
  }
}

customElements.define("carton-scanner", CartonScanner);
