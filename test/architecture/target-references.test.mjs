import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
});

test("no Rust target references in C# target code", () => {
  for (const path of sourceFiles(join(root, "src"))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\brust\b|\brustc\b|\brustdoc\b|\bcargo\b|tsonic-rust|@tsonic\/rust/iu,
      `${relative(root, path)} references the Rust target`);
  }
});
