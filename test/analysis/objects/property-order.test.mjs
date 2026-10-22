import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { createCsharpTargetConfiguration } from "../../../dist/compilation/configuration.js";
import { createCsharpObjectShapePropertyOrderIndex } from "../../../dist/analysis/objects/property-order.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { namedTargetTypeImplicitlyAccepts } from "../../../dist/policy/conversions/carriers.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { completeCsharpAnalysisRequest } from "../../helpers/analysis-request.mjs";

const analyzeCompletedCsharpProgram = request => analyzeCsharpTargetProgram(completeCsharpAnalysisRequest(request));

const noNativeImplementations = () => { throw new Error("An empty implementation domain cannot query a native relation"); };
const exactNativePolicy = { projectTypes: { directSupertypes: () => undefined },
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };
const canonicalNativeRelation = (source, target) => namedTargetTypeImplicitlyAccepts(exactNativePolicy, source, target, new Set());

function fixture(names = ["tail", "10", "2", "01"]) {
  const owner = { kind: "object", properties: [] };
  const members = names.map((name, ordinal) => {
    const declaration = { kind: "property", owner, range: { kind: "authored", start: ordinal * 10, end: ordinal * 10 + 5 } };
    owner.properties.push(declaration);
    return { sourceKey: { kind: "property", name }, sourceName: name, targetName: name,
      memberKind: "property", type: { kind: "source-primitive", name: "int64" }, sourceDeclarations: [declaration] };
  });
  const ast = {
    parent: node => node.owner,
    properties: node => node.properties,
    authoredRange: node => node.range,
    is: {
      IsObjectLiteralExpression: node => node.kind === "object",
      IsPropertyAssignment: node => node.kind === "property",
      IsShorthandPropertyAssignment: node => node.kind === "shorthand",
      IsMethodDeclaration: node => node.kind === "method",
      IsGetAccessorDeclaration: node => node.kind === "get",
      IsSetAccessorDeclaration: node => node.kind === "set",
      IsPropertySignatureDeclaration: node => node.kind === "signature",
    },
  };
  return { owner, ast, shape: { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "CheckedShape" }, members } };
}

test("closed declared fields admit only enumeration orders independent of source occurrence", () => {
  for (const names of [["value"], ["tail", "10", "2"], ["right", "left"]]) {
    const current = fixture(names);
    current.owner.kind = "type-literal";
    for (const member of current.shape.members) member.sourceDeclarations[0].kind = "signature";
    current.shape.targetType.csharpStructuralContract = true;
    const actual = fixture(names).shape;
    actual.targetType = { kind: "target-named", id: "tsonic.shape:actual", csharpAllowsRefLikeTypeArguments: [], csharpGeneratedStructuralStorage: true,
      csharpRender: { kind: "named", name: "Actual" } };
    actual.implements = [current.shape.targetType];
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [actual], canonicalNativeRelation);
    index.record(current.shape);
    index.seal();
    for (const projection of ["keys", "values", "entries"]) {
      const selected = index.propertyOrder(current.shape, undefined, projection);
      assert.equal(selected.kind === "resolved", names.length !== 2,
        `${projection}: exact closed fields cannot guess the order of two ordinary string keys`);
      if (selected.kind === "resolved") assert.equal(selected.propertyOrder.join(","),
        names.length === 1 ? "value" : "2,10,tail", `${projection}: numeric keys use the shared canonical native order`);
    }
  }
});

test("own-property analysis rejects the removed input form without completed native shapes", () => {
  assert.throws(() => createCsharpObjectShapePropertyOrderIndex({}, () => {}),
    /requires its completed native shape input/u, "the old two-argument form cannot invent an empty implementation domain");
  assert.throws(() => createCsharpObjectShapePropertyOrderIndex({}, () => {}, () => []),
    /requires its canonical native implementation relation/u, "a completed domain cannot guess native assignability");
});

