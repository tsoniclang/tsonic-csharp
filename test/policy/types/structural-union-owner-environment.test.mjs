import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpStructuralUnionDefinitions } from "../../../dist/policy/types/objects/object-shape-policy/union-definitions.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/runtime-carriers.js";
import { renderObjectShapeTypeParameters } from "../../../dist/backend/planner/objects/declarations/type-parameters.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const parameter = (identity, name = identity) => ({ kind: "type-parameter", identity, name });
const resolved = constraints => ({ kind: "resolved", constraints });
const integer = { kind: "source-primitive", name: "uint8" };

function scenario(arguments_, environment) {
  const file = { path: "/project/union.ts" };
  const declaration = { position: 0 };
  const root = { position: 1 };
  const armDeclarations = [{ position: 2 }, { position: 3 }];
  const armTypes = armDeclarations.map(declaration => ({ declaration }));
  const union = {};
  const bindings = arguments_.map((argument, index) => ({ argument, parameter: parameter(`alias-${index}`) }));
  const host = {
    ast: {
      is: { IsUnionTypeNode: node => node === root, IsTypeLiteralNode: node => armDeclarations.includes(node) },
      children: () => armDeclarations, getSourceFile: () => file, getPath: source => source.path,
      kind: () => 1, pos: node => node.position, end: node => node.position + 1,
    },
    navigation: { isProjectDeclaration: node => node === declaration },
    semantics: () => ({
      types: {
        isUnion: type => type === union,
        aliasApplication: () => ({ kind: "direct", declaration, typeNode: root, bindings }),
        unionOrIntersectionTypes: () => armTypes,
      },
      declarations: { typeSymbol: type => type, symbolDeclarations: symbol => [symbol.declaration] },
    }),
    typeResolver: { resolveType: type => type },
  };
  const shapes = [];
  let recursion;
  const policy = createCsharpStructuralUnionDefinitions(host, type => {
    recursion = policy.resolve(union, file, { depth: 0 });
    const targetType = policy.reference(type);
    const shape = { targetType, members: [{ sourceKey: { kind: "property", name: "value" }, sourceName: "value",
      targetName: "value", memberKind: "property", type: targetType.typeArguments?.[0] ?? integer }] };
    shapes.push(shape);
    return shape;
  }, environment);
  return { policy, shapes, resolve: () => policy.resolve(union, file, { depth: 0 }),
    reference: () => policy.reference(union), recursion: () => recursion };
}

test("recursive arm producers seal exact generic binders before publishing references", () => {
  const binder = parameter("value", "Value");
  const declaration = {};
  binder.csharpDeclaration = declaration;
  const constraints = [{ kind: "keyword", keyword: "struct" }];
  const selected = scenario([binder], () => resolved(constraints));
  const result = selected.resolve();
  assert.equal(result.kind, "resolved", "complete recursive native contract");
  assert.equal(selected.recursion().kind, "resolved", "finite recursive reference");
  assert.equal(getCsharpRuntimeUnionArms(result.type).length, 2, "one union and two native arms");
  for (const shape of selected.shapes) {
    const argument = shape.targetType.typeArguments[0];
    assert.equal(argument.identity, binder.identity, "exact source binder identity");
    assert.equal(argument.csharpDeclaration === declaration, true, "opaque source declaration retained");
    assert.equal(Object.isFrozen(argument.csharpConstraints), true, "sealed native evidence");
    const emitted = renderObjectShapeTypeParameters(undefined, shape, [], {});
    assert.deepEqual(emitted, [{ name: "Value", constraints: [{ kind: "KeywordConstraint", keyword: "struct" }] }]);
  }
  constraints.length = 0;
  assert.equal(selected.shapes[0].targetType.typeArguments[0].csharpConstraints.constraints.length, 1);
  assert.equal(binder.csharpConstraints === undefined, true, "source input not mutated");
});

