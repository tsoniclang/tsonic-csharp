import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { renderObjectShapeProjectionMethods } from "../../../dist/backend/planner/objects/closed-object-shapes.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/object-shape-demand.js";
import { csharpStringTargetType, csharpTsValueTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/index.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { objectShapeProjectionDeclaration } from "../../../dist/analysis/objects/native-demand-declarations.js";
import { printCsharpCompilationUnit } from "../../../dist/print/source/index.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const integer = { kind: "source-primitive", name: "int32" };
const text = csharpStringTargetType();
const parameter = { kind: "type-parameter", identity: "Projection:Value", name: "Value",
  csharpConstraints: { kind: "resolved", constraints: [] } };
const target = argument => ({ kind: "target-named", id: "tsonic.shape:Projection", typeArguments: [argument],
  csharpAllowsRefLikeTypeArguments: [false], csharpRender: { kind: "named", name: "Projection", genericArity: 1 } });
const field = type => ({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  memberKind: "property", type });

function fixture(arguments_ = [integer, text], selectedConversion) {
  const declaration = { targetType: target(parameter), members: [field(parameter)] };
  const instances = arguments_.map(argument => ({ targetType: target(argument), members: [field(argument)], declarationTemplate: declaration }));
  const byType = new Map([declaration, ...instances].map(fact => [targetTypeRefKey(fact.targetType), fact]));
  const conversions = [];
  const host = {
    ast: {}, names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get(source, destination) {
      conversions.push([source, destination]);
      return selectedConversion === undefined
        ? targetTypeRefEquals(source, destination) ? { kind: "identity" } : undefined
        : selectedConversion(source, destination);
    } } },
    objectShapes: { targetShapes: Object.freeze(Object.fromEntries(byType)),
      resolveTarget: type => byType.get(targetTypeRefKey(type)), resolveNode: () => undefined,
      propertyOrder: () => ({ kind: "resolved", propertyOrder: ["value"] }),
      assignmentSourceOrder: () => ({ kind: "resolved", propertyOrder: ["value"] }),
    },
  };
  return { declaration, instances, host, conversions, engine: createCsharpObjectShapeDemandEngine(host) };
}

function resultType(kind, receiver) {
  if (kind === "assign") return receiver.targetType;
  if (kind === "has-own") return { kind: "source-primitive", name: "bool" };
  return csharpJsArrayTargetType(kind === "keys" ? text : kind === "entries"
    ? { kind: "tuple", elements: [text, receiver.members[0].type] } : receiver.members[0].type);
}

for (const reversed of [false, true]) for (const kind of ["assign", "keys", "values", "entries", "has-own"]) {
  test(`${kind}: two closed native receivers retain one exact generic declaration in ${reversed ? "reverse" : "forward"} order`, () => {
    const current = fixture();
    const requests = [];
    for (const receiver of reversed ? [...current.instances].reverse() : current.instances) {
      const subject = {};
      const request = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, kind,
        resultType(kind, receiver), "object-shape", kind === "assign" ? { node: {}, type: receiver.targetType } : undefined);
      assert.equal(request.kind === "accepted" && request.projection !== undefined, true, "the complete typed source projection is admitted");
      requests.push({ receiver, subject, selection: request.projection });
    }
    const publication = current.engine.seal();
    const artifact = publication.get(objectShapeArtifactKey(current.declaration));
    assert.equal(artifact.fact === current.declaration && artifact.projections.length === 2, true, "one physical generic declaration contains both exact methods");
    const readsBeforeRendering = current.conversions.length;
    const diagnostics = [];
    const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map() } }, artifact.projections, diagnostics);
    assert.equal(diagnostics.length === 0 && methods.length === 2, true, "both nonempty closed contracts render without substituting a concrete field into its generic template");
    assert.equal(new Set(methods.map(method => method.name)).size, 2, "receiver identity participates in native method identity");
    for (const request of requests) {
      const binding = publication.projection(request.subject);
      const method = methods.find(method => method.name === binding.methodName);
      assert.equal(binding.receiver === request.receiver && binding.selection === request.selection, true, "source-site selection and native receiver retain their original exact identities");
      assert.equal(artifact.projections.includes(binding) && Object.isFrozen(binding) && Object.isFrozen(binding.conversions), true,
        "source and declaration consume the same immutable physical binding");
      assert.equal(Object.isFrozen(binding.memberBindings) && binding.memberBindings.length === 1 &&
        Object.isFrozen(binding.memberBindings[0]) && binding.memberBindings[0].target === request.receiver.members[0], true,
      "the exact ordered native member is selected once before publication");
      assert.equal(binding.memberBindings[0].source === request.receiver.members[0], true,
        "the assignment source or enumeration source retains its actual checked native identity");
      assert.equal(method.modifiers.includes("static") && method.parameters[0].name === "receiver", true, "the native method receives its exact receiver explicitly");
      assert.equal(method.parameters[0].type.typeArguments[0].name === (request.receiver.members[0].type === integer ? "int" : "string"), true,
        "the physical receiver uses its actual closed native field carrier");
      if (kind === "assign") assert.equal(method.body.statements.at(-1).expression.name, "receiver", "assignment returns the same native receiver without a cast or copy");
    }
    assert.equal(current.conversions.length, readsBeforeRendering, "rendering consumes admitted conversions, never a late conversion query");
  });
}

