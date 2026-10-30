import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/objects/object-shape-demand.js";
import { objectShapeArtifactKey } from "../../target-model/records/objects/object-shape-keys.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpCaptureMethodRecords } from "../../target-model/records/callables/capture-methods.js";
import type { CsharpMethodValueContractEmission, CsharpStructuralInterfaceMemberEmission, CsharpStructuralMethodEmission, CsharpStructuralObjectEmission, CsharpStructuralPropertyEmission } from "../../target-model/records/objects/structural-object-emission.js";
import { csharpObjectShapeMemberContractKey, targetTypeRefKey, targetTypeRefEquals } from "../../target-model/types/index.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpRuntimeLocationTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../target-model/types/method-values.js";
import { objectShapeMethodInvocationName, objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { createCsharpStructuralObjectEmissionRecords } from "../program/records/objects/structural-object-emission.js";
import { selectCsharpObjectMethodSignature } from "../../policy/types/objects/object-members.js";
import type { CsharpDelegateContractRecords, CsharpNativeDelegateExtraction } from "../../target-model/records/callables/callable-conversions.js";
import { csharpNativeDelegateExtractionsForOwner, selectCsharpNativeDelegateExtractions } from "../conversions/callable-emission.js";

export function analyzeCsharpStructuralObjectEmission(input: {
  readonly shapes: CsharpObjectShapeClassifications;
  readonly demand: CsharpObjectShapeDemand;
  readonly storage: Pick<CsharpStorageClassifications, "nativeField">;
  readonly captureMethods: CsharpCaptureMethodRecords["captureMethods"];
  readonly delegateContract: CsharpDelegateContractRecords["delegateContract"];
}) {
  const values = new Map<string, CsharpStructuralObjectEmission>();
  const issues: TargetDiagnostic[] = [];
  const shapes = new Map([...input.shapes.knownShapes(), ...input.demand.artifacts.map(artifact => artifact.fact)]
    .map(shape => [objectShapeArtifactKey(shape), shape]));
  const hasMethodValues = (shape: CsharpObjectShapeFact): boolean => input.demand.get(objectShapeArtifactKey(shape))?.capabilities.includes("method-values") === true;
  const inherited = (shape: CsharpObjectShapeFact): readonly CsharpObjectShapeFact[] => (shape.implements ?? [])
    .flatMap(type => { const parent = input.shapes.resolveTarget(type); return parent === undefined ? [] : [parent]; });
  const handleIsInherited = (shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact): boolean => {
    const name = objectShapeStorageMemberName(shape, member);
    const valueType = member.methodValueContract ?? member.type;
    return inherited(shape).some(parent => parent.members.some(candidate => {
      if (candidate.memberKind !== "method" || !hasMethodValues(parent) && candidate.optional !== true && candidate.methodValueStorage === undefined ||
        member.methodValueStorage !== undefined && candidate.methodValueStorage === undefined ||
        objectShapeStorageMemberName(parent, candidate) !== name) return false;
      const inheritedType = candidate.methodValueContract ?? candidate.type;
      return targetTypeRefEquals(member.optional === true ? csharpNullableTargetType(valueType) : valueType,
        candidate.optional === true ? csharpNullableTargetType(inheritedType) : inheritedType);
    }));
  };
  for (const [key, shape] of shapes) {
    const artifact = input.demand.get(key);
    const captureMethods = input.captureMethods.get(shape);
    const structural = shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true;
    const interfaceMembers: CsharpStructuralInterfaceMemberEmission[] = [];
    const methodValues: CsharpStructuralPropertyEmission[] = [];
    const methods = new Map<CsharpObjectShapeMemberFact, CsharpStructuralMethodEmission>();
    const contracts: CsharpMethodValueContractEmission[] = [];
    const nativeExtractions = new Map<CsharpObjectShapeMemberFact, readonly CsharpNativeDelegateExtraction[]>();
    const refuse = (message: string, member?: CsharpObjectShapeMemberFact): void => {
      if (artifact === undefined) return;
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
        sourceNode: member?.sourceDeclarations?.[0] ?? shape.methodImplementation?.declaration, message });
    };
    const admit = (type: TargetTypeRef, member?: CsharpObjectShapeMemberFact): boolean => {
      const reason = csharpTargetTypeRenderingRejection(type);
      if (reason === undefined) return true;
      refuse(`The exact C# structural member has no native type syntax (${reason.reason}).`, member);
      return false;
    };
    if (structural) for (const extraction of csharpNativeDelegateExtractionsForOwner(shape.targetType, input.delegateContract)) {
      if (admit(extraction.targetCarrier)) interfaceMembers.push(Object.freeze({ kind: "property",
        property: Object.freeze({ name: extraction.name, type: extraction.targetCarrier, writable: false }) }));
    }
    for (const member of shape.members) {
      if (member.memberKind !== "method") {
        if (!structural) continue;
        if (!admit(member.type, member)) continue;
        interfaceMembers.push(Object.freeze({ kind: "property", property: Object.freeze({ name: member.targetName,
          type: member.type, writable: member.readonly !== true && member.accessor?.setter !== false }) }));
        const backing = input.storage.nativeField.get(shape.targetType, member.targetName);
        if (backing !== undefined) {
          const type = csharpRuntimeLocationTargetType(member.type);
          if (admit(type, member)) interfaceMembers.push(Object.freeze({ kind: "property", property: Object.freeze({
            name: backing.storageName, type, writable: false }) }));
        }
        continue;
      }
      let handle: CsharpStructuralPropertyEmission | undefined;
      const extractions = selectCsharpNativeDelegateExtractions(shape, member, input.delegateContract);
      nativeExtractions.set(member, extractions);
      if (!handleIsInherited(shape, member)) {
        const valueType = member.methodValueContract ?? member.type;
        const type = member.optional === true ? csharpNullableTargetType(valueType) : valueType;
        if ((hasMethodValues(shape) || member.optional === true || structural && member.methodValueStorage !== undefined) && admit(type, member)) {
          handle = Object.freeze({ name: objectShapeStorageMemberName(shape, member), type,
            writable: structural && member.methodValueStorage !== undefined });
          methodValues.push(handle);
        }
      }
      if (structural && handle !== undefined)
        interfaceMembers.push(Object.freeze({ kind: "property", property: handle }));
      const copied = member.methodValueStorage !== undefined;
      if (!(structural && member.optional !== true) && !copied) continue;
      const signature = selectCsharpObjectMethodSignature(member.type);
      if (signature === undefined) { refuse("A structural reference contract requires exact renderable member signatures.", member); continue; }
      const types = [signature.returnType, ...signature.parameters.map(parameter => parameter.type)];
      const typeParameters = member.typeParameters ?? [];
      for (const parameter of typeParameters) {
        for (const constraint of parameter.constraints) {
          if (constraint.kind === "type" && csharpTargetTypeRenderingRejection(constraint.type) !== undefined)
            refuse("C# emission could not render finalized provider type-parameter constraint facts.", member);
        }
      }
      if (!types.every(type => admit(type, member))) continue;
      const method: CsharpStructuralMethodEmission = Object.freeze({ name: member.targetName,
        returnType: signature.returnType, returnPassing: signature.returnPassing, typeParameters,
        parameters: signature.parameters });
      methods.set(member, method);
      if (structural && member.optional !== true) interfaceMembers.push(Object.freeze({ kind: "method", method }));
      if (structural && member.methodValueContract !== undefined && targetTypeRefEquals(member.methodValueContract, shape.targetType)) {
        if (shape.members.length !== 1) { refuse("An immutable method-body protocol requires its single exact invocation contract.", member); continue; }
        interfaceMembers.push(Object.freeze({ kind: "method", method: Object.freeze({ ...method, name: objectShapeMethodInvocationName(member) }) }));
      }
    }
    if (artifact?.materialization === "synthetic" && !structural) {
      const pending = [...shape.implements ?? []];
      const visited = new Set<string>();
      for (let index = 0; index < pending.length; index++) {
        const type = pending[index]!;
        const identity = targetTypeRefKey(type);
        if (visited.has(identity)) continue;
        visited.add(identity);
        const contract = input.shapes.resolveTarget(type);
        if (contract === undefined) { refuse("An admitted object declaration requires its complete native member rendering."); continue; }
        pending.push(...contract.implements ?? []);
        if (!hasMethodValues(contract) && !contract.members.some(member => member.memberKind === "method" && member.optional === true || member.methodValueStorage !== undefined)) continue;
        if (!admit(type)) continue;
        for (const required of contract.members) {
          if (required.memberKind !== "method" || handleIsInherited(contract, required)) continue;
          const captured = captureMethods?.filter(method => method.protocolMethods.some(protocol =>
            targetTypeRefEquals(protocol.interface, type) && protocol.name === required.targetName));
          if (captured?.length === 1 && required.optional !== true && required.methodValueStorage === undefined &&
            required.methodValueContract !== undefined && targetTypeRefEquals(required.methodValueContract, type)) {
            contracts.push(Object.freeze({ name: objectShapeStorageMemberName(contract, required), interface: type,
              type: required.methodValueContract, writable: false, source: "this" }));
            continue;
          }
          const signature = csharpPresentObjectShapeMethod(required);
          const exact = shape.members.filter(candidate => {
            const selected = csharpPresentObjectShapeMethod(candidate);
            return selected !== undefined && signature !== undefined &&
              csharpObjectShapeMemberContractKey(selected) === csharpObjectShapeMemberContractKey(signature);
          });
          const selected = exact.length === 1 ? exact[0] : undefined;
          if (selected === undefined || artifact.receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(selected))) {
            refuse("An admitted object declaration requires its complete native member rendering.", required);
            continue;
          }
          if (required.methodValueStorage !== undefined && selected.methodValueStorage === undefined) {
            refuse("A native writable method contract requires an actual writable callable slot on every reaching producer.", required);
            continue;
          }
          const valueType = required.methodValueContract ?? selected.type;
          const carrier = required.optional === true ? csharpNullableTargetType(valueType) : valueType;
          if (!admit(carrier, required)) continue;
          const body = csharpObjectShapeMethodDeclaration(shape, selected);
          const presentBody = selected.optional === true && required.optional !== true &&
            selected.methodValueContract !== undefined && required.methodValueContract !== undefined &&
            targetTypeRefEquals(type, selected.methodValueContract) &&
            targetTypeRefEquals(type, required.methodValueContract);
          contracts.push(Object.freeze({ name: objectShapeStorageMemberName(contract, required), interface: type, type: carrier,
            writable: required.methodValueStorage !== undefined,
            source: required.methodValueContract !== undefined && body !== undefined &&
              (selected.methodValueStorage === undefined || presentBody) ? "this" : objectShapeStorageMemberName(shape, selected) }));
        }
      }
    }
    values.set(key, Object.freeze({ members: Object.freeze(interfaceMembers), methodValues: Object.freeze(methodValues), methods,
      contracts: Object.freeze(contracts), nativeExtractions }));
  }
  return Object.freeze({ records: createCsharpStructuralObjectEmissionRecords(values), issues: Object.freeze(issues) });
}