test("recursive arm argument sealing preserves authored order and exact nested physical types", () => {
  const later = parameter("z", "Later");
  const earlier = parameter("a", "Earlier");
  const selected = scenario([later, earlier, { kind: "pointer", pointee: integer }], () => resolved([]));
  assert.equal(selected.resolve().kind, "resolved");
  const arguments_ = selected.shapes[0].targetType.typeArguments;
  assert.deepEqual(arguments_.slice(0, 2).map(argument => argument.identity), ["z", "a"], "argument positions are not sorted");
  assert.deepEqual(arguments_[2], { kind: "pointer", pointee: integer }, "no width or pointer rewrite");
  const concrete = scenario([integer], () => { throw new Error("A concrete native carrier has no generic constraints."); });
  assert.equal(concrete.resolve().kind, "resolved");
  assert.equal(concrete.shapes[0].targetType.typeArguments[0] === integer, true, "exact concrete source carrier");
});

test("unavailable or unsupported recursive owner constraints never become unconstrained emission", () => {
  for (const resolution of [
    { kind: "unsupported", reason: "Exact source declaration evidence is absent." },
    { kind: "unsupported", reason: "Selected native constraint is unsupported." },
  ]) {
    const selected = scenario([parameter("value", "Value")], () => resolution);
    assert.equal(selected.resolve().kind, "resolved", "unsupported evidence remains explicit");
    const diagnostics = [];
    assert.equal(renderObjectShapeTypeParameters(undefined, selected.shapes[0], diagnostics, {}) === undefined, true);
    assert.equal(diagnostics.length, 1, "one bounded native owner diagnostic");
    assert.equal(diagnostics[0].message, resolution.reason, "no guessed unconstrained binder");
  }
});

test("recursive argument closure rejects contradictory and executable metadata before references", () => {
  const left = { ...parameter("same"), csharpConstraints: resolved([{ kind: "keyword", keyword: "class" }]) };
  const right = { ...left, csharpConstraints: resolved([{ kind: "keyword", keyword: "struct" }]) };
  const contradiction = scenario([left, right], parameter => parameter.csharpConstraints);
  assert.throws(() => contradiction.resolve(), /conflicting constraint evidence/u);
  assert.equal(contradiction.reference() === undefined, true, "no incomplete definition published");
  let reads = 0;
  const executable = scenario([parameter("value")], () => ({ kind: "resolved", get constraints() { reads += 1; return []; } }));
  assert.throws(() => executable.resolve(), TypeError);
  assert.equal(reads, 0, "constraint getters never run");
  assert.equal(executable.reference() === undefined, true, "malformed native contract is unpublished");
});

test("recursive generic argument traversal retains the existing finite depth bound", () => {
  let excessive = parameter("value");
  for (let depth = 0; depth < 130; depth += 1) excessive = { kind: "array", element: excessive };
  const selected = scenario([excessive], () => resolved([]));
  assert.throws(() => selected.resolve(), /budget/u);
  assert.equal(selected.reference() === undefined, true, "over-budget native contract is unpublished");
});

for (const surface of [undefined, "js"]) {
  test(`recursive generic owner constraints execute without losing identity in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const sourceText = `
interface Payload { readonly amount: number; }
class Reading implements Payload { amount: number = 3; }
type Step<Value extends Payload> = { readonly kind: "done"; readonly value: Value }
  | { readonly kind: "read"; readonly resume: () => Step<Value> };
function done<Value extends Payload>(value: Value): Step<Value> { return { kind: "done", value }; }
function delayed<Value extends Payload>(value: Value): Step<Value> { return { kind: "read", resume: () => done(value) }; }
function complete<Value extends Payload>(step: Step<Value>): Value {
  if (step.kind === "done") return step.value;
  return complete(step.resume());
}
export function run(): boolean {
  const value = new Reading();
  return complete(delayed(value)) === value && complete(delayed(value)).amount === 3;
}`;
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText }), `recursive-constrained-${surface ?? "native"}`);
  });
}