test("partially open projections close every actual free native binder and preserve its constraints", () => {
  const dependency = { kind: "type-parameter", identity: "Caller:Constraint", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const free = { kind: "type-parameter", identity: "Caller:Value", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: dependency }] } };
  const current = fixture([free]);
  const subject = {};
  const receiver = current.instances[0];
  assert.equal(current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, "assign", receiver.targetType,
    "object-shape", { node: {}, type: receiver.targetType }).kind, "accepted");
  const publication = current.engine.seal();
  const binding = publication.projection(subject);
  assert.equal(binding.typeParameters.length, 2, "a constraint dependency is an actual required native binder");
  assert.equal(binding.typeParameters.some(selected => selected.identity === free.identity) &&
    binding.typeParameters.some(selected => selected.identity === dependency.identity), true, "source identities are retained without guessing substitutions");
  assert.equal(new Set(binding.typeParameterNames.map(selected => selected.name)).size, 2, "method binder names do not collide with each other");
  assert.equal(binding.typeParameterNames.every(selected => selected.name !== "Value"), true, "method names do not shadow the declaration binder");
  const diagnostics = [];
  const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map([[parameter.identity, "Value"]]) } }, [binding], diagnostics);
  assert.equal(diagnostics.length, 0);
  assert.equal(methods[0].typeParameters.length, 2);
  assert.equal(methods[0].typeParameters.some(selected => selected.constraints?.some(constraint => constraint.kind === "KeywordConstraint" &&
    constraint.keyword === "class")), true, "native reference constraints survive exactly");
  assert.equal(methods[0].typeParameters.some(selected => selected.constraints?.some(constraint => constraint.kind === "TypeConstraint")), true,
    "the exact native dependent constraint survives publication and rendering");
});

test("typed projection admission refuses missing and source-dependent conversions before publication", () => {
  for (const conversion of [() => undefined, () => ({ kind: "rejected", reason: "unproven exact field conversion" }),
    () => ({ kind: "cast", proof: "numeric" })]) {
    const current = fixture([integer], conversion);
    const subject = {};
    const receiver = current.instances[0];
    const request = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, "values",
      resultType("values", receiver), "object-shape");
    assert.equal(request.kind, "rejected", "an unproven field conversion is not a renderer fallback");
    assert.equal(current.engine.seal().projection(subject) === undefined, true, "a rejected projection publishes no physical method");
  }
});

const invalidResults = [
  ["keys", "scalar", integer],
  ["keys", "non-string element", csharpJsArrayTargetType(integer)],
  ["keys", "native array", { kind: "array", element: text }],
  ["values", "scalar", integer],
  ["values", "native array", { kind: "array", element: integer }],
  ["entries", "scalar", integer],
  ["entries", "non-tuple element", csharpJsArrayTargetType(integer)],
  ["entries", "non-string key", csharpJsArrayTargetType({ kind: "tuple", elements: [integer, text] })],
  ["entries", "missing value", csharpJsArrayTargetType({ kind: "tuple", elements: [text] })],
  ["entries", "extra value", csharpJsArrayTargetType({ kind: "tuple", elements: [text, integer, integer] })],
  ["has-own", "numeric result", integer],
  ["has-own", "text result", text],
];

