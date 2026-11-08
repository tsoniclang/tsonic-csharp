import type { Node } from "@tsonic/tsts";
import type { SourcePresence, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpObjectShapePolicyHost, CsharpObjectShapeRegistry } from "./model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { canonicalCsharpObjectShapeMembers } from "../../../target-model/types/object-shape-identity.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { mergeCsharpObjectShapeSubjects } from "./construction.js";
import { sourceMemberOriginsEqual } from "./member-origins.js";
import { createCsharpLiteralShapeResolver } from "./literal-construction.js";
import { createCsharpNativeShapeProjections } from "./native-projections.js";
import { resolveCsharpCopiedObjectShape, createCsharpObjectMethodUseIndex } from "./method-values.js";

export function createCsharpObjectShapePolicy(host: CsharpObjectShapePolicyHost): CsharpObjectShapeRegistry {
  const shapes = new Map<string, CsharpObjectShapeFact>();
  const templates = new Map<string, CsharpObjectShapeFact>();
  const active = new Set<string>();
  const byEvidence = new WeakMap<SourceTypeEvidence, Map<string, CsharpObjectShapeFact>>();
  let methodUseIndex: ReturnType<typeof createCsharpObjectMethodUseIndex> | undefined;

  function remember(shape: CsharpObjectShapeFact): CsharpObjectShapeFact {
    const canonical = Object.freeze({ ...shape, members: Object.freeze(canonicalCsharpObjectShapeMembers(shape.members)),
      ...(shape.declarationTemplate === undefined ? {} : { declarationTemplate: remember(shape.declarationTemplate) }) });
    const key = targetTypeRefKey(canonical.targetType);
    const previous = shapes.get(key);
    if (previous !== undefined && !csharpObjectShapesEqual(previous, canonical)) {
      throw new TypeError(`Native shape '${key}' has contradictory complete physical contracts.`);
    }
    const retained = previous === undefined ? canonical : mergeCsharpObjectShapeSubjects(previous, canonical);
    shapes.set(key, retained);
    if (retained.targetType.kind === "target-named" && (retained.targetType.typeArguments?.length ?? 0) > 0 &&
      retained.targetType.typeArguments!.every(argument => argument.kind === "type-parameter")) {
      const template = templates.get(retained.targetType.id);
      if (template !== undefined) {
        const applied = instantiateCsharpObjectShape(template, retained.targetType);
        if (applied === undefined || !csharpObjectShapesEqual(applied, retained)) throw new TypeError("A Native shape template has contradictory physical substitutions.");
      } else templates.set(retained.targetType.id, retained);
    }
    return retained;
  }

  function resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined {
    if (type === undefined) return undefined;
    const carrier = getCsharpNullableElementTargetType(type) ?? type;
    const key = targetTypeRefKey(carrier);
    const existing = shapes.get(key);
    if (existing !== undefined) return existing;
    if (active.has(key)) return undefined;
    active.add(key);
    try {
      const template = carrier.kind === "target-named" ? templates.get(carrier.id) : undefined;
      if (template !== undefined) {
        const applied = instantiateCsharpObjectShape(template, carrier);
        if (applied !== undefined) return remember(applied);
      }
      const native = host.nativeShape(carrier);
      if (native === undefined) return undefined;
      if (!targetTypeRefEquals(native.targetType, carrier)) throw new TypeError("Native shape discovery changed the actual physical receiver ABI.");
      return remember(native);
    } finally {
      active.delete(key);
    }
  }

  function resolveEvidence(evidence: SourceTypeEvidence, carrier: TargetTypeRef,
    site: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>> {
    host.source.assertEvidence(evidence);
    const key = targetTypeRefKey(carrier);
    const cached = byEvidence.get(evidence)?.get(key);
    if (cached !== undefined) return represented(Object.freeze({ kind: "present", value: cached }));
    const native = resolveTarget(carrier);
    if (native === undefined) return represented(Object.freeze({ kind: "none" }));
    const definition = sourceOutcome(host.source.definition(evidence));
    if (definition.kind !== "represented") return definition;
    const descriptor = definition.value.type;
    if (descriptor.kind !== "shape") return represented(Object.freeze({ kind: "present", value: native }));
    for (const source of descriptor.members) {
      const matches = native.members.filter(member => member.origins?.some(origin => sourceMemberOriginsEqual(origin, source.origin)) === true);
      if (matches.length !== 1) return nativeRepresentationFailure(site, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING",
        "The physical Native shape must retain exactly one member for each original published Source member origin.");
      const value = sourceOutcome(host.source.component(definition.value, { kind: "member", origin: source.origin }));
      if (value.kind !== "represented") return value;
    }
    const associations = byEvidence.get(evidence) ?? new Map<string, CsharpObjectShapeFact>();
    associations.set(key, native);
    byEvidence.set(evidence, associations);
    return represented(Object.freeze({ kind: "present", value: native }));
  }

  function resolveNode(node: Node): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>> {
    const source = sourceOutcome(host.values.type(node));
    if (source.kind !== "represented") return source;
    const physical = host.nativeValue(node);
    return physical.kind !== "represented" ? physical : resolveEvidence(source.value, physical.value, node);
  }

  function retainConstructionSource(node: Node, shape: CsharpObjectShapeFact): CsharpRepresentationOutcome<CsharpObjectShapeFact> {
    const construction = sourceOutcome(host.values.construction(node));
    if (construction.kind !== "represented") return construction;
    if (construction.value.kind === "none") throw new TypeError("An authored Native object construction requires its Source construction publication.");
    const selected = resolveEvidence(construction.value.value.value, shape.targetType, node);
    if (selected.kind !== "represented") return selected;
    return selected.value.kind === "none" ? nativeRepresentationFailure(node, "CSHARP_CONSTRUCTION_SHAPE_MISSING",
      "The exact Native object construction has no completed physical shape.") : represented(selected.value.value);
  }

  function methodUses() {
    methodUseIndex ??= createCsharpObjectMethodUseIndex(host.sourceStorage, host.source, host.values);
    return methodUseIndex;
  }
  const nativeProjections = createCsharpNativeShapeProjections(host, { resolveTarget, remember, methodUses });
  const literal = createCsharpLiteralShapeResolver(host, { resolveTarget, remember, methodUses });

  return Object.freeze({
    retainShape(shape, _site) { return represented(remember(shape)); },
    resolveTarget,
    resolveNode,
    resolveEvidence,
    resolveMember(evidence, carrier, origin, site) {
      host.source.assertEvidence(evidence);
      const definition = sourceOutcome(host.source.definition(evidence));
      if (definition.kind !== "represented") return definition;
      const member = sourceOutcome(host.source.component(definition.value, { kind: "member", origin }));
      if (member.kind !== "represented") return member;
      const selected = resolveEvidence(evidence, carrier, site);
      if (selected.kind !== "represented") return selected;
      if (selected.value.kind === "none") return represented(Object.freeze({ kind: "none" }));
      const matches = selected.value.value.members.filter(member => member.origins?.some(value => sourceMemberOriginsEqual(value, origin)) === true);
      return matches.length === 1 ? represented(Object.freeze({ kind: "present", value: matches[0]! }))
        : nativeRepresentationFailure(site, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING", "The Native slot does not uniquely retain the required original Source member origin.");
    },
    knownShapes: () => Object.freeze([...shapes.values()]),
    retainConstructionSource,
    resolveObjectLiteralTargetShape: literal,
    resolveCopyShape(shape, site, source) {
      const uses = methodUses();
      if (uses.kind !== "represented") return uses;
      let failure: Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }> | undefined;
      const selected = resolveCsharpCopiedObjectShape(shape, host.ast,
        node => {
          const native = host.nativeValue(node);
          if (native.kind !== "represented") { failure = native; return undefined; }
          return resolveTarget(native.value);
        }, remember, host.sourceStorage, uses.value, source);
      if (failure !== undefined) return failure;
      if (selected.kind !== "represented") return selected;
      return selected.value.kind === "none" ? nativeRepresentationFailure(site, "CSHARP_METHOD_COPY_UNSUPPORTED",
        "The copied Native object must preserve its original receiver, method storage, capture identity and lifetime.") : represented(selected.value.value);
    },
    resolveNativeParameter: nativeProjections.resolveNativeParameter,
    resolveNativeReturn: nativeProjections.resolveNativeReturn,
  });
}