test("a structural view cannot lend an exact own set to absent, wider or prototype implementations", () => {
  for (const variant of ["absent", "wider", "prototype", "foreign", "mixed"]) {
    const current = fixture(["value"]);
    current.owner.kind = "type-literal";
    current.shape.targetType.csharpStructuralContract = true;
    current.shape.members[0].sourceDeclarations[0].kind = "signature";
    const exact = fixture(["value"]).shape;
    exact.targetType = { kind: "target-named", id: "tsonic.shape:exact", csharpAllowsRefLikeTypeArguments: [], csharpGeneratedStructuralStorage: true,
      csharpRender: { kind: "named", name: "Exact" } };
    exact.implements = [current.shape.targetType];
    const actual = fixture(variant === "wider" || variant === "mixed" ? ["value", "extra"] : ["value"]).shape;
    actual.targetType = { kind: "target-named", id: "tsonic.shape:actual", csharpAllowsRefLikeTypeArguments: [], csharpGeneratedStructuralStorage: true,
      csharpRender: { kind: "named", name: "Actual" },
      ...(variant === "prototype" ? { csharpSourceDeclarationKind: "class" } : {}) };
    actual.implements = [{ ...current.shape.targetType, id: variant === "foreign" ? "Foreign" : current.shape.targetType.id }];
    const implementations = variant === "absent" ? [] : variant === "mixed" ? [exact, actual] : [actual];
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => implementations, canonicalNativeRelation);
    index.record(current.shape);
    index.seal();
    for (const projection of ["keys", "values", "entries", "has-own", "assign"]) {
      const selection = index.propertyOrder(current.shape, undefined, projection);
      assert.equal(selection.kind === "rejected", true, `${variant}/${projection}: every real own set must be proved`);
      assert.equal(selection.reason.includes("exact own-property set"), true, `${variant}/${projection}: precise owning proof`);
    }
    assert.equal(index.assignmentSourceOrder(current.shape).kind, "rejected", `${variant}: copying cannot invent an own set`);
  }
});