for (const [kind, label, result] of invalidResults) test(`${kind}: ${label} is refused by the native projection owner before publication`, () => {
  const current = fixture([integer], () => ({ kind: "identity" }));
  const subject = {};
  const receiver = current.instances[0];
  const selected = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, kind, result, "object-shape");
  assert.equal(selected.kind, "rejected", `${kind}: a wrong result carrier never reaches rendering`);
  const published = current.engine.seal();
  assert.equal(published.projection(subject) === undefined && published.artifacts.length === 0, true,
    `${kind}: refusal cannot partially publish an artifact or projection`);
});

for (const kind of ["keys", "values", "entries", "has-own", "assign"]) {
  test(`${kind}: an unrenderable result is refused by admission without renderer diagnostics`, () => {
    const current = fixture([integer], () => ({ kind: "identity" }));
    const receiver = current.instances[0];
    const subject = {};
    const result = { kind: "opaque", description: "unrenderable native projection result" };
    const selected = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, kind, result, "object-shape",
      kind === "assign" ? { node: {}, type: receiver.targetType } : undefined);
    assert.equal(selected.kind, "rejected", `${kind}: exact result representation is required before publication`);
    const published = current.engine.seal();
    assert.equal(published.projection(subject) === undefined && published.artifacts.length === 0, true,
      `${kind}: no source-rejected method is present in the sealed input`);
  });
}

for (const kind of ["keys", "values", "entries", "has-own", "assign"]) {
  test(`${kind}: an unrenderable receiver is refused by the native projection owner`, () => {
    const current = fixture([integer]);
    const receiver = current.instances[0];
    receiver.targetType.csharpRender = { kind: "named", name: "invalid-native-name", genericArity: 1 };
    const subject = {};
    const selected = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, kind,
      resultType(kind, receiver), "object-shape", kind === "assign" ? { node: {}, type: receiver.targetType } : undefined);
    assert.equal(selected.kind, "rejected", `${kind}: a selected carrier with no C# identifier is not admitted`);
    assert.equal(current.engine.seal().projection(subject) === undefined, true, `${kind}: no invalid native receiver is published`);
  });
}

test("Object.assign preserves writable synthetic native storage behind a readonly source view", () => {
  const current = fixture([integer]);
  const receiver = current.instances[0];
  receiver.members[0].readonly = true;
  const subject = {};
  const selected = current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, "assign", receiver.targetType,
    "object-shape", { node: {}, type: receiver.targetType });
  assert.equal(selected.kind, "accepted", "a source readonly view is not proof of a native readonly field");
  const published = current.engine.seal().projection(subject);
  assert.equal(published.receiver === receiver && published.memberBindings[0].target === receiver.members[0], true,
    "the actual synthetic field remains the selected native assignment target");
});

for (const kind of ["keys", "values", "entries", "has-own"]) test(`${kind}: readonly readable data is still admitted without a store`, () => {
  const current = fixture([integer]);
  const receiver = current.instances[0];
  receiver.members[0].readonly = true;
  const subject = {};
  assert.equal(current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, kind,
    resultType(kind, receiver), "object-shape").kind, "accepted", "a native read is independent of field writability");
  assert.equal(current.engine.seal().projection(subject).receiver === receiver, true, "readonly native identity is retained");
});

for (const kind of ["keys", "values", "entries", "has-own"]) test(`${kind}: method-value capability is demanded only by value-producing enumeration`, () => {
  const methodType = csharpDelegateTargetType("System.Func", [], integer);
  const receiverType = { kind: "target-named", id: "tsonic.shape:MethodProjection", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "MethodProjection" } };
  const member = { sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type: methodType };
  const receiver = { targetType: receiverType, members: [member] };
  const host = {
    ast: {}, names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() { return { kind: "js-value-box" }; } } },
    objectShapes: { targetShapes: Object.freeze({ [targetTypeRefKey(receiverType)]: receiver }),
      resolveTarget: type => targetTypeRefEquals(type, receiverType) ? receiver : undefined,
      resolveNode: () => receiver, propertyOrder: () => ({ kind: "resolved", propertyOrder: ["read"] }),
    },
  };
  const result = kind === "has-own" ? { kind: "source-primitive", name: "bool" }
    : csharpJsArrayTargetType(kind === "keys" ? text : kind === "entries"
      ? { kind: "tuple", elements: [text, csharpTsValueTargetType()] } : csharpTsValueTargetType());
  const engine = createCsharpObjectShapeDemandEngine(host);
  const subject = {};
  assert.equal(engine.requireObjectShapeProjection(subject, receiverType, {}, kind, result, "object-shape").kind, "accepted",
    "the exact structural method value remains a supported native demand");
  const artifact = engine.seal().get(objectShapeArtifactKey(receiver));
  assert.equal(artifact.capabilities.includes("method-values"), kind === "values" || kind === "entries",
    "keys and has-own never request copied callable storage; values and entries publish their required method surface");
});

