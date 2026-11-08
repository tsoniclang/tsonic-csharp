import type { Node } from "@tsonic/tsts";
import type { SourceStorageSubject } from "@tsonic/target-api/analysis";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectMethodUseIndex } from "./method-values.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpObjectMethodValueIsExtracted, resolveCsharpWritableMethodContract } from "./method-values.js";
import { selectCsharpShapeMemberByOrigins } from "./member-origins.js";
import { projectCsharpNativeSourceStorageCarrier } from "../value-domain-carriers.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";

export function createCsharpNativeShapeProjections(host: CsharpObjectShapePolicyHost, owner: {
  resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  remember(shape: CsharpObjectShapeFact): CsharpObjectShapeFact;
  methodUses(): CsharpRepresentationOutcome<CsharpObjectMethodUseIndex>;
}) {
  const { resolveTarget, remember } = owner;

  function evidence(subject: SourceStorageSubject): CsharpRepresentationOutcome<SourceTypeEvidence> {
    let value: SourceTypeEvidence;
    if (subject.kind === "value") {
      const selected = sourceOutcome(host.values.type(subject.node));
      if (selected.kind !== "represented") return selected;
      value = selected.value;
    } else {
      const selected = sourceOutcome(host.values.declaredSlot(subject.node));
      if (selected.kind !== "represented") return selected;
      value = selected.value.type;
    }
    for (const part of subject.projection) {
      if (value.type.kind === "optional") {
        const present = sourceOutcome(host.source.component(value, { kind: "optional-value" }));
        if (present.kind !== "represented") return present;
        value = present.value;
      }
      if (value.type.kind === "declared" || value.type.kind === "projection" || value.type.kind === "intersection") {
        const definition = sourceOutcome(host.source.definition(value));
        if (definition.kind !== "represented") return definition;
        value = definition.value;
      }
      const child = sourceOutcome(host.source.component(value, part.kind === "array-element" || part.kind === "tuple-element"
        ? part : { kind: "member", origin: { kind: "declared", declaration: part.declaration } }));
      if (child.kind !== "represented") return child;
      value = child.value;
    }
    return represented(value);
  }

  function parameterView(shape: CsharpObjectShapeFact, parameter: Node,
    written: readonly CsharpObjectShapeMemberFact[]): CsharpRepresentationOutcome<CsharpObjectShapeFact> {
    if (shape.methodImplementation !== undefined || shape.targetType.kind !== "target-named" ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true) return represented(shape);
    const candidates = new Set(shape.members.filter(member => member.memberKind === "method" &&
      member.methodValueStorage !== undefined && member.optional !== true && !written.includes(member)));
    if (candidates.size === 0) return represented(shape);
    const subject = host.sourceStorage.subjectFor(parameter);
    if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
    const origins = subject.kind === "resolved" ? host.sourceStorage.closedOriginsFor(subject.subject) : undefined;
    if (origins?.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: origins });
    if (origins?.kind !== "complete" || origins.origins.length === 0) return represented(shape);
    const formal = sourceOutcome(host.values.declaredSlot(parameter));
    if (formal.kind !== "represented") return formal;
    const uses = owner.methodUses();
    if (uses.kind !== "represented") return uses;
    const contracts = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
    const budget = createCsharpMetadataBudget();
    for (const origin of origins.origins) {
      budget.reserve(1);
      const physical = host.nativeValue(origin.subject.node);
      if (physical.kind !== "represented") return physical;
      const carrier = projectCsharpNativeSourceStorageCarrier(physical.value, origin.subject, { resolveTarget }, budget.reserve);
      const source = resolveTarget(carrier);
      if (source === undefined) return represented(shape);
      const original = evidence(origin.subject);
      if (original.kind !== "represented") return original;
      const pairs = sourceOutcome(host.objects.correspondence(original.value, formal.value.type, "read"));
      if (pairs.kind !== "represented") return pairs;
      if (pairs.value.kind !== "available") return represented(shape);
      const selected = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
      for (const pair of pairs.value.members) {
        if (pair.kind !== "present") continue;
        const destination = selectCsharpShapeMemberByOrigins(shape,
          [...pair.destination.origins, ...pair.destination.readOrigins, ...pair.destination.writeOrigins]);
        const member = selectCsharpShapeMemberByOrigins(source,
          [...pair.source.origins, ...pair.source.readOrigins, ...pair.source.writeOrigins]);
        if (destination === undefined || member === undefined) return nativeRepresentationFailure(parameter,
          "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING", "The formal and actual Native slots must preserve every published original member origin.");
        if (!candidates.has(destination) || member.memberKind !== "method" || member.methodValueStorage !== undefined ||
          !targetTypeRefEquals(member.type, destination.type)) continue;
        const declaration = csharpObjectShapeMethodDeclaration(source, member);
        const storage = declaration === undefined ? undefined : host.sourceStorage.memberSubjectFor(declaration);
        if (storage?.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: storage });
        if (declaration !== undefined && !csharpObjectMethodValueIsExtracted(uses.value, declaration) && storage?.kind === "resolved") {
          const exposure = csharpObjectMethodHasFixedNativeExposure(host.sourceStorage.memberWritesFor(storage.subject));
          if (exposure.kind !== "represented") return exposure;
          if (exposure.value) selected.set(destination, member.type);
        }
      }
      for (const member of candidates) {
        const contract = selected.get(member);
        const previous = contracts.get(member);
        if (contract === undefined || previous !== undefined && !targetTypeRefEquals(previous, contract)) {
          candidates.delete(member);
          contracts.delete(member);
        } else contracts.set(member, contract);
      }
      if (candidates.size === 0) return represented(shape);
    }
    const members = shape.members.map(member => {
      const contract = contracts.get(member);
      if (contract === undefined) return member;
      const { methodValueStorage: _storage, ...retained } = member;
      return Object.freeze(retained);
    });
    const { declarationTemplate: _template, ...retained } = shape;
    return represented(Object.freeze({ ...retained, members: Object.freeze(members),
      targetType: createStructuralObjectShapeTarget(members, shape.implements, true) }));
  }

  function resolveNativeParameter(declaration: Node, parameter: Node, type: TargetTypeRef): CsharpRepresentationOutcome<TargetTypeRef> {
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    const target = present.kind === "target-named" ? present as CsharpTargetNamedTypeRef : undefined;
    if (target === undefined || target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") return represented(type);
    const shape = resolveTarget(present);
    if (shape === undefined || !shape.members.some(member => member.memberKind === "method") || host.ast.body(declaration) === undefined) return represented(type);
    const demand = host.sourceStorage.formalMemberWriteDemand(declaration, parameter);
    if (demand.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: demand });
    if (demand.kind !== "complete") return nativeRepresentationFailure(parameter, "CSHARP_SOURCE_STORAGE_NOT_PROVEN", demand.reason);
    const written: CsharpObjectShapeMemberFact[] = [];
    for (const original of demand.members) {
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [original]);
      if (selected.kind !== "resolved") return nativeRepresentationFailure(parameter, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING",
        "A Native method-write destination requires its exact original formal member declaration.");
      if (selected.member.memberKind === "method" && !written.includes(selected.member)) written.push(selected.member);
    }
    const view = parameterView(shape, parameter, written);
    if (view.kind !== "represented") return view;
    const selected = resolveCsharpWritableMethodContract(view.value, written);
    if (selected === undefined) return nativeRepresentationFailure(parameter, "CSHARP_SOURCE_STORAGE_NOT_PROVEN",
      "A Native method-write destination requires the exact writable method storage contract.");
    const resolved = selected === shape ? type : remember(selected).targetType;
    return represented(element === undefined || resolved === type ? resolved : csharpNullableTargetType(resolved));
  }

  function resolveNativeReturn(declaration: Node, type: TargetTypeRef, observed: readonly TargetTypeRef[]): CsharpRepresentationOutcome<TargetTypeRef> {
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    if (present.kind !== "target-named") return represented(type);
    const target = present as CsharpTargetNamedTypeRef;
    if (target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") return represented(type);
    const shape = resolveTarget(present);
    if (shape === undefined || observed.length === 0) return represented(type);
    const producers = observed.map(carrier => resolveTarget(carrier));
    if (producers.some(producer => producer === undefined || producer.targetType.kind !== "target-named" ||
      (producer.targetType as CsharpTargetNamedTypeRef).csharpValueType === true || !targetTypeRefEquals(producer.targetType, present) &&
      !producer.implements?.some(implemented => targetTypeRefEquals(implemented, present)))) return represented(type);
    const written: CsharpObjectShapeMemberFact[] = [];
    for (const member of shape.members) {
      if (member.memberKind !== "method" || member.readonly === true) continue;
      const signature = csharpPresentObjectShapeMethod(member);
      if (signature === undefined) continue;
      let everyProducerWrites = true;
      for (const producer of producers) {
        const candidates = producer!.members.filter(candidate => {
          const selected = csharpPresentObjectShapeMethod(candidate);
          return selected !== undefined && csharpObjectShapeMemberContractKey(selected) === csharpObjectShapeMemberContractKey(signature);
        });
        if (candidates.length !== 1 || candidates[0]!.methodValueStorage === undefined) { everyProducerWrites = false; break; }
        let observedWrite = false;
        for (const original of candidates[0]!.sourceDeclarations ?? []) {
          const subject = host.sourceStorage.memberSubjectFor(original);
          if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
          if (subject.kind !== "resolved") continue;
          const writes = host.sourceStorage.memberWritesFor(subject.subject);
          if (writes.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: writes });
          if (writes.kind !== "unresolved" && writes.writes.length > 0) { observedWrite = true; break; }
        }
        if (!observedWrite) { everyProducerWrites = false; break; }
      }
      if (everyProducerWrites) written.push(member);
    }
    if (written.length === 0) return represented(type);
    const selected = resolveCsharpWritableMethodContract(shape, written);
    return selected === undefined ? nativeRepresentationFailure(declaration, "CSHARP_SOURCE_STORAGE_NOT_PROVEN",
      "The Native return requires one exact common writable method contract for every reaching producer.")
      : represented(element === undefined ? remember(selected).targetType : csharpNullableTargetType(remember(selected).targetType));
  }
  return Object.freeze({ resolveNativeParameter, resolveNativeReturn });
}