test("the exact own-set domain uses native covariance and complete nested generic instantiation", () => {
  const parameter = Object.freeze({ kind: "type-parameter", identity: "read:Value", name: "Value" });
  const named = (id, arguments_, options = {}) => csharpTargetNamedType(id, arguments_,
    { kind: "named", name: id.replaceAll(".", "_").replaceAll(":", "_") }, { allowsRefLikeTypeArguments: arguments_.map(() => false), ...options });
  const base = named("test.Base", [], { sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  const derived = named("test.Derived", [], { sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  const read = type => named("test.Read", [type], { structuralContract: true });
  const list = type => named("test.List", [type], { sourceDeclarationKind: "class" });
  const integer = { kind: "source-primitive", name: "int32" };
  const string = { kind: "source-primitive", name: "string" };
  for (const [label, targetArgument, sourceArgument, covariant, expected] of [
    ["closed reference covariance", base, derived, true, "rejected"],
    ["closed incompatible value", base, integer, true, "resolved"],
    ["native invariant declaration", base, derived, false, "resolved"],
    ["opposite native reference direction", derived, base, true, "resolved"],
    ["nested free source instantiation", list(string), list(parameter), false, "rejected"],
    ["nested free destination instantiation", list(parameter), list(string), false, "rejected"],
    ["unproved free compatibility", base, list(parameter), true, "rejected"],
  ]) {
    const current = fixture(["value"]);
    current.owner.kind = "type-literal";
    current.shape.targetType = read(targetArgument);
    current.shape.members[0] = { ...current.shape.members[0], type: targetArgument, readonly: true };
    current.shape.members[0].sourceDeclarations[0].kind = "signature";
    const template = { ...current.shape, targetType: read(parameter),
      covariantTypeParameterIdentities: covariant ? [parameter.identity] : [] };
    const implementation = (id, argument, names) => {
      const shape = fixture(names).shape;
      shape.targetType = named(`tsonic.shape:${id}`, [], { generatedStructuralStorage: true });
      shape.members[0] = { ...shape.members[0], type: argument };
      shape.implements = [read(argument)];
      return shape;
    };
    const exact = implementation("exact", targetArgument, ["value"]);
    const wider = implementation("wider", sourceArgument, ["value", "extra"]);
    const policy = { ...exactNativePolicy,
      projectTypes: { directSupertypes: type => targetTypeRefKey(type) === targetTypeRefKey(derived) ? [base] : undefined },
      objectShapes: { resolveNode: () => undefined, resolveTarget: type => type.id === template.targetType.id
        ? { ...template, targetType: type, declarationTemplate: template } : undefined } };
    const relation = (source, target) => namedTargetTypeImplicitlyAccepts(policy, source, target, new Set());
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [exact, wider], relation);
    index.record(current.shape);
    index.seal();
    for (const operation of ["keys", "values", "entries", "has-own"]) {
      assert.equal(index.propertyOrder(current.shape, undefined, operation).kind, expected,
        `${label}/${operation}: no native receiver is silently omitted or added by same-id guessing`);
    }
    assert.equal(index.assignmentSourceOrder(current.shape).kind, expected,
      `${label}: the readable assignment source consumes the same complete domain`);
  }
});

test("exact source occurrences preserve order independently of equal native carrier names", () => {
  const first = fixture();
  const second = fixture(["01", "tail", "2", "10"]);
  second.shape.targetType = first.shape.targetType;
  let rows = 0;
  const index = createCsharpObjectShapePropertyOrderIndex(first.ast, () => { rows += 1; }, () => [], noNativeImplementations);
  index.record(first.shape);
  index.record(first.shape);
  index.record(second.shape);
  assert.equal(rows, 2, "each exact native type/member-layout pair is classified once");
  assert.throws(() => index.propertyOrder(first.shape, first.owner, "keys"), /completed analysis/u);
  index.seal();
  first.ast.parent = () => { throw new Error("sealed lookup cannot analyze source"); };
  first.ast.properties = () => { throw new Error("sealed lookup cannot analyze source"); };
  first.ast.authoredRange = () => { throw new Error("sealed lookup cannot analyze source"); };
  for (const projection of ["keys", "values", "entries"]) {
    const left = index.propertyOrder(first.shape, undefined, projection);
    const right = index.propertyOrder(second.shape, undefined, projection);
    assert.deepEqual(left.propertyOrder, ["2", "10", "tail", "01"]);
    assert.deepEqual(right.propertyOrder, ["2", "10", "01", "tail"]);
    assert.equal(Object.isFrozen(left), true);
    assert.equal(Object.isFrozen(left.propertyOrder), true);
    assert.equal(index.propertyOrder({ ...first.shape, implements: [] }, undefined, projection) === left, true,
      "interface augmentation retains exact layout evidence");
    assert.equal(index.propertyOrder({ ...first.shape, targetType: { ...first.shape.targetType } }, undefined, projection).kind, "rejected",
      "equal-spelling foreign type objects cannot claim this proof");
    assert.equal(index.propertyOrder({ ...first.shape, members: [...first.shape.members] }, undefined, projection).kind, "rejected",
      "unregistered member evidence cannot claim this proof");
  }
  assert.throws(() => index.record(first.shape), /sealed/u);
  assert.throws(() => index.recordEmptyLiteral(first.owner), /sealed/u);
});

test("completed shared carriers retain exact authored occurrence orders without lending them to foreign shapes", () => {
  const first = fixture(["right", "left"]);
  const second = fixture(["left", "right"]);
  second.shape.targetType = first.shape.targetType;
  const merged = { targetType: first.shape.targetType,
    members: first.shape.members.map(member => ({ ...member, sourceDeclarations: [
      ...member.sourceDeclarations,
      ...second.shape.members.find(candidate => candidate.sourceName === member.sourceName).sourceDeclarations,
    ] })) };
  const index = createCsharpObjectShapePropertyOrderIndex(first.ast, () => {}, () => [], noNativeImplementations);
  index.record(first.shape);
  index.record(second.shape);
  index.record(merged);
  index.recordOccurrence(first.owner, first.shape, merged);
  index.recordOccurrence(second.owner, second.shape, merged);
  index.seal();
  first.ast.parent = () => { throw new Error("completed occurrences cannot read source owners"); };
  first.ast.properties = () => { throw new Error("completed occurrences cannot classify source properties"); };
  for (const projection of ["keys", "values", "entries"]) {
    const left = index.propertyOrder(merged, first.owner, projection);
    const right = index.propertyOrder(merged, second.owner, projection);
    assert.equal(left.kind === "resolved" && left.propertyOrder.join(",") === "right,left", true,
      `${projection}: the first authored occurrence retains its own sealed order`);
    assert.equal(right.kind === "resolved" && right.propertyOrder.join(",") === "left,right", true,
      `${projection}: the second authored occurrence retains its own sealed order`);
    for (const unknown of [undefined, { ...first.owner }]) {
      assert.equal(index.propertyOrder(merged, unknown, projection).kind, "rejected",
        `${projection}: an unproven occurrence cannot borrow a shared carrier's order`);
    }
    assert.equal(index.propertyOrder({ ...merged, members: [...merged.members] }, first.owner, projection).kind,
      "rejected", `${projection}: source identity cannot admit a foreign member layout`);
  }
  assert.throws(() => index.recordOccurrence(first.owner, first.shape, merged), /sealed/u);
});

test("empty enumeration requires its exact admitted empty literal without a shape-node cross product", () => {
  const current = fixture([]);
  const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [], noNativeImplementations);
  index.record(current.shape);
  index.recordEmptyLiteral(current.owner);
  index.seal();
  current.ast.properties = () => { throw new Error("empty occurrence evidence must already be complete"); };
  for (const projection of ["keys", "values", "entries"]) {
    assert.deepEqual(index.propertyOrder(current.shape, current.owner, projection).propertyOrder, []);
    for (const source of [undefined, { ...current.owner }, { kind: "identifier" }]) {
      assert.equal(index.propertyOrder(current.shape, source, projection).kind, "rejected");
    }
  }
  assert.equal(index.propertyOrder(current.shape, undefined, "has-own").kind, "resolved");
  assert.equal(index.assignmentSourceOrder(current.shape).kind, "resolved");
});

test("merged, spread and unauthored property evidence never borrows another occurrence's order", () => {
  for (const mutation of ["merged", "spread", "unauthored", "duplicate-range"]) {
    const current = fixture(["left", "right"]);
    if (mutation === "merged") current.shape.members[0].sourceDeclarations.push(fixture(["left"]).shape.members[0].sourceDeclarations[0]);
    if (mutation === "spread") current.owner.properties.push({ kind: "spread" });
    if (mutation === "unauthored") current.shape.members[0].sourceDeclarations[0].range = { kind: "synthesized" };
    if (mutation === "duplicate-range") current.shape.members[1].sourceDeclarations[0].range = current.shape.members[0].sourceDeclarations[0].range;
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [], noNativeImplementations);
    index.record(current.shape);
    index.seal();
    for (const projection of ["keys", "values", "entries"]) {
      assert.equal(index.propertyOrder(current.shape, current.owner, projection).kind, "rejected", mutation);
    }
  }
});

test("accessor arrangements and assignment input versus destination contracts stay distinct", () => {
  for (const withSetter of [false, true]) {
    const current = fixture(["value"]);
    const field = current.shape.members[0];
    field.accessor = { getter: true, setter: withSetter };
    field.sourceDeclarations[0].kind = "get";
    if (withSetter) {
      const setter = { kind: "set", owner: current.owner, range: { kind: "authored", start: 5, end: 9 } };
      field.sourceDeclarations.push(setter);
      current.owner.properties.push(setter);
    }
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [], noNativeImplementations);
    index.record(current.shape);
    index.seal();
    assert.equal(index.propertyOrder(current.shape, undefined, "keys").kind, "resolved");
    assert.equal(index.propertyOrder(current.shape, undefined, "assign").kind, "rejected");
    assert.equal(index.assignmentSourceOrder(current.shape).kind, "rejected");
  }
  const readonly = fixture(["value"]);
  readonly.shape.members[0].readonly = true;
  const index = createCsharpObjectShapePropertyOrderIndex(readonly.ast, () => {}, () => [], noNativeImplementations);
  index.record(readonly.shape);
  index.seal();
  assert.equal(index.assignmentSourceOrder(readonly.shape).kind, "resolved", "readonly data remains readable as a source");
  assert.equal(index.propertyOrder(readonly.shape, undefined, "assign").kind, "rejected", "readonly data is not writable target storage");
});