test("a corrupted admitted projection is an internal invariant, never a second source-rejection route", () => {
  const current = fixture([integer]);
  const receiver = current.instances[0];
  const subject = {};
  assert.equal(current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, "keys", resultType("keys", receiver), "object-shape").kind,
    "accepted", "the original checked native projection is admitted");
  const original = current.engine.seal().projection(subject);
  const corrupted = { ...original, selection: { ...original.selection, resultType: integer } };
  const diagnostics = [];
  assert.throws(() => renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map() } }, [corrupted], diagnostics),
    /admitted object-shape projection.*inconsistent native rendering contract/u, "only corrupted post-seal evidence reaches the invariant route");
  assert.equal(diagnostics.length, 0, "the backend cannot invent a source diagnostic after admission");
});

test("projection source identity cannot silently switch its admitted native receiver", () => {
  const current = fixture();
  const subject = {};
  const first = current.instances[0];
  const second = current.instances[1];
  assert.equal(current.engine.requireObjectShapeProjection(subject, first.targetType, {}, "keys", resultType("keys", first), "object-shape").kind, "accepted");
  const wrong = current.engine.requireObjectShapeProjection(subject, second.targetType, {}, "keys", resultType("keys", second), "object-shape");
  assert.equal(wrong.kind, "rejected", "identical key results are not proof of a different native receiver");
  assert.equal(current.engine.seal().projection(subject).receiver === first, true, "the original receiver identity is never replaced");
});

function projectedParameter(kind) {
  const dependency = { kind: "type-parameter", identity: `Caller:${kind}:Source`, name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const projection = csharpProjectedType(kind === "optional"
    ? { kind: "optional", part: "storage", arguments: [dependency] }
    : { kind: "conditional", declaration: {}, identity: "Caller:Conditional", sourceName: "Selected",
      sourceArguments: [], arguments: [dependency] });
  return { dependency, projected: { ...projection, csharpConstraints: { kind: "resolved",
    constraints: kind === "conditional" ? [{ kind: "type", type: dependency }] : [] } } };
}

for (const kind of ["optional", "conditional"]) for (const reversed of [false, true]) {
  test(`${kind} physical projections bind their emitted native parameter in ${reversed ? "reverse" : "forward"} order`, () => {
    const { projected, dependency } = projectedParameter(kind);
    const current = fixture([projected, integer]);
    const subjects = [];
    for (const receiver of reversed ? [...current.instances].reverse() : current.instances) {
      for (const projection of ["assign", "keys", "values", "entries", "has-own"]) {
        const subject = {};
        assert.equal(current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, projection,
          resultType(projection, receiver), "object-shape", projection === "assign" ? { node: {}, type: receiver.targetType } : undefined).kind,
        "accepted", "the actual optional or conditional carrier has an admitted physical operation");
        subjects.push({ subject, receiver });
      }
    }
    const published = current.engine.seal();
    for (const { subject, receiver } of subjects) {
      const binding = published.projection(subject);
      assert.equal(binding.receiver === receiver, true, "physical receiver identity is unchanged");
      assert.equal(binding.typeParameters.some(parameter => parameter.identity === projected.identity), receiver.members[0].type === projected,
        "the rendered physical projection parameter itself, not just its source dependency, is bound");
      if (receiver.members[0].type === projected) {
        assert.equal(binding.typeParameters.some(parameter => parameter.identity === dependency.identity), kind === "conditional",
          "only an actual emitted constraint dependency becomes an additional native binder");
      }
      const diagnostics = [];
      const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map() } }, [binding], diagnostics);
      assert.equal(diagnostics.length === 0 && methods.length === 1, true, "the full physical binder environment is renderable");
      if (receiver.members[0].type === projected) {
        const name = binding.typeParameterNames.find(parameter => parameter.identity === projected.identity).name;
        assert.equal(methods[0].parameters[0].type.typeArguments[0].name, name,
          "the receiver uses the exact bound physical parameter name");
      }
    }
  });
}

