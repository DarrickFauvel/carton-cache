/**
 * <qr-modal>
 *   <button type="button" class="btn btn-ghost btn--icon" aria-label="QR code">…</button>
 * </qr-modal>
 *
 * Opens a <dialog> showing a QR code for window.location.href.
 * Generates the QR on every open so it always reflects the current URL.
 */

import QRCode from "qrcode";

class QrModal extends HTMLElement {
  private dialog: HTMLDialogElement | null = null;
  private codeEl: HTMLElement | null = null;
  private urlEl: HTMLElement | null = null;

  connectedCallback() {
    const trigger = this.querySelector<HTMLButtonElement>("button");
    if (!trigger) return;

    const dialog = document.createElement("dialog");
    dialog.className = "qr-dialog";

    const inner = document.createElement("div");
    inner.className = "qr-dialog__inner";

    const label = document.createElement("p");
    label.className = "qr-dialog__label";
    label.textContent = "Scan to open on another device";

    const codeEl = document.createElement("div");
    codeEl.className = "qr-dialog__code";

    const urlEl = document.createElement("p");
    urlEl.className = "qr-dialog__url";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => dialog.close());

    inner.append(label, codeEl, urlEl, closeBtn);
    dialog.appendChild(inner);
    document.body.appendChild(dialog);

    this.dialog = dialog;
    this.codeEl  = codeEl;
    this.urlEl   = urlEl;

    trigger.addEventListener("click", () => void this.openDialog());

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  disconnectedCallback() {
    this.dialog?.remove();
  }

  private async openDialog() {
    const url = window.location.href;

    // Always regenerate so it reflects the current URL
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });

    this.codeEl!.innerHTML = svg;
    this.urlEl!.textContent = url;
    this.dialog!.showModal();
  }
}

customElements.define("qr-modal", QrModal);