test("nominal and optional restrictions retain every operation's own proof", () => {
  // Generated member names are allocated collision-free (e061b7d2), so an authored name can no longer reserve one.
  for (const mutation of ["nominal", "optional", "malformed-accessor"]) {
    const current = fixture(["value"]);
    if (mutation === "nominal") current.shape.targetType.csharpSourceDeclarationKind = "class";
    if (mutation === "optional") current.shape.members[0].optional = true;
    if (mutation === "malformed-accessor") current.shape.members[0].accessor = { getter: true, setter: true };
    const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => {}, () => [], noNativeImplementations);
    index.record(current.shape);
    index.seal();
    assert.equal(index.propertyOrder(current.shape, undefined, "keys").kind, mutation === "optional" ? "resolved" : "rejected", mutation);
    assert.equal(index.propertyOrder(current.shape, undefined, "has-own").kind, mutation === "malformed-accessor" ? "resolved" : "rejected", mutation);
    assert.equal(index.propertyOrder(current.shape, undefined, "assign").kind, "rejected", mutation);
    assert.equal(index.assignmentSourceOrder(current.shape).kind, "rejected", mutation);
  }
});

test("order construction remains accounted and an unadmitted selection fails closed", () => {
  const current = fixture();
  const index = createCsharpObjectShapePropertyOrderIndex(current.ast, () => { throw new Error("bounded classification exhausted"); }, () => [], noNativeImplementations);
  assert.throws(() => index.record(current.shape), /bounded classification exhausted/u);
  index.seal();
  assert.equal(index.propertyOrder(current.shape, undefined, "keys").kind, "rejected");
  assert.equal(index.assignmentSourceOrder(current.shape).kind, "rejected");
});

