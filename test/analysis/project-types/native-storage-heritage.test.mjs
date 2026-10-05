import assert from "node:assert/strict";
import test from "node:test";
import { sealCsharpProjectTypeClassifications } from "../../../dist/analysis/project-types/analyze.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture() {
  const sourceFile = Object.freeze({});
  const declaration = Object.freeze({});
  const parameter = Object.freeze({ kind: "type-parameter", identity: "owner:T", name: "T" });
  const definition = Object.freeze({
    id: "owner:Derived", kind: "class", declaration, sourceFile,
    scopeName: "ExactScope",
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
  assert.equal(targetTypeRefEquals(selection.baseType.typeArguments[0], integer), true, "base instantiation");
  assert.equal(targetTypeRefEquals(selection.interfaces[0].typeArguments[0], integer), true, "interface instantiation");
  assert.equal(selection.baseType.typeArguments[0] === selection.interfaces[0].typeArguments[0],
    true, "one exact argument snapshot");
  assert.equal(Object.isFrozen(selection.baseType.typeArguments[0]), true, "immutable selected argument");
  assert.equal(Object.isFrozen(selection), true, "immutable selection");
  assert.equal(Object.isFrozen(selection.interfaces), true, "immutable interface rows");
  assert.equal(classifications.heritageForDeclaration(declaration).baseType.typeArguments[0] === parameter,
    true, "authored heritage remains generic");
  assert.deepEqual(classifications.declarationScopeNames, ["ExactScope"]);
  assert.equal(Object.isFrozen(classifications.declarationScopeNames), true, "sealed declaration scopes");
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

test("native storage heritage rejects malformed arguments before substituting native storage", () => {
  const { classifications, definition } = fixture();
  const selections = [
    ["missing selection", undefined],
    ["null selection", null],
    ["non-data selection", "owner:Derived"],
    ["array selection", []],
    ["empty argument", { kind: "target-named", id: definition.id, typeArguments: [undefined] }],
    ["null argument", { kind: "target-named", id: definition.id, typeArguments: [null] }],
    ["non-carrier argument", { kind: "target-named", id: definition.id, typeArguments: [1] }],
    ["unknown carrier", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "unknown" }] }],
    ["unknown integer width", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "source-primitive", name: "int53" }] }],
    ["empty native identity", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "target-named", id: "" }] }],
    ["empty binder identity", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "type-parameter", identity: "", name: "T" }] }],
    ["missing array element", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "array" }] }],
    ["invalid array rank", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "array", element: { kind: "source-primitive", name: "int32" }, rank: 0 }] }],
    ["invalid pointer permission", { kind: "target-named", id: definition.id, typeArguments: [{ kind: "pointer", pointee: { kind: "source-primitive", name: "int32" }, mutability: "unchecked" }] }],
    ["array-like arguments", { kind: "target-named", id: definition.id, typeArguments: { 0: { kind: "source-primitive", name: "int32" }, length: 1 } }],
  ];
  for (const [caseName, selected] of selections) {
    assert.equal(classifications.heritageForTarget(selected) === undefined, true, caseName);
  }
});

test("native storage heritage rejects sparse and accessor argument arrays without evaluating getters", () => {
  const { classifications, definition } = fixture();
  const integer = { kind: "source-primitive", name: "int32" };
  let getterReads = 0;
  const getter = () => {
    getterReads += 1;
    throw new Error("native heritage must not execute metadata getters");
  };
  const accessor = [];
  Object.defineProperty(accessor, "0", { get: getter, enumerable: true });
  const sparseWithExtra = new Array(1);
  sparseWithExtra.extra = integer;
  const extraAccessor = [integer];
  Object.defineProperty(extraAccessor, "extra", { get: getter, enumerable: true });
  const inheritedAccessor = new Array(1);
  Object.setPrototypeOf(inheritedAccessor, Object.create(Array.prototype, {
    0: { get: getter, enumerable: true },
  }));
  for (const [caseName, typeArguments] of [
    ["sparse outer arguments", new Array(1)],
    ["sparse outer with equal descriptor count", sparseWithExtra],
    ["accessor outer argument", accessor],
    ["accessor extra property", extraAccessor],
    ["inherited accessor argument", inheritedAccessor],
    ["nested sparse arguments", [{ kind: "target-named", id: "owner:Nested", typeArguments: new Array(1) }]],
    ["nested accessor argument", [{ kind: "target-named", id: "owner:Nested", typeArguments: accessor }]],
    ["nested sparse tuple", [{ kind: "tuple", elements: new Array(1) }]],
    ["nested accessor tuple", [{ kind: "tuple", elements: accessor }]],
    ["nested sparse function argument", [{ kind: "function-pointer", args: new Array(1), result: integer }]],
    ["nested accessor function argument", [{ kind: "function-pointer", args: accessor, result: integer }]],
  ]) {
    assert.equal(classifications.heritageForTarget({ kind: "target-named", id: definition.id, typeArguments }) === undefined,
      true, caseName);
    assert.equal(getterReads, 0, caseName);
  }
});

