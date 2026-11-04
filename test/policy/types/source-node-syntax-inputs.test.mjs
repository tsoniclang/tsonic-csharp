import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpNodeTypeSyntaxSource, assertCsharpNodeTypeSyntaxSource } from "../../../dist/analysis/source-evidence/types/resolution/node-syntax-source.js";
import { resolveFormedCsharpNodeSyntaxChild } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

function fixture(kind, nullable = false) {
  const unit = { node: {}, file: {}, annotationNode: {}, nestedNode: {}, observations: [], children: [],
    typeCarrier: undefined, valueResult: undefined };
  unit.queries = { sourceFile: unit.file };
  unit.state = { depth: 6, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
    rejectNativeResolution: () => assert.fail("these synthetic syntax leaves have no rejection") };
  const is = expected => node => {
    assert.equal(node === unit.node, true);
    return kind === expected;
  };
  const nested = node => {
    assert.equal(node === unit.node, true);
    unit.observations.push("nested");
    return { Type: unit.nestedNode };
  };
  unit.host = { ast: { is: {
    IsPropertyDeclaration: is("property"), IsPropertySignatureDeclaration: is("property-signature"),
    IsParameterDeclaration: is("parameter"), IsNamedTupleMember: is("named-tuple"),
    IsParenthesizedTypeNode: is("parenthesized"), IsOptionalTypeNode: is("optional"), IsRestTypeNode: is("rest"),
    IsTypeOperatorNode: node => {
      assert.equal(node === unit.node, true);
      return kind === "readonly" || kind === "other-operator";
    },
  }, as: { AsNamedTupleMember: nested, AsParenthesizedTypeNode: nested, AsOptionalTypeNode: nested,
    AsRestTypeNode: nested, AsTypeOperatorNode: nested }, typeNode(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("annotation");
    return unit.annotationNode;
  }, questionToken(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("question");
    return nullable ? {} : undefined;
  }, operatorKindName(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("operator");
    return kind === "readonly" ? "KindReadonlyKeyword" : "KindKeyOfKeyword";
  } } };
  return unit;
}

function capture(unit) {
  unit.source = formCsharpNodeTypeSyntaxSource({ host: unit.host }, unit.node, unit.queries, unit.state);
  assertCsharpNodeTypeSyntaxSource(unit.source);
  return unit.source;
}

function nativeScope(unit, source, expected) {
  const complete = (kind, node, file, state) => {
    assert.equal(kind === expected && node === source.typeNode && node === source.child.node && file === unit.file && state === source.child.state, true);
    assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.state.sourceStorageSubject, true);
    assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings &&
      state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
    unit.children.push(kind);
    return kind === "type" ? unit.typeCarrier : unit.valueResult;
  };
  return { resolveNodeWithState: (...args) => complete("type", ...args),
    resolveNodeValueWithState: (...args) => complete("value", ...args) };
}

test("synthetic node syntax keeps actual annotations and genuine absence before Native work", () => {
  for (const kind of ["property", "property-signature", "parameter"]) {
    const unit = fixture(kind, true);
    const source = capture(unit);
    assert.equal(source.node === unit.node && source.queries === unit.queries && source.state === unit.state, true);
    assert.equal(source.annotation.kind === "annotation" && source.annotation.node === unit.node && source.annotation.typeNode === unit.annotationNode, true);
    assert.equal(source.annotation.child.node === unit.annotationNode && source.annotation.child.sourceFile === unit.file && source.annotation.nullable, true);
    assert.equal(source.annotation.child.state.depth === unit.state.depth + 1 && source.nested === undefined, true);
    assert.deepEqual(unit.observations, ["annotation", "question"]);
    assert.deepEqual(unit.children, []);
  }
  const missing = fixture("parameter", true);
  missing.annotationNode = undefined;
  const noAnnotation = capture(missing);
  assert.equal(noAnnotation.annotation === undefined && noAnnotation.nested === undefined, true);
  assert.deepEqual(missing.observations, ["annotation"]);
  for (const kind of ["other", "other-operator"]) {
    const unit = fixture(kind);
    const source = capture(unit);
    assert.equal(source.annotation === undefined && source.nested === undefined, true);
    assert.deepEqual(unit.observations, kind === "other" ? [] : ["operator"]);
  }
});