test("repeated carriers classify published occurrences and the final merge, never unpublished merge histories", () => {
  const occurrences = Array.from({ length: 64 }, () => fixture(["value"]));
  const targetType = occurrences[0].shape.targetType;
  const shapes = new Map(occurrences.map(current => {
    current.shape.targetType = targetType;
    return [current.owner, current.shape];
  }));
  const file = { kind: "source-file" };
  let parentReads = 0;
  const ast = { ...occurrences[0].ast,
    parent(node) { parentReads += 1; return node.owner; },
    forEachChild(node, visit) { if (node === file) for (const current of occurrences) visit(current.owner); },
  };
  const builder = analyzeCsharpObjectShapes({ ast, sourceFiles: [file], typeDefinitions: {},
    projectTypes: { directSupertypes: () => undefined },
    semantics: () => ({ operations: { objectLiteralElement: () => undefined } }),
    objectShapes: {
      resolveNode: node => shapes.get(node), resolveType: () => undefined,
      resolveTarget: () => undefined, resolveCopyShape: () => undefined,
      resolveObjectLiteralTargetShape: (_expected, literal) => ({ kind: "resolved", shape: shapes.get(literal) }),
    },
  }, { targetTypes: [],
    compileTimeMetadata: Object.freeze({ get: () => false }),
    contextualType: Object.freeze({ get: () => undefined }) },
  { selectedCall: Object.freeze({ get: () => undefined }),
    selectedConstruction: Object.freeze({ get: () => undefined }) });
  for (let index = 0; index < occurrences.length; index += 1) {
    assert.equal(builder.registerStructuralInterface({}, targetType, targetType), false,
      "a Boolean-only registration does not publish its intermediate merge inputs");
  }
  const classifications = builder.seal();
  assert.equal(parentReads, 4 * occurrences.length,
    "three exact occurrence owner reads plus one final merged declaration read each; no quadratic history retention");
  for (const current of occurrences) {
    const selected = classifications.resolveNode(current.owner);
    assert.equal(selected !== undefined, true);
    assert.deepEqual(classifications.propertyOrder(selected, current.owner, "keys").propertyOrder, ["value"]);
  }
  const merged = classifications.resolveTarget(targetType);
  assert.equal(merged !== undefined, true);
  assert.equal(classifications.propertyOrder(merged, undefined, "keys").kind, "rejected",
    "the final merged carrier never borrows one occurrence's authored order");
});

test("checked source publishes occurrence-specific and accessor orders before source readers become unavailable", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
export function project(): string {
  const first = { tail: "tail", 10: "ten", 2: "two", "01": "leading" };
  const second = { "01": "leading", tail: "tail", 2: "two", 10: "ten" };
  let backing = "value";
  const accessed = {
    tail: "tail",
    get current(): string { return backing; },
    set current(next: string) { backing = next; },
  };
  return Object.keys(first).join(",") + Object.keys(second).join(",") + Object.keys(accessed).join(",");
}` });
  assertCsharpCheckingSucceeded(checked);
  const original = createTargetSourceProgram(checked.source);
  let sealed = false;
  const source = { ...original, ast: { ...original.ast,
    ...Object.fromEntries(["parent", "properties", "authoredRange"].map(name => [name, (...arguments_) => {
      assert.equal(sealed, false, `${name} is an analysis-only own-property input`);
      return original.ast[name](...arguments_);
    }])),
  } };
  const analysis = analyzeCompletedCsharpProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assert.equal(analysis.diagnostics.length, 0);
  const literals = [];
  const visit = node => {
    if (source.ast.is.IsObjectLiteralExpression(node)) literals.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  assert.equal(literals.length, 3);
  sealed = true;
  const orders = [["2", "10", "tail", "01"], ["2", "10", "01", "tail"], ["tail", "current"]];
  for (const [ordinal, literal] of literals.entries()) {
    const shape = analysis.value.objectShapes.resolveNode(literal);
    assert.equal(shape !== undefined, true, `checked object occurrence ${ordinal}`);
    for (const projection of ["keys", "values", "entries"]) {
      const selection = analysis.value.objectShapes.propertyOrder(shape, literal, projection);
      assert.equal(selection.kind, "resolved", `${projection} occurrence ${ordinal}`);
      assert.deepEqual(selection.propertyOrder, orders[ordinal]);
      assert.equal(Object.isFrozen(selection), true);
      assert.equal(Object.isFrozen(selection.propertyOrder), true);
    }
    assert.equal(analysis.value.objectShapes.propertyOrder({ ...shape, members: [...shape.members] }, literal, "keys").kind,
      "rejected", "unadmitted evidence cannot reconstruct an order after sealing");
  }
});
