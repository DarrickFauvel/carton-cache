/**
 * <barcode-scanner target="fieldId">
 *
 * HTML Web Component — the trigger button lives in the server-rendered HTML.
 * This script enhances it with camera/scan behaviour and appends a camera
 * overlay into the DOM on demand (the overlay is inherently dynamic UI).
 *
 * Usage in templates:
 *   <barcode-scanner target="barcode">
 *     <button type="button" class="btn">Scan</button>
 *   </barcode-scanner>
 *
 * Dispatches a "barcode-detected" CustomEvent (bubbles) with { value }.
 * Also writes the scanned value into the element with id matching [target].
 */

/**
 * @typedef {object} BarcodeDetectorResult
 * @property {string} rawValue
 */

/**
 * @typedef {object} BarcodeDetectorLike
 * @property {(image: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>} detect
 */

class BarcodeScanner extends HTMLElement {
  /** @type {HTMLVideoElement | null} */
  #video = null;
  /** @type {HTMLDialogElement | null} */
  #overlay = null;
  /** @type {MediaStream | null} */
  #stream = null;
  /** @type {number | null} */
  #animFrame = null;
  /** @type {BarcodeDetectorLike | null} */
  #detector = null;

  connectedCallback() {
    // Trigger comes from HTML — find it or bail gracefully
    const trigger = this.querySelector("button");
    if (!trigger) return;

    // Build and append the camera dialog (dynamic UI, appropriate for JS)
    this.#overlay = document.createElement("dialog");
    this.#overlay.className = "scan-dialog";
    this.#overlay.innerHTML = `
      <div class="scan-viewport">
        <video autoplay playsinline muted></video>
        <div class="scan-reticle"></div>
      </div>
      <form method="dialog">
        <button type="submit" class="btn btn--danger">Cancel</button>
      </form>
    `;
    document.body.appendChild(this.#overlay);

    this.#video = this.#overlay.querySelector("video");

    trigger.addEventListener("click", () => this.#open());

    // Use the native dialog close event (fires for both Cancel button and Esc)
    this.#overlay.addEventListener("close", () => this.#stopStream());
  }

  disconnectedCallback() {
    this.#stopStream();
    this.#overlay?.remove();
  }

  async #open() {
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      /** @type {HTMLVideoElement} */ (this.#video).srcObject = this.#stream;
      /** @type {HTMLDialogElement} */ (this.#overlay).showModal();
      this.#detector = await this.#buildDetector();
      this.#scan();
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }

  #stopStream() {
    if (this.#animFrame !== null) cancelAnimationFrame(this.#animFrame);
    this.#animFrame = null;
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
  }

  /** @returns {Promise<BarcodeDetectorLike>} */
  async #buildDetector() {
    if ("BarcodeDetector" in window) {
      const ctor = /** @type {{ BarcodeDetector: new (options?: { formats: string[] }) => BarcodeDetectorLike }} */ (
        /** @type {unknown} */ (window)
      ).BarcodeDetector;
      return new ctor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code", "data_matrix"],
      });
    }
    const { BrowserMultiFormatReader } = await import(
      /** @type {string} */ ("https://cdn.jsdelivr.net/npm/@zxing/browser@latest/esm/index.js")
    );
    const reader = new BrowserMultiFormatReader();
    return {
      detect: async (/** @type {HTMLVideoElement} */ video) => {
        try {
          const result = await reader.decodeOnceFromVideoElement(video);
          return [{ rawValue: result.getText() }];
        } catch {
          return [];
        }
      },
    };
  }

  #scan() {
    const loop = async () => {
      if (!this.#stream) return;
      try {
        const results = await /** @type {BarcodeDetectorLike} */ (this.#detector).detect(
          /** @type {HTMLVideoElement} */ (this.#video)
        );
        if (results.length > 0) {
          this.#onDetected(results[0].rawValue);
          return;
        }
      } catch {
        // detector not ready yet, keep looping
      }
      this.#animFrame = requestAnimationFrame(loop);
    };
    this.#animFrame = requestAnimationFrame(loop);
  }

  /** @param {string} value */
  #onDetected(value) {
    this.#overlay?.close();
    this.#stopStream();

    const targetId = this.getAttribute("target");
    if (targetId) {
      const field = /** @type {HTMLInputElement | null} */ (document.getElementById(targetId));
      if (field) {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    this.dispatchEvent(
      new CustomEvent("barcode-detected", { bubbles: true, detail: { value } })
    );
  }
}

customElements.define("barcode-scanner", BarcodeScanner);
