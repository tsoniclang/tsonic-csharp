import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carrierRequirementsForArrayStructuralUses,
} from "../dist/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/structural-uses.js";
import {
  recordArrayParameterFacts,
} from "../dist/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/facts.js";

test("array carrier policy marks unresolved structural property uses missing instead of full-js", () => {
  const sourceExample = `
    export function first(values: number[]) {
      return values.customProperty;
    }
  `;
  assert.match(sourceExample, /customProperty/);

  const requirements = carrierRequirementsForArrayStructuralUses(
    [{ operation: "property", access: "read", selectedDeclaration: undefined }],
    int32Type(),
    { host: fakeLifecycleHost(), compiler: fakeCompiler() },
    fakeCarrierHost(),
  );

  assert.deepEqual([...requirements], ["unresolved-structural-use"]);
});

test("array carrier policy emits deterministic diagnostics for unresolved structural uses", () => {
  const sourceExample = `
    export function first(values: number[]) {
      return values.customProperty;
    }
  `;
  assert.match(sourceExample, /values\.customProperty/);

  const diagnostics = [];
  const name = { Text: "values" };
  recordArrayParameterFacts({
    parameter: {},
    name,
    typeNode: {},
    symbol: undefined,
    semanticType: undefined,
    elementType: int32Type(),
    sourceUses: [{ operation: "property", access: "read", selectedDeclaration: undefined }],
    carrierRequirements: new Set(["unresolved-structural-use"]),
  }, {
    host: fakeLifecycleHost(diagnostics),
  }, {});

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].extensionCode, "CSHARP_JS_ARRAY_CARRIER_REQUIREMENT_NOT_PROVEN");
  assert.match(diagnostics[0].message, /requires selected TSTS declaration identity and provider target member metadata/);
});

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function fakeCarrierHost() {
  return {
    getTargetTypeRefForSubject: () => undefined,
    getTargetTypeRefForType: () => undefined,
  };
}

function fakeLifecycleHost(diagnostics = []) {
  return {
    facts: {
      set: () => assert.fail("Unresolved array carrier requirements must not record carrier facts."),
      get: () => undefined,
    },
    factResolver: {
      resolve: () => undefined,
    },
    diagnostics: {
      append: (diagnostic) => diagnostics.push(diagnostic),
      all: () => diagnostics,
    },
  };
}

function fakeCompiler() {
  return {
    ast: {},
  };
}
