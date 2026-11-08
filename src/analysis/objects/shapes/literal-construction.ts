import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpObjectShapePolicyHost, CsharpObjectShapeRegistry } from "./model.js";
import type { CsharpObjectMethodUseIndex } from "./method-values.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { sourceMemberOriginsEqual } from "./member-origins.js";
import { selectCsharpHostLiteralCorrespondence } from "./host-correspondence.js";
import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";
import { retainCsharpMethodValueStorage } from "./method-values.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";
import { selectCsharpMethodValueEnvironment } from "../../../policy/types/objects/method-environments.js";

export function createCsharpLiteralShapeResolver(host: CsharpObjectShapePolicyHost, owner: {
  resolveTarget(carrier: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  remember(shape: CsharpObjectShapeFact): CsharpObjectShapeFact;
  methodUses(): CsharpRepresentationOutcome<CsharpObjectMethodUseIndex>;
}): CsharpObjectShapeRegistry["resolveObjectLiteralTargetShape"] {
  return (expected, literal) => {
    const original = sourceOutcome(host.values.construction(literal));
    if (original.kind !== "represented") return original;
    if (original.value.kind === "none") throw new TypeError("A Native object literal requires its original Source construction publication.");
    const construction = original.value.value;
    if (construction.occurrence !== literal || construction.kind !== "object") throw new TypeError("A Native object construction requires its exact original Source occurrence and kind.");
    const value = host.representation().represent(construction.value, "storage", literal);
    if (value.kind !== "represented") return value;
    const actual = owner.resolveTarget(value.value.carrier);
    if (actual === undefined) return nativeRepresentationFailure(literal, "CSHARP_CONSTRUCTION_SHAPE_MISSING",
      "The original Source object construction requires its completed physical Native member inventory.");
    const destination = construction.destination;
    let destinationEvidence: SourceTypeEvidence = construction.value;
    if (destination.kind === "present") {
      const receipt = destination.value;
      host.source.assertEvidence(receipt.destination.applied);
      destinationEvidence = receipt.destination.applied;
      if (receipt.kind === "sum") {
        host.source.assertEvidence(receipt.arm);
        const arm = receipt.application.arms.indexOf(receipt.arm);
        const role = receipt.application.roles.find(value => value.role === receipt.role);
        if (receipt.destination.applied.sum !== receipt.application || arm < 0 || role === undefined ||
          !role.armIndexes.includes(arm)) throw new TypeError("An object construction requires its exact same-application Source destination arm and role.");
        destinationEvidence = receipt.arm;
      }
    }
    const selected = host.representation().represent(destinationEvidence, "storage", literal);
    if (selected.kind !== "represented") return selected;
    const destinationShape = owner.resolveTarget(selected.value.carrier);
    const broad = destinationEvidence.type.kind === "intrinsic" && (destinationEvidence.type.intrinsic === "any" ||
      destinationEvidence.type.intrinsic === "unknown" || destinationEvidence.type.intrinsic === "object");
    if (destinationShape === undefined && !broad) return nativeRepresentationFailure(literal,
      "CSHARP_CONSTRUCTION_SHAPE_MISSING", "The Source-selected construction destination requires its completed physical Native member inventory.");
    const target = destinationShape ?? actual;
    if (expected !== undefined && !targetTypeRefEquals(expected.targetType, target.targetType)) return nativeRepresentationFailure(literal,
      "CSHARP_CONSTRUCTION_DESTINATION_ABI_MISMATCH", "The supplied Native construction layout differs from the exact Source-selected destination ABI.");
    const pairs = selectCsharpHostLiteralCorrespondence(host.source, host.objects, construction.value,
      broad ? construction.value : destinationEvidence, actual, target, literal);
    if (pairs.kind !== "represented") return pairs;
    const members: CsharpObjectShapeMemberFact[] = [...target.members];
    const covered = new Set<CsharpObjectShapeMemberFact>();
    for (const pair of pairs.value) {
      const index = members.indexOf(pair.destination);
      if (index < 0) throw new TypeError("An object construction correspondence changed its physical destination slot.");
      covered.add(pair.source);
      const declarations = [...new Set([...pair.destination.sourceDeclarations ?? [], ...pair.original.source.declarations,
        ...pair.original.source.getters, ...pair.original.source.setters])];
      const origins = [...pair.destination.origins ?? []];
      for (const origin of pair.source.origins ?? []) if (!origins.some(previous => sourceMemberOriginsEqual(previous, origin))) origins.push(origin);
      const authoredGetter = pair.original.source.getters.some(declaration => host.ast.parent(declaration) === literal);
      const authoredSetter = pair.original.source.setters.some(declaration => host.ast.parent(declaration) === literal);
      if (pair.original.source.read === "accessor" && (!authoredGetter ||
        pair.destination.readonly !== true && !authoredSetter)) return nativeRepresentationFailure(literal,
        "CSHARP_NATIVE_ACCESSOR_CONSTRUCTION_UNSUPPORTED", "The authored Native accessor must preserve its exact getter and required setter contract.");
      members[index] = Object.freeze({ ...pair.destination, origins: Object.freeze(origins),
        sourceDeclarations: Object.freeze(declarations),
        sourceSubjects: Object.freeze([...new Set([...pair.destination.sourceSubjects ?? [], ...declarations])]),
        ...(authoredGetter ? { accessor: Object.freeze({ getter: true as const, setter: authoredSetter }) } : {}) });
    }
    const native = target.targetType.kind === "target-named" ? target.targetType as CsharpTargetNamedTypeRef : undefined;
    const nativeDeclared = native?.csharpSourceDeclarationKind === "class" || native?.csharpSourceDeclarationKind === "struct";
    const additional = actual.members.filter(member => !covered.has(member));
    if (nativeDeclared && (target.constructible !== true || additional.length !== 0 || members.some(member =>
      member.memberKind === "method" && member.sourceDeclarations?.some(declaration => host.ast.parent(declaration) === literal)))) {
      return nativeRepresentationFailure(literal, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "The declared Native class or struct must be constructible with every exact authored slot and its real method ABI; a structural replacement cannot stand in for it.");
    }
    if (!nativeDeclared) members.push(...additional);
    const spreads: CsharpObjectShapeFact[] = [];
    for (const evaluation of construction.evaluation) {
      if (evaluation.form !== "spread") continue;
      const physical = host.nativeValue(evaluation.occurrence);
      if (physical.kind !== "represented") return physical;
      const spread = owner.resolveTarget(physical.value);
      if (spread === undefined) return nativeRepresentationFailure(evaluation.occurrence, "CSHARP_METHOD_COPY_UNSUPPORTED",
        "An object spread requires its completed exact Native source shape.");
      spreads.push(spread);
    }
    const copied = selectCsharpCopiedMethodReceiver(members, spreads, host.ast);
    if (copied.kind === "rejected") return nativeRepresentationFailure(literal, "CSHARP_METHOD_COPY_UNSUPPORTED",
      "Copied Native methods must preserve their actual receiver, captures, identity and lifetime.");
    if (copied.kind === "selected") {
      if (nativeDeclared && !targetTypeRefEquals(copied.shape.targetType, target.targetType)) return nativeRepresentationFailure(literal,
        "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", "A copied receiver cannot replace the selected declared Native class or struct.");
      return represented(Object.freeze({ kind: "present", value: owner.remember(copied.shape) }));
    }
    for (const source of spreads) for (const originalMember of source.members) {
      const environment = selectCsharpMethodValueEnvironment(source, originalMember);
      if (environment === undefined) continue;
      const matches = members.flatMap((member, index) => member.origins?.some(origin =>
        originalMember.origins?.some(original => sourceMemberOriginsEqual(origin, original))) === true ? [index] : []);
      if (matches.length > 1) return nativeRepresentationFailure(literal, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING",
        "A copied Native method origin cannot select multiple destination slots.");
      const index = matches[0];
      if (index === undefined || members[index]!.sourceDeclarations?.some(declaration => host.ast.parent(declaration) === literal)) continue;
      members[index] = Object.freeze({ ...members[index]!, methodValueStorage: environment.storage });
    }
    const implementation = selectCsharpObjectMethodImplementation(members, host, literal);
    if (implementation.kind !== "represented") return implementation;
    const methodImplementation = implementation.value.kind === "present" ? implementation.value.value : undefined;
    const interfaces = native?.csharpSourceDeclarationKind === "interface" || native?.csharpStructuralContract === true
      ? Object.freeze([target.targetType]) : target.implements;
    let shape: CsharpObjectShapeFact = Object.freeze({
      targetType: nativeDeclared ? target.targetType : createStructuralObjectShapeTarget(members, interfaces, false, methodImplementation),
      members: Object.freeze(members),
      ...(interfaces === undefined ? {} : { implements: interfaces }),
      ...(target.constructible === undefined ? {} : { constructible: target.constructible }),
      ...(methodImplementation === undefined ? {} : { methodImplementation }),
    });
    const uses = owner.methodUses();
    if (uses.kind !== "represented") return uses;
    const retained = retainCsharpMethodValueStorage(shape, host.sourceStorage, uses.value);
    if (retained.kind !== "represented") return retained;
    return represented(Object.freeze({ kind: "present", value: owner.remember(retained.value) }));
  };
}
