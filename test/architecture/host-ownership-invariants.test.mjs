import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readSourceInventory } from "../../../tsonic/test/architecture/tooling/file-inventory.mjs";
import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";
import { sourceForwardingFindings } from "../../../tsonic/test/architecture/tooling/source-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("Native owns only Native codes and forwards actual Source refusal fields unchanged", () => {
  const sources = new Map([...readSourceInventory(resolve(root, "src"), { extensions: [".ts"] })]
    .filter(([file]) => !file.endsWith(".test.ts")).map(([file, text]) => [`src/${file}`, text]));
  const source = readArchitectureTypeScript(sources);
  assert.deepEqual(source.sourceFiles.flatMap(file => sourceForwardingFindings(source, file)), []);
});