test("synthetic transparent type syntax forwards the exact Native value receipt without Source reads", () => {
  const nativeType = csharpSourcePrimitiveTargetType("int64");
  const selectedType = csharpSourcePrimitiveTargetType("int32");
  for (const kind of ["named-tuple", "parenthesized", "rest", "readonly"]) {
    const unit = fixture(kind);
    unit.valueResult = Object.freeze({ nativeType, selectedType });
    const source = capture(unit);
    assert.equal(source.annotation === undefined && source.nested.kind === kind && source.nested.typeNode === unit.nestedNode, true);
    const observations = [...unit.observations];
    unit.host.ast = undefined;
    assert.equal(resolveFormedCsharpNodeSyntaxChild(nativeScope(unit, source.nested, "value"), source.nested) === unit.valueResult, true);
    assert.deepEqual(unit.children, ["value"]);
    assert.deepEqual(unit.observations, observations);
  }
});

test("synthetic annotation and optional children keep the nullable policy and unavailable stop", () => {
  const element = csharpSourcePrimitiveTargetType("int64");
  for (const [kind, nullable] of [["property", false], ["parameter", true], ["optional", true]]) {
    for (const available of [true, false]) {
      const unit = fixture(kind, nullable);
      unit.typeCarrier = available ? element : undefined;
      const source = capture(unit);
      const child = source.annotation ?? source.nested;
      unit.host.ast = undefined;
      const result = resolveFormedCsharpNodeSyntaxChild(nativeScope(unit, child, "type"), child);
      assert.equal(available ? nullable ? getCsharpNullableElementTargetType(result?.nativeType) === element
        : result?.nativeType === element : result === undefined, true);
      assert.equal(result === undefined || result.selectedType === result.nativeType, true);
      assert.deepEqual(unit.children, ["type"]);
    }
  }
  const absent = fixture("rest");
  absent.nestedNode = undefined;
  const source = capture(absent);
  assert.equal(Object.prototype.hasOwnProperty.call(source.nested, "typeNode") && source.nested.typeNode === undefined && source.nested.child.node === undefined, true);
  absent.host.ast = undefined;
  assert.equal(resolveFormedCsharpNodeSyntaxChild(nativeScope(absent, source.nested, "value"), source.nested) === undefined, true);
  assert.deepEqual(absent.children, ["value"]);
});

test("synthetic syntax rejects foreign, rebound or retired requests before Native children", () => {
  const unit = fixture("readonly");
  const source = capture(unit);
  const child = source.nested;
  const retired = { ...child };
  delete retired.typeNode;
  const scope = { resolveNodeWithState: () => assert.fail("invalid syntax Source must fail before a Native type child"),
    resolveNodeValueWithState: () => assert.fail("invalid syntax Source must fail before a Native value child") };
  for (const invalid of [undefined, retired, { ...child, kind: "retired" }, { ...child, child: undefined },
    { ...child, child: { ...child.child, node: {} } }, { ...child, child: { ...child.child, sourceFile: {} } },
    { ...child, child: { ...child.child, state: { ...child.child.state, depth: unit.state.depth } } },
    { ...child, child: { ...child.child, state: { ...child.child.state, sourceBindings: new Map() } } },
    { ...child, child: { ...child.child, state: { ...child.child.state, sourceStorageSubject: {} } } },
  ]) assert.throws(() => resolveFormedCsharpNodeSyntaxChild(scope, invalid), /exact retained Source occurrence and original child state/);
  const missingSelection = { ...source };
  delete missingSelection.annotation;
  assert.throws(() => assertCsharpNodeTypeSyntaxSource(missingSelection), /exact annotation and nested-type Source selections/);
  assert.throws(() => assertCsharpNodeTypeSyntaxSource({ ...source, nested: { ...child, node: {} } }), /exact annotation and nested-type Source selections/);
  assert.throws(() => assertCsharpNodeTypeSyntaxSource({ ...source, nested: { ...child, kind: "annotation", nullable: false } }), /exact annotation and nested-type Source selections/);
});
