import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "node_modules", "pdfjs-dist", "build");
const destDir = join(root, "public", "pdfjs");
mkdirSync(destDir, { recursive: true });
copyFileSync(join(buildDir, "pdf.min.mjs"), join(destDir, "pdf.min.mjs"));
copyFileSync(join(buildDir, "pdf.worker.min.mjs"), join(destDir, "pdf.worker.min.mjs"));
console.log("pdfjs-dist -> public/pdfjs/");
