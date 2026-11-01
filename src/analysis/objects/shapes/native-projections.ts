import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeSourceCarrierSelection } from "../../../target-model/records/objects/object-shapes.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { projectCsharpNativeSourceStorageCarrier } from "../value-domain-carriers.js";
import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects } from "./construction.js";
import { csharpObjectMethodValueIsExtracted, selectCsharpWritableMethodContract } from "./method-values.js";

export function createCsharpNativeShapeProjections(
  host: CsharpObjectShapePolicyHost,
  dependencies: {
    readonly resolveTarget: CsharpRecursiveObjectShapePolicy["resolveTarget"];
    readonly rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact;
    readonly resolveProjectInterfaceShape: (
      targetType: CsharpTargetNamedTypeRef,
      state: CsharpTypeResolutionState,
    ) => CsharpObjectShapeFact | undefined;
  },
): Pick<CsharpRecursiveObjectShapePolicy, "resolveNativeParameter" | "resolveNativeReturn"> {
  const { resolveTarget, rememberTargetShape, resolveProjectInterfaceShape } = dependencies;
  const environment = host.typeParameterConstraints;

  function resolveNativeParameter(
    declaration: Node,
    parameter: Node,
    type: TargetTypeRef,
  ): CsharpNativeSourceCarrierSelection {
    const rejected = (reason: string): CsharpNativeSourceCarrierSelection => Object.freeze({ kind: "rejected", subject: parameter,
      code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", reason });
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    const target = present.kind === "target-named" ? present as CsharpTargetNamedTypeRef : undefined;
    if (target === undefined || target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface")
      return Object.freeze({ kind: "resolved", type });
    const shape = resolveTarget(present) ?? (target?.csharpSourceDeclarationKind === "interface"
      ? resolveProjectInterfaceShape(target, { depth: 0 }) : undefined);
    if (shape === undefined || !shape.members.some(member => member.memberKind === "method") ||
      host.ast.body(declaration) === undefined) return Object.freeze({ kind: "resolved", type });
    const demand = host.sourceStorage.formalMemberWriteDemand(declaration, parameter);
    if (demand.kind !== "complete") return rejected(demand.reason);
    const written: CsharpObjectShapeMemberFact[] = [];
    for (const declaration of demand.members) {
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [declaration]);
      if (selected.kind !== "resolved") return rejected("A native method-write destination requires exact checked formal/member correspondence.");
      if (selected.member.memberKind === "method" && !written.includes(selected.member)) written.push(selected.member);
    }
    const view = nativeMethodParameterView(shape, parameter, written);
    const selected = selectCsharpWritableMethodContract(view, written, environment);
    if (selected === undefined) return rejected("A native method-write destination requires an exact writable source method contract.");
    if (selected === shape) return Object.freeze({ kind: "resolved", type });
    const resolved = rememberTargetShape(selected).targetType;
    return Object.freeze({ kind: "resolved", type: element === undefined ? resolved : csharpNullableTargetType(resolved) });
  }

  function nativeMethodParameterView(
    shape: CsharpObjectShapeFact,
    parameter: Node,
    written: readonly CsharpObjectShapeMemberFact[],
  ): CsharpObjectShapeFact {
    if (shape.sourceType === undefined || shape.methodImplementation !== undefined || shape.targetType.kind !== "target-named" ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true) return shape;
    const candidates = new Set(shape.members.filter(member => member.memberKind === "method" &&
      member.methodValueStorage?.kind === "delegate" && member.optional !== true &&
      (member.typeParameters?.length ?? 0) === 0 && !written.includes(member)));
    if (candidates.size === 0) return shape;
    const subject = host.sourceStorage.subjectFor(parameter);
    const origins = subject.kind === "resolved" ? host.sourceStorage.closedOriginsFor(subject.subject) : undefined;
    if (origins?.kind !== "complete" || origins.origins.length === 0) return shape;
    const contracts = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
    const budget = createCsharpMetadataBudget();
    for (const origin of origins.origins) {
      budget.reserve(1);
      const carrier = projectCsharpNativeSourceStorageCarrier(
        host.typeResolver.resolveNode(origin.subject.node, origin.sourceFile, { depth: 0 }),
        origin.subject, { resolveTarget }, budget.reserve,
      );
      const source = resolveTarget(carrier);
      if (source === undefined) return shape;
      const pairs = host.semantics(origin.sourceFile).types.structuralMembers(origin.type, shape.sourceType, "read");
      if (pairs.kind !== "available") return shape;
      const selected = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
      for (const pair of pairs.members) {
        if (pair.kind !== "present") continue;
        const destination = resolveCsharpObjectShapeMemberBySelectedSubject(shape,
          [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations]);
        if (destination.kind !== "resolved" || !candidates.has(destination.member)) continue;
        const member = resolveCsharpObjectShapeMemberBySelectedSubject(source,
          [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
        if (member.kind !== "resolved" || member.member.methodValueStorage !== undefined ||
          member.member.methodValueContract === undefined || !targetTypeRefEquals(member.member.type, destination.member.type)) continue;
        const declaration = csharpObjectShapeMethodDeclaration(source, member.member);
        const physical = declaration === undefined ? undefined : host.sourceStorage.memberSubjectFor(declaration);
        if (declaration === undefined || csharpObjectMethodValueIsExtracted(host.sourceStorage, declaration) || physical?.kind !== "resolved" ||
          !csharpObjectMethodHasFixedNativeExposure(host.sourceStorage.memberWritesFor(physical.subject))) continue;
        selected.set(destination.member, member.member.methodValueContract);
      }
      for (const member of candidates) {
        const contract = selected.get(member);
        const previous = contracts.get(member);
        if (contract === undefined || previous !== undefined && !targetTypeRefEquals(previous, contract)) {
          candidates.delete(member);
          contracts.delete(member);
        } else contracts.set(member, contract);
      }
      if (candidates.size === 0) return shape;
    }
    const protocols = new Map<string, CsharpObjectShapeFact>();
    for (const [member, contract] of contracts) {
      const key = targetTypeRefKey(contract);
      const protocol = protocols.get(key) ?? resolveTarget(contract);
      const signature = csharpPresentObjectShapeMethod(member);
      if (protocol === undefined || signature === undefined) return shape;
      const matches = protocol.members.filter(candidate =>
        csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(signature));
      if (matches.length !== 1) return shape;
      const correspondence = { ...protocol, members: protocol.members.map(candidate => candidate !== matches[0] ? candidate : {
        ...candidate,
        ...(signature.sourceSubjects === undefined ? {} : { sourceSubjects: signature.sourceSubjects }),
        ...(signature.sourceDeclarations === undefined ? {} : { sourceDeclarations: signature.sourceDeclarations }),
        ...(signature.sourceTypes === undefined ? {} : { sourceTypes: signature.sourceTypes }),
      }) };
      protocols.set(key, mergeCsharpObjectShapeSubjects(protocol, correspondence));
    }
    for (const protocol of protocols.values()) rememberTargetShape(protocol);
    const members = shape.members.map(member => {
      const contract = contracts.get(member);
      if (contract === undefined) return member;
      const { methodValueStorage: _storage, ...retained } = member;
      return Object.freeze({ ...retained, methodValueContract: contract });
    });
    const implemented = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
    for (const contract of contracts.values()) implemented.set(targetTypeRefKey(contract), contract);
    const interfaces = Object.freeze([...implemented.values()]);
    const { declarationTemplate: _template, ...retained } = shape;
    return Object.freeze({ ...retained, members: Object.freeze(members), implements: interfaces,
      targetType: createStructuralObjectShapeTarget(members, interfaces, environment, true) });
  }

  function resolveNativeReturn(
    declaration: Node,
    type: TargetTypeRef,
    observed: readonly TargetTypeRef[],
  ): CsharpNativeSourceCarrierSelection {
    const unchanged: CsharpNativeSourceCarrierSelection = Object.freeze({ kind: "resolved", type });
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    if (present.kind !== "target-named") return unchanged;
    const target = present as CsharpTargetNamedTypeRef;
    if (target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") return unchanged;
    const shape = resolveTarget(present);
    if (shape === undefined || observed.length === 0) return unchanged;
    const producers = observed.map(carrier => resolveTarget(carrier));
    if (producers.some(producer => producer === undefined || producer.targetType.kind !== "target-named" ||
      (producer.targetType as CsharpTargetNamedTypeRef).csharpValueType === true ||
      !targetTypeRefEquals(producer.targetType, present) &&
        !producer.implements?.some(implemented => targetTypeRefEquals(implemented, present)))) return unchanged;
    const written = shape.members.filter(member => {
      if (member.memberKind !== "method" || member.readonly === true) return false;
      const signature = csharpPresentObjectShapeMethod(member);
      return signature !== undefined && producers.every(producer => {
        const candidates = producer!.members.filter(candidate => {
          const selected = csharpPresentObjectShapeMethod(candidate);
          return selected !== undefined && csharpObjectShapeMemberContractKey(selected) === csharpObjectShapeMemberContractKey(signature);
        });
        return candidates.length === 1 && candidates[0]!.methodValueStorage !== undefined &&
          candidates[0]!.sourceDeclarations?.some(declaration => {
            const subject = host.sourceStorage.memberSubjectFor(declaration);
            if (subject.kind !== "resolved") return false;
            const writes = host.sourceStorage.memberWritesFor(subject.subject);
            return writes.kind !== "unresolved" && writes.writes.length > 0;
          }) === true;
      });
    });
    if (written.length === 0) return unchanged;
    const selected = selectCsharpWritableMethodContract(shape, written, environment);
    if (selected === undefined) return Object.freeze({ kind: "rejected", subject: declaration,
      code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", reason: "A native return requires the exact common writable source method contract of every reaching producer." });
    const resolved = rememberTargetShape(selected).targetType;
    return Object.freeze({ kind: "resolved", type: element === undefined ? resolved : csharpNullableTargetType(resolved) });
  }

  return Object.freeze({ resolveNativeParameter, resolveNativeReturn });
}
