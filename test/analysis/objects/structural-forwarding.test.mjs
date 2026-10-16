import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../../../dist/analysis/objects/structural-forwarding.js";
import { planCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/declarations/interfaces/structural.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

function fixture(passingMode = "by-value") {
  const sourceType = Object.freeze({ kind: "target-named", id: "test.Source" });
  const interfaceType = Object.freeze({ kind: "target-named", id: "test.View", csharpRender: { kind: "named", name: "View" } });
  const declaration = Object.freeze({});
  const sourceParameter = Object.freeze({});
  const incoming = Object.freeze({ name: "value", type: passingMode === "by-value" ? csharpNullableTargetType(integer) : integer,
    passingMode, ...(passingMode === "by-value" ? { optional: true } : {}) });
  const implementation = Object.freeze({ sourceDeclaration: declaration, methodTypeParameterIdentities: Object.freeze([]),
    parameters: Object.freeze([Object.freeze({ sourceParameter, targetParameter: incoming })]), returnType: integer });
  const signature = csharpDelegateTargetType("System.Func", [incoming.type], integer,
    passingMode === "by-value" ? { optionalParameterIndexes: [0] } : {});
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method", type: {
    ...signature, csharpDelegateSignature: { ...signature.csharpDelegateSignature, parameterPassingModes: Object.freeze([passingMode]) },
  } });
  const selected = Object.freeze({ sourceType, interfaceType, properties: Object.freeze([]), methods: Object.freeze([
    Object.freeze({ sourceName: "read", declaration, member, defaultArguments: Object.freeze(passingMode === "by-value" ? [0] : []) }),
  ]) });
  const runtimeDefault = Object.freeze({ kind: "nullable", valueType: integer, parameterType: incoming.type, acceptsOmission: true });
  let reads = 0;
  const callables = { callableDispatch: { get(node) { reads += 1; return node === declaration ? { implementation } : undefined; } } };
  const declarations = { runtimeDefault: { get(node) { reads += 1;
    return node === sourceParameter && passingMode === "by-value" ? runtimeDefault : undefined; } } };
  const policy = { ast: { parent: () => undefined, parameters: () => assert.fail("source parameter analysis cannot run again") },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } } };
  const shapes = { structuralImplementationTypes: Object.freeze([sourceType]),
    structuralImplementations: () => Object.freeze([selected]), knownShapes: () => [] };
  return { sourceType, declaration, sourceParameter, implementation, runtimeDefault, callables, declarations, policy, shapes,
    reads: () => reads };
}

test("structural forwarding publishes canonical completed contracts and pure immutable native reads", () => {
  const value = fixture();
  const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
  assert.equal(finalized.issues.length, 0, "the canonical incoming native ABI is admitted");
  const selected = finalized.objectShapes.structuralImplementations(value.sourceType);
  const method = selected[0]?.methods[0];
  assert.equal(method?.forwarding.implementation === value.implementation, true, "the canonical physical contract is reused, not rebuilt");
  assert.equal(method?.forwarding.parameterDefaults[0] === value.runtimeDefault, true, "the existing default owner is reused by exact parameter identity");
  assert.equal(method?.forwarding.parameters[0]?.kind, "value", "native incoming values forward directly");
  assert.equal(method?.forwarding.parameters[0]?.adapter.conversion.kind, "identity", "no boxing or default evaluation adapter");
  assert.equal(Object.isFrozen(method.forwarding) && Object.isFrozen(method.forwarding.parameters) && Object.isFrozen(selected), true,
    "the final native view is immutable");
  assert.equal(Object.hasOwn(finalized.objectShapes, "structuralImplementationTypes"), false, "analysis-only demand inventory does not cross the program seal");
  const reads = value.reads();
  value.callables.callableDispatch.get = () => assert.fail("canonical ABI lookup cannot be repeated after publication");
  value.declarations.runtimeDefault.get = () => assert.fail("runtime default lookup cannot be repeated after publication");
  value.shapes.structuralImplementations = () => assert.fail("logical structural selection cannot run after publication");
  assert.equal(finalized.objectShapes.structuralImplementations({ ...value.sourceType }) === selected, true, "final reader preserves native record identity");
  assert.equal(value.reads(), reads, "the final getter is a lookup only");
  assert.throws(() => finalized.objectShapes.structuralImplementations({ ...value.sourceType, typeArguments: [integer] }),
    /no sealed record/u, "an unadmitted generic instantiation cannot trigger late analysis");
});