test("a projected parameter already owned by the declaration is not redeclared by its physical method", () => {
  const { projected } = projectedParameter("optional");
  const receiver = { targetType: target(projected), members: [field(projected)] };
  const selected = { kind: "has-own", resultType: { kind: "source-primitive", name: "bool" }, propertyOrder: ["value"] };
  const binding = objectShapeProjectionDeclaration(receiver, selected, [{ identity: projected.identity, name: "Storage" }], [],
    [{ source: receiver.members[0], target: receiver.members[0] }]);
  assert.equal(binding.typeParameters.length, 0, "the existing class binder satisfies the emitted physical parameter");
  const diagnostics = [];
  const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map([[projected.identity, "Storage"]]) } }, [binding], diagnostics);
  assert.equal(diagnostics.length, 0);
  assert.equal(methods[0].parameters[0].type.typeArguments[0].name, "Storage", "no source dependency is substituted for the physical class binder");
});

test("physical projection publication refuses missing native binder constraints", () => {
  const projected = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameter] });
  const receiver = { targetType: target(projected), members: [field(projected)] };
  assert.throws(() => objectShapeProjectionDeclaration(receiver,
    { kind: "has-own", resultType: { kind: "source-primitive", name: "bool" }, propertyOrder: ["value"] }, [], [],
    [{ source: receiver.members[0], target: receiver.members[0] }]),
  /exact sealed native generic constraints/u, "source projection evidence does not manufacture an unconstrained native binder");
});

test("null checks are selected only for exact native reference receivers, never value or unconstrained carriers", () => {
  const reference = { kind: "type-parameter", identity: "Receiver:Reference", name: "Reference",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  for (const [name, type, expected] of [
    ["native reference", target(integer), true],
    ["native struct", { ...target(integer), csharpValueType: true, csharpSourceDeclarationKind: "struct" }, false],
    ["ref-like native struct", { ...target(integer), csharpValueType: true, csharpByRefLike: true }, false],
    ["constrained reference", reference, true],
    ["unconstrained native parameter", parameter, false],
  ]) {
    const receiver = { targetType: type, members: [] };
    const binding = objectShapeProjectionDeclaration(receiver,
      { kind: "has-own", resultType: { kind: "source-primitive", name: "bool" }, propertyOrder: [] }, [], [], []);
    assert.equal(binding.receiverRequiresNullCheck, expected, `${name}: one pre-seal reference obligation`);
    const diagnostics = [];
    const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map() } }, [binding], diagnostics);
    assert.equal(diagnostics.length, 0, `${name}: render without boxing or weaker generic evidence`);
    assert.equal(methods[0].body.statements[0].kind === "IfStatement", expected, `${name}: syntax reads only the admitted null-check obligation`);
  }
});

