// The @tsonic/csharp/lang.js marker re-export refusal (analysis/source-modules/alias-reexports.ts), nextgen C-2542.
//
// Basis: Claude's ruling on R-C5-3 (R5 / I7): C# originates only CSHARP_ codes, for .NET reasons. The former public code
// TSONIC_CSHARP_9100170 is now CSHARP_LANG_MARKER_REEXPORT. @tsonic/csharp/lang.js is the C# target's own marker module
// (out / ref / inref, struct, field, attribute, defaultof, fnptr); the C# target binds each marker to its .NET form only
// where it is imported from that module, and a local barrel re-export carries no binding. Writer C7.
import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const code = "CSHARP_LANG_MARKER_REEXPORT";

test("re-exporting a C# marker through a local barrel is one CSHARP_LANG_MARKER_REEXPORT refusal", () => {
  for (const [label, statement] of [
    ["named", `export { out } from "@tsonic/csharp/lang.js";`],
    ["renamed", `export { ref as byReference } from "@tsonic/csharp/lang.js";`],
    ["star", `export * from "@tsonic/csharp/lang.js";`],
  ]) {
    const compiled = compileCsharpSource({ sourceText: `${statement}\nexport const ready = 1;\n` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${label}: valid Source`);
    const refusals = compiled.targetDiagnostics.filter(diagnostic => diagnostic.code === code);
    assert.equal(refusals.length, 1, `${label}: one refusal; ${compiled.targetDiagnostics.map(({ code: c, message }) => `${c}: ${message}`).join("; ")}`);
    assert.equal(refusals[0].category, "error");
    assert.match(refusals[0].message, /binds each marker to its \.NET form only where it is imported from @tsonic\/csharp\/lang\.js/u);
    assert.equal(compiled.targetDiagnostics.some(diagnostic => /^TSONIC_/u.test(diagnostic.code)), false,
      `${label}: C# originates no TSONIC_ code (I7)`);
    assert.equal(compiled.artifacts.size, 0, `${label}: no artifacts past the refusal`);
  }
});

test("a direct marker import and a re-export of a project module are not marker re-exports", () => {
  const compiled = compileCsharpSource({
    sourceText: `import { out } from "@tsonic/csharp/lang.js";\nexport { helper } from "./helper.js";\nexport type Marker = typeof out;\n`,
    files: { "helper.ts": "export const helper = 1;\n" },
  });
  assert.equal(compiled.sourceDiagnosticsText, "", "valid Source");
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === code), false,
    compiled.targetDiagnostics.map(({ code: c, message }) => `${c}: ${message}`).join("; "));
});
