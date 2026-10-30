import assert from "node:assert/strict";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, declarations] of Array.from(nativeEntryCases).slice(0, 52)){
test("C# native callback entry keeps exact generic adoption: " + name, () => {
    const invocation = name === "finite-callback-alternatives" ? "wrap(promised, true)" : "wrap(promised)";
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      `\nexport function reject(promised: Promise<number>): void { void ${invocation}; }` });
    rejected(compiled, invocation, "KindCallExpression", "wrap");
  });
}
