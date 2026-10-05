import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const integer = { kind: "source-primitive", name: "int64" };
const floating = { kind: "source-primitive", name: "float64" };
const symbol = {};
const sourceType = {};
const expression = {};
const carrier = (id, argument = integer) => ({ kind: "target-named", id, typeArguments: [argument],
  csharpStructuralContract: true });
const shape = targetType => ({ targetType, sourceType, members: [{ sourceName: "value", targetName: "value",
  sourceKey: { kind: "property", name: "value" }, sourceSubjects: [symbol], memberKind: "property", type: integer }] });

function classifications(source, destination) {
  const shapes = new Map([source, destination].map(value => [targetTypeRefKey(value.targetType), value]));
  const policy = {
    sourceFiles: [], objectShapes: { resolveTarget: type => shapes.get(targetTypeRefKey(type)) },
    projectTypes: { directSupertypes: () => [] },
    semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers: () => ({
      kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol, rootSymbols: [] }, declarations: [] },
        destination: { property: { symbol, rootSymbols: [] }, declarations: [] },
      }],
    }) } }),
  };
  return analyzeCsharpObjectShapes(policy, { targetTypes: [] }, {});
}

test("C# structural identity is accepted without manufacturing a self-inheritance edge", () => {
  const source = shape(carrier("tsonic.shape:identity"));
  const destination = { ...source, targetType: { ...source.targetType } };
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType), true);
  assert.equal(selected.structuralImplementations(source.targetType).length, 0, "identity requires no implementation");
  assert.equal(selected.resolveTarget(source.targetType)?.implements === undefined, true, "identity is not native heritage");
});

test("C# structural identity does not permit incompatible generic self-inheritance", () => {
  const source = shape(carrier("tsonic.shape:identity"));
  const destination = shape(carrier("tsonic.shape:identity", floating));
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType), false);
  assert.equal(selected.structuralImplementations(source.targetType).length, 0);
  assert.equal(selected.resolveTarget(source.targetType)?.implements === undefined, true);
});

test("C# structural identity normalization retains independently proven interface implementations", () => {
  const source = shape(carrier("tsonic.shape:source"));
  const destination = shape(carrier("tsonic.shape:destination"));
  const selected = classifications(source, destination);
  assert.equal(selected.registerStructuralInterface(expression, source.targetType, destination.targetType), true);
  assert.equal(selected.structuralImplementations(source.targetType).length, 1);
  assert.equal(selected.resolveTarget(source.targetType)?.implements.length, 1);
  assert.equal(selected.resolveTarget(source.targetType)?.implements[0].id, destination.targetType.id);
});
