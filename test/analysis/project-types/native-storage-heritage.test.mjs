import assert from "node:assert/strict";
import test from "node:test";
import { sealCsharpProjectTypeClassifications } from "../../../dist/analysis/project-types/analyze.js";

function fixture() {
  const sourceFile = Object.freeze({});
  const declaration = Object.freeze({});
  const parameter = Object.freeze({ kind: "type-parameter", identity: "owner:T", name: "T" });
  const definition = Object.freeze({
    id: "owner:Derived", kind: "class", declaration, sourceFile,
    typeParameterBindings: Object.freeze([parameter]),
  });
  const heritage = Object.freeze({
    definition,
    baseType: Object.freeze({ kind: "target-named", id: "owner:Base", typeArguments: Object.freeze([parameter]) }),
    interfaces: Object.freeze([Object.freeze({
      kind: "target-named", id: "owner:Interface", typeArguments: Object.freeze([parameter]),
    })]),
  });
  let sealed = false;
  const query = () => {
    assert.equal(sealed, false, "sealed heritage cannot query mutable policy");
    return heritage;
  };
  const classifications = sealCsharpProjectTypeClassifications({
    issues: [], catalog: {
      definitions: [definition],
      definitionContainingDeclaration: () => undefined,
    },
    heritageForDeclaration: query,
    implicitConstructorsForDeclaration: () => [],
  }, { forEachChild() {} }, [sourceFile]);
  sealed = true;
  return { classifications, definition, declaration, parameter };
}

test("sealed native storage heritage instantiates exact outer binders without policy queries", () => {
  const { classifications, definition, declaration, parameter } = fixture();
  const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
  const selection = classifications.heritageForTarget({
    kind: "target-named", id: definition.id, typeArguments: [integer],
  });
  assert.equal(selection === undefined, false, "instantiated heritage");
  assert.equal(selection.definition === definition, true, "declaration identity");
  assert.equal(selection.baseType.typeArguments[0] === integer, true, "base instantiation");
  assert.equal(selection.interfaces[0].typeArguments[0] === integer, true, "interface instantiation");
  assert.equal(Object.isFrozen(selection), true, "immutable selection");
  assert.equal(Object.isFrozen(selection.interfaces), true, "immutable interface rows");
  assert.equal(classifications.heritageForDeclaration(declaration).baseType.typeArguments[0] === parameter,
    true, "authored heritage remains generic");
});

test("native storage heritage rejects absent identities and malformed generic selections", () => {
  const { classifications, definition } = fixture();
  const integer = { kind: "source-primitive", name: "int32" };
  for (const selected of [
    { kind: "source-primitive", name: "int32" },
    { kind: "target-named", id: "other:Derived", typeArguments: [integer] },
    { kind: "target-named", id: definition.id },
    { kind: "target-named", id: definition.id, typeArguments: [integer, integer] },
  ]) {
    assert.equal(classifications.heritageForTarget(selected) === undefined, true, "unproven heritage");
  }
});
