import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { renderObjectShapeProjectionMethods } from "../../../dist/backend/planner/objects/closed-object-shapes.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/object-shape-demand.js";
import { csharpJsArrayTargetType, csharpStringTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/index.js";

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
