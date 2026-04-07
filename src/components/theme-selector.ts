/**
 * <theme-selector>
 *
 * HTML Web Component — the <select> lives in the server-rendered HTML.
 * This script only reads the stored preference, syncs the select value,
 * and wires up the change handler.
 *
 * Usage in templates:
 *   <theme-selector>
 *     <select class="theme-select" aria-label="Theme">
 *       <option value="system">System</option>
 *       <option value="light">Light</option>
 *       <option value="dark">Dark</option>
 *     </select>
 *   </theme-selector>
 */

const STORAGE_KEY = "cc-theme";

function applyTheme(value: string) {
  if (value === "system") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(STORAGE_KEY);
  } else {
    document.documentElement.dataset.theme = value;
    localStorage.setItem(STORAGE_KEY, value);
  }
}

class ThemeSelector extends HTMLElement {
  connectedCallback() {
    const select = this.querySelector<HTMLSelectElement>("select");
    if (!select) return;

    select.value = localStorage.getItem(STORAGE_KEY) ?? "system";
    select.addEventListener("change", () => applyTheme(select.value));
  }
}

customElements.define("theme-selector", ThemeSelector);
