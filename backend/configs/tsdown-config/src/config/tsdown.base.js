import { defineConfig } from "tsdown";
export const baseConfig = defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  clean: true,
  target: "es2022",
  sourcemap: false,
  minify: true,
  treeshake: true,
  shims: true,
	unbundle: false,
  external: [/^@unrs\//],
});