test("actual optional and conditional physical projection methods compile and retain native identity and zero-cost assignment", { timeout: 300_000 }, () => {
  const bindings = [];
  for (const kind of ["optional", "conditional"]) {
    const { projected } = projectedParameter(kind);
    const current = fixture([projected]);
    const receiver = current.instances[0];
    const subjects = [];
    for (const projection of ["assign", "keys", "values", "entries", "has-own"]) {
      const subject = {};
      assert.equal(current.engine.requireObjectShapeProjection(subject, receiver.targetType, {}, projection,
        resultType(projection, receiver), "object-shape", projection === "assign" ? { node: {}, type: receiver.targetType } : undefined).kind,
      "accepted", `${kind} ${projection}: native proof consumes admitted metadata`);
      subjects.push(subject);
    }
    const published = current.engine.seal();
    for (const subject of subjects) bindings.push(published.projection(subject));
  }
  const inverseTypes = [
    ["NativeValue", { kind: "target-named", id: "ProjectionProof.NativeValue", csharpRender: { kind: "named", name: "NativeValue" },
      csharpAllowsRefLikeTypeArguments: [], csharpValueType: true, csharpSourceDeclarationKind: "struct" }],
    ["NativeRefValue", { kind: "target-named", id: "ProjectionProof.NativeRefValue", csharpRender: { kind: "named", name: "NativeRefValue" },
      csharpAllowsRefLikeTypeArguments: [], csharpValueType: true, csharpByRefLike: true }],
    ["int", { kind: "type-parameter", identity: "Receiver:Unconstrained", name: "Unconstrained",
      csharpConstraints: { kind: "resolved", constraints: [] } }],
  ];
  const inverses = inverseTypes.map(([name, type]) => ({ name, binding: objectShapeProjectionDeclaration({ targetType: type, members: [] },
    { kind: "has-own", resultType: { kind: "source-primitive", name: "bool" }, propertyOrder: [] },
    [{ identity: parameter.identity, name: "Value" }], [], []) }));
  for (const { binding } of inverses) assert.equal(binding.receiverRequiresNullCheck, false,
    "native struct, ref-like and unconstrained physical receivers never acquire a boxing null check");
  const diagnostics = [];
  const methods = renderObjectShapeProjectionMethods({ scope: { typeParameterNames: new Map([[parameter.identity, "Value"]]) } },
    [...bindings, ...inverses.map(inverse => inverse.binding)], diagnostics);
  assert.equal(diagnostics.length, 0, "every complete typed native method is rendered");
  const syntax = printCsharpCompilationUnit({ kind: "CompilationUnit", usings: [], members: [{ kind: "NamespaceDeclaration", name: "ProjectionProof", members: [
    { kind: "ClassDeclaration", name: "Projection", modifiers: ["public", "sealed"], typeParameters: [{ name: "Value" }], members: [
      { kind: "FieldDeclaration", name: "value", modifiers: ["public"], type: { kind: "IdentifierName", name: "Value" } },
      { kind: "ConstructorDeclaration", name: "Projection", modifiers: ["public"],
        parameters: [{ name: "value", type: { kind: "IdentifierName", name: "Value" } }], body: { kind: "Block", statements: [
          { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
            left: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: "value" },
            right: { kind: "IdentifierName", name: "value" } } },
        ] } },
      ...methods,
    ] },
  ] }] });
  const compiled = compileCsharpSource({ sourceText: "export function run(): boolean { return true; }" });
  compiled.artifacts.set("generated/C02ProjectionProof.cs", syntax);
  const call = (binding, receiver = "receiver") => `Projection<int>.${binding.methodName}<${binding.typeParameters.map(() => "string").join(", ")}>(${receiver}${binding.selection.kind === "assign" ? ", source" : binding.selection.kind === "has-own" ? ', "value"' : ""})`;
  const observations = bindings.map(binding => {
    const expression = call(binding);
    const condition = binding.selection.kind === "assign" ? `ReferenceEquals(${expression}, receiver)`
      : binding.selection.kind === "has-own" ? expression
      : binding.selection.kind === "keys" ? `${expression}[0] == "value"`
      : binding.selection.kind === "entries" ? `${expression}[0].Item2 == "after"` : `${expression}[0] == "after"`;
    return `if (!(${condition})) throw new Exception("${binding.selection.kind}: physical native carrier");
ExpectNull(() => { _ = ${call(binding, "null!")}; });`;
  }).join("\n");
  const assign = bindings.find(binding => binding.selection.kind === "assign");
  const inverseCalls = inverses.map(({ name, binding }) => `Projection<int>.${binding.methodName}${name === "int" ? "<int>" : ""}(${name === "int" ? "7" : `new ${name}()`}, "absent")`);
  const output = executeCsharpConstruction(compiled, "physical-projection-binder-native", false, false, [], `
using System;
using ProjectionProof;
var receiver = new Projection<string>("before");
var source = new Projection<string>("after");
${observations}
for (int iteration = 0; iteration < 8192; iteration++) { _ = ${call(assign)}; receiver.value = source.value; }
long before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) {
    if (!ReferenceEquals(${call(assign)}, receiver)) throw new Exception("native receiver copy");
    if (${inverseCalls.join(" || ")}) throw new Exception("native value receiver observation");
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) receiver.value = source.value;
long native = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native || native != 0) throw new Exception($"projection allocation {generated} != {native}");
Console.Write("0:0");
static void ExpectNull(Action action) {
    try { action(); } catch (NullReferenceException) { return; }
    throw new Exception("native null receiver was not rejected");
}
namespace ProjectionProof { public struct NativeValue { } public ref struct NativeRefValue { } }
`);
  assert.equal(output, "0:0", "actual emitted projected methods compile, preserve failure identity and match the zero-allocation native assignment");
});