for (const missing of ["canonical method contract", "native parameter passing correspondence"]) {
  test(`structural forwarding refuses incomplete ${missing} before a backend method can be published`, () => {
    const value = fixture();
    if (missing === "canonical method contract") value.callables.callableDispatch.get = () => undefined;
    else {
      const selected = value.shapes.structuralImplementations(value.sourceType)[0];
      const method = selected.methods[0];
      const member = { ...method.member, type: { ...method.member.type,
        csharpDelegateSignature: { ...method.member.type.csharpDelegateSignature, parameterPassingModes: [] },
      } };
      value.shapes.structuralImplementations = () => [{ ...selected, methods: [{ ...method, member }] }];
    }
    const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
    assert.equal(finalized.issues.length, 1, "one precise incomplete native contract diagnostic");
    assert.equal(finalized.issues[0]?.node === value.declaration, true, "the exact implementation declaration owns the failure");
    assert.equal(finalized.issues[0]?.message, "An analyzed interface method has no exact native forwarding signature.",
      "the existing refusal is not replaced by a fallback or guessed parameter mode");
    assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0]?.methods.length, 0,
      "no partial native method is supplied to the backend");
  });
}

for (const passingMode of ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]) {
  test(`structural forwarding preserves the canonical ${passingMode} incoming parameter without a body prelude`, () => {
    const value = fixture(passingMode);
    const finalized = finalizeCsharpStructuralInterfaceForwarding(value.policy, value.shapes, value.callables, value.declarations);
    assert.equal(finalized.issues.length, 0, "identical native passing contracts need no new adaptation capability");
    const diagnostics = [];
    const planned = planCsharpStructuralInterfaceMembers({ targetType: value.sourceType }, value.declaration, {
      program: { objectShapes: finalized.objectShapes, source: { ast: {
        getSourceFile: () => ({}), parameters: () => assert.fail("the renderer cannot plan method parameters or defaults again"),
      } } }, scope: {},
    }, diagnostics);
    assert.equal(diagnostics.length, 0, "stored native forwarding needs no source rejection");
    assert.equal(planned.length, 1, "one selected explicit interface method");
    const method = planned[0];
    const expected = passingMode === "by-value" ? undefined : passingMode === "byref-readonly" ? "in"
      : passingMode === "byref-readwrite" ? "ref" : "out";
    assert.equal(method.parameters.length, 1, "all physical incoming parameters retained");
    assert.equal(method.parameters[0]?.passing, expected, "native declaration passing mode");
    assert.equal(method.body.statements.length, 1, "the implementation alone owns the default/destructuring body");
    const call = method.body.statements[0].expression;
    assert.equal(call.kind, "InvocationExpression", "one direct native call");
    assert.equal(call.arguments[0]?.passing, expected, "native invocation passing mode");
    assert.equal(call.arguments[0]?.expression.kind, "IdentifierName", "no duplicated default initializer or destructuring");
  });
}

const programs = [
  ["effectful default", `interface View { read(value?: int32): int32; }
let calls: int32 = 0;
function next(): int32 { calls += 1; return 700123; }
class Box { read(value: int32 = next()): int32 { return value; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["destructured default", `interface View { read(value?: { left: int32 }): int32; }
class Box { read({ left }: { left: int32 } = { left: 700123 }): int32 { return left; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["unused incoming parameter", `interface View { read(value?: int32, ignored?: int32): int32; }
class Box { read(value: int32 = 700123, ignored: int32 = 4): int32 { return value; } }
export function run(): int32 { const value: View = new Box(); return value.read(); }`, 1],
  ["rest incoming parameter", `interface View { read(...values: int32[]): int32; }
class Box { read(...values: int32[]): int32 { return values[0]; } }
export function run(): int32 { const value: View = new Box(); return value.read(700123); }`, 1],
];

for (const surface of ["native", "js"]) {
  for (const [name, source, literalCount] of programs) {
    test(`structural ${name} uses the completed native method ABI (${surface})`, () => {
      const compiled = compileCsharpSource({ surface,
        sourceText: 'import type { int32 } from "@tsonic/core/types.js";\n' + source });
      assert.equal(compiled.result.diagnostics.length, 0,
        `native forwarding: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal((generated.match(/\b700123\b/gu) ?? []).length, literalCount,
        "the authored initializer/value is emitted once, not copied into a forwarding body");
      if (name === "unused incoming parameter") {
        const { program } = compiled.result;
        const ast = program.source.ast;
        let declaration;
        const visit = node => {
          if (ast.is.IsMethodDeclaration(node) && ast.text(ast.name(node)) === "read") declaration = node;
          ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
        };
        program.sourceFiles.forEach(visit);
        assert.equal(declaration !== undefined, true, "the exact authored method remains in the sealed source domain");
        const method = program.records.callableDispatch.get(declaration)?.implementation;
        assert.equal(method?.parameters.length, 2, "unused and omittable native parameters are not dropped");
        assert.equal(method?.parameters.every(parameter => parameter.targetParameter.optional === true), true,
          "both native omission contracts are retained");
        assert.equal(/public int read\(int\? [^,\n]+, int\? /u.test(generated), true,
          "the actual native method, whether directly satisfying the interface or forwarded, retains both incoming slots");
      }
    });
  }
}
