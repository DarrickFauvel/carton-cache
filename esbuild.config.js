import * as esbuild from "esbuild";

// Bundle Web Components from src/components/ into public/js/components/
const components = [
  "barcode-scanner",
  "theme-selector",
  "avatar-menu",
  "quick-create",
  "carton-scanner",
  "qr-modal",
];

await Promise.all(
  components.map((name) =>
    esbuild.build({
      entryPoints: [`src/components/${name}.ts`],
      bundle: true,
      outfile: `public/js/components/${name}.js`,
      format: "esm",
      target: "es2020",
      minify: process.env.NODE_ENV === "production",
    })
  )
);

console.log("Web Components built.");
