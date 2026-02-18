import { build } from "esbuild";

await build({
  entryPoints: ["scripts/statusline.ts"],
  bundle: true,
  outfile: "dist/index.js",
  format: "esm",
  platform: "node",
  target: "node22",
  minify: false,
  sourcemap: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

console.log("Built dist/index.js");