test("native storage heritage rejects accessor selection and carrier records without evaluating getters", () => {
  const { classifications, definition } = fixture();
  const integer = { kind: "source-primitive", name: "int32" };
  let getterReads = 0;
  const selections = [];
  for (const key of ["kind", "id", "typeArguments"]) {
    const selected = { kind: "target-named", id: definition.id, typeArguments: [integer] };
    Object.defineProperty(selected, key, {
      enumerable: true,
      get() { getterReads += 1; throw new Error("native selection getter executed"); },
    });
    selections.push([`selection accessor ${key}`, selected]);
  }
  for (const key of ["kind", "name", "unused"]) {
    const carrier = { kind: "source-primitive", name: "int32" };
    Object.defineProperty(carrier, key, {
      enumerable: true,
      get() { getterReads += 1; throw new Error("native carrier getter executed"); },
    });
    selections.push([`carrier accessor ${key}`, { kind: "target-named", id: definition.id, typeArguments: [carrier] }]);
  }
  for (const [caseName, selected] of selections) {
    assert.equal(classifications.heritageForTarget(selected) === undefined, true, caseName);
    assert.equal(getterReads, 0, caseName);
  }
});

test("native storage heritage rejects non-data argument metadata and independent resource violations", () => {
  const { classifications, definition } = fixture();
  const integer = { kind: "source-primitive", name: "int32" };
  const symbolArguments = [integer];
  symbolArguments[Symbol("metadata")] = integer;
  const extraArguments = [integer];
  extraArguments.extra = integer;
  const customPrototypeArguments = [integer];
  Object.setPrototypeOf(customPrototypeArguments, Object.create(Array.prototype));
  const cycle = { kind: "array" };
  cycle.element = cycle;
  let deep = integer;
  for (let depth = 0; depth < 132; depth += 1) deep = { kind: "array", element: deep };
  for (const [caseName, typeArguments] of [
    ["symbol argument property", symbolArguments],
    ["extra argument property", extraArguments],
    ["custom argument prototype", customPrototypeArguments],
    ["non-data carrier member", [{ ...integer, callback() {} }]],
    ["cyclic carrier", [cycle]],
    ["excessive carrier depth", [deep]],
    ["excessive sparse array length", new Array(1_048_577)],
  ]) {
    assert.equal(classifications.heritageForTarget({ kind: "target-named", id: definition.id, typeArguments }) === undefined,
      true, caseName);
  }
});

test("native storage heritage isolates mutable carrier metadata while retaining exact declaration identity", () => {
  const { classifications, definition, declaration, parameter } = fixture();
  const integer = { kind: "source-primitive", name: "int64" };
  const arguments_ = [{ kind: "pointer", pointee: integer, mutability: "mut" }];
  const selected = { kind: "target-named", id: definition.id, typeArguments: arguments_ };
  const selection = classifications.heritageForTarget(selected);
  assert.equal(selection === undefined, false, "accepted dense carriers");
  const baseArgument = selection.baseType.typeArguments[0];
  const interfaceArgument = selection.interfaces[0].typeArguments[0];
  assert.equal(baseArgument === interfaceArgument, true, "shared exact carrier snapshot");
  assert.equal(baseArgument === arguments_[0], false, "caller storage is not published");
  assert.equal(Object.isFrozen(baseArgument), true, "immutable pointer carrier");
  assert.equal(Object.isFrozen(baseArgument.pointee), true, "immutable pointee carrier");
  integer.name = "float64";
  arguments_[0].mutability = "const";
  arguments_[0] = { kind: "source-primitive", name: "uint32" };
  selected.id = "other:Derived";
  assert.equal(baseArgument.kind, "pointer", "selected carrier kind");
  assert.equal(baseArgument.mutability, "mut", "selected permission");
  assert.equal(baseArgument.pointee.kind, "source-primitive", "selected pointee kind");
  assert.equal(baseArgument.pointee.name, "int64", "selected native width and signedness");
  assert.equal(selection.definition === definition, true, "selected definition identity");
  assert.equal(selection.definition.declaration === declaration, true, "selected declaration identity");
  assert.equal(classifications.heritageForDeclaration(declaration).baseType.typeArguments[0] === parameter,
    true, "authored binder identity");
});

test("native storage heritage preserves AST-backed projection identities in validated carriers", () => {
  const { classifications, definition } = fixture();
  const projectionDeclaration = {};
  projectionDeclaration.parent = projectionDeclaration;
  Object.freeze(projectionDeclaration);
  let sourceReads = 0;
  const sourceArgument = Object.freeze({
    get properties() { sourceReads += 1; throw new Error("opaque source type inspected"); },
  });
  const projected = {
    kind: "type-parameter", identity: "projection:Exact", name: "Exact",
    csharpProjection: {
      kind: "conditional", identity: "owner:Conditional", sourceName: "Conditional",
      declaration: projectionDeclaration, sourceArguments: [sourceArgument],
      arguments: [{ kind: "source-primitive", name: "uint64" }],
    },
  };
  const selection = classifications.heritageForTarget({
    kind: "target-named", id: definition.id, typeArguments: [projected],
  });
  assert.equal(selection === undefined, false, "accepted projected carrier");
  const result = selection.baseType.typeArguments[0];
  assert.equal(targetTypeRefEquals(result, projected), true, "exact binder identity");
  assert.equal(result.csharpProjection.declaration === projectionDeclaration, true, "exact projection declaration");
  assert.equal(result.csharpProjection.sourceArguments[0] === sourceArgument, true, "exact checked source type");
  assert.equal(result.csharpProjection.arguments[0].name, "uint64", "exact native projection argument");
  assert.equal(Object.isFrozen(result.csharpProjection), true, "immutable projection metadata");
  assert.equal(Object.isFrozen(result.csharpProjection.sourceArguments), true, "immutable source identity rows");
  assert.equal(sourceReads, 0, "opaque checked source type remains uninspected");
});
