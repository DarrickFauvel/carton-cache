import * as esbuild from "esbuild";

// Bundle the Chrome extension's scripts into extension/dist/. Load the
// extension unpacked from extension/ (manifest.json references dist/).
await esbuild.build({
  entryPoints: ["extension/src/background.js", "extension/src/sidepanel.js"],
  bundle: true,
  outdir: "extension/dist",
  format: "esm",
  target: "es2022",
});

console.log("Extension built.");
