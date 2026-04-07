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

interface BarcodeDetectorResult {
  rawValue: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(image: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
  static getSupportedFormats(): Promise<string[]>;
}

class BarcodeScanner extends HTMLElement {
  private video: HTMLVideoElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private stream: MediaStream | null = null;
  private animFrame: number | null = null;
  private detector: BarcodeDetector | null = null;

  connectedCallback() {
    // Trigger comes from HTML — find it or bail gracefully
    const trigger = this.querySelector<HTMLButtonElement>("button");
    if (!trigger) return;

    // Build and append the camera overlay (dynamic UI, appropriate for JS)
    this.overlay = document.createElement("div");
    this.overlay.className = "scan-overlay";
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="scan-viewport">
        <video autoplay playsinline muted></video>
        <div class="scan-reticle"></div>
      </div>
      <button type="button" class="btn btn--danger scan-cancel">Cancel</button>
    `;
    this.appendChild(this.overlay);

    this.video = this.overlay.querySelector("video");

    trigger.addEventListener("click", () => this.open());
    this.overlay.querySelector(".scan-cancel")!.addEventListener("click", () => this.close());
  }

  disconnectedCallback() {
    this.close();
  }

  private async open() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this.video!.srcObject = this.stream;
      this.overlay!.hidden = false;
      this.detector = await this.buildDetector();
      this.scan();
    } catch (err) {
      console.error("Camera access denied:", err);
    }
  }

  private close() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.overlay) this.overlay.hidden = true;
  }

  private async buildDetector(): Promise<BarcodeDetector> {
    if ("BarcodeDetector" in window) {
      return new (window as unknown as { BarcodeDetector: typeof BarcodeDetector }).BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code", "data_matrix"],
      });
    }
    const { BrowserMultiFormatReader } = await import(
      "https://cdn.jsdelivr.net/npm/@zxing/browser@latest/esm/index.js" as string
    );
    const reader = new BrowserMultiFormatReader();
    return {
      detect: async (video: HTMLVideoElement) => {
        try {
          const result = await reader.decodeOnceFromVideoElement(video);
          return [{ rawValue: result.getText() }];
        } catch {
          return [];
        }
      },
    } as unknown as BarcodeDetector;
  }

  private scan() {
    const loop = async () => {
      if (!this.stream) return;
      try {
        const results = await this.detector!.detect(this.video!);
        if (results.length > 0) {
          this.onDetected(results[0].rawValue);
          return;
        }
      } catch {
        // detector not ready yet, keep looping
      }
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  private onDetected(value: string) {
    this.close();

    const targetId = this.getAttribute("target");
    if (targetId) {
      const field = document.getElementById(targetId) as HTMLInputElement | null;
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
