import esbuild from "esbuild";
import process from "process";
import { fileURLToPath } from "url";

const production = process.argv[2] === "production";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const context = await esbuild.context({
  absWorkingDir: projectRoot,
  banner: { js: "/* Visual Media Picker */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
