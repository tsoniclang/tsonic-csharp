import { test } from "node:test";
import assert from "node:assert/strict";
import { providerExportDeclarationsForModule } from "../dist/source/csharp-source-semantics/core-virtual-declarations.js";

test("source-semantics virtual attribute helpers do not introduce any-typed lanes", () => {
  const declarations = providerExportDeclarationsForModule({
    moduleSpecifier: "@tsonic/core/lang.js",
    packageName: "@tsonic/core",
    subpath: "lang.js",
    exports: [],
  });
  const serialized = JSON.stringify(declarations);

  assert.equal(serialized.includes('"kind":"any"'), false);
  assert.equal(serialized.includes('"kind":"unknown"'), true);
});
