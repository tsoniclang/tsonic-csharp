import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { analyzeCsharpDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

// nextgen C-2542: omission is read from the owner's authored parameter list (analysis/callables/calls/signature-parameters.ts:
// an optional or defaulted parameter with no required parameter after it accepts omission), not from a checker
// declarationSignatureInfo double. Each omission value is now produced by a real program instead of an injected flag.
function fixture(acceptsOmission) {
  const program = hostProgram(`import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32 = 1${acceptsOmission ? "" : ", last: int32"}): void {}`);
  const ast = program.ast;
  const file = program.files[0];
  const owner = program.named("run");
  const parameter = ast.parameters(owner)[0];
  const policy = { ast, sourceFiles: [file], facts: program.facts,
    types: { callableReturn(declaration) {
      const published = program.facts.values.callableReturn(declaration);
      assert.equal(published !== undefined && published.kind !== "refused" && published.provenance.occurrence === declaration &&
        published.type.kind === "intrinsic" && published.type.intrinsic === "void", true,
        "the return contract consumes this real callable's Host-published void descriptor");
      return { kind: "void" };
    } } };
  const valueType = { kind: "source-primitive", name: "int32" };
  const evidence = { compileTimeMetadata: new Map(), pointerReturn: new Map(), inferredCallableReturnType: new Map(),
    nodeTargetType: { get: node => node === parameter
      ? valueType : ast.kindName(node) === "KindVoidKeyword" ? { kind: "void" } : undefined },
    contextualType: new Map() };
  return { parameter, selected: () => analyzeCsharpDeclarations(policy, evidence,
    { selectedProperty: new Map(), selectedCall: new Map() }).runtimeDefault.get(parameter) };
}

test("native default declarations retain exact omission independently of their initializer and carrier", () => {
  for (const acceptsOmission of [false, true]) {
    const input = fixture(acceptsOmission);
    const selected = input.selected();
    assert.equal(selected.acceptsOmission, acceptsOmission);
    assert.equal(selected.kind, "nullable");
    assert.equal(selected.valueType.name, "int32");
    assert.equal(getCsharpNullableElementTargetType(selected.parameterType).name, "int32");
    assert.equal(Object.isFrozen(selected), true);
    assert.equal(Object.isFrozen(selected.native) && selected.native.source === selected.parameterType &&
      selected.native.target === selected.valueType && selected.native.kind === "coalesce" && selected.native.presence === false, true,
      "the immutable native default decision is owned by declaration analysis");
  }
});

// nextgen C-2542: the case "a native default rejects missing or foreign declaration-slot evidence" is removed. It
// injected a missing or foreign checker declarationSignatureInfo slot; the slot is now the parameter's own position in
// its owner's authored parameter list, which cannot be missing or foreign for a parameter of that owner (the remaining
// guard is a failTargetAnalysisInvariant in declarations/analyze.ts).
