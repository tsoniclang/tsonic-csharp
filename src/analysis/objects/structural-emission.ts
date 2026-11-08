import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import type { CsharpNativeCallableMember } from "../../target-model/types/native-type-data.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/objects/object-members.js";
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
import { objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { createCsharpStructuralObjectEmissionRecords } from "../program/records/objects/structural-object-emission.js";

export function analyzeCsharpStructuralObjectEmission(input: {
  readonly shapes: CsharpObjectShapeClassifications;
  readonly demand: CsharpObjectShapeDemand;
  readonly storage: Pick<CsharpStorageClassifications, "nativeField">;
  readonly captureMethods: CsharpCaptureMethodRecords["captureMethods"];
  readonly objectMembers: CsharpObjectMemberRecords;
}) {
  const values = new Map<string, CsharpStructuralObjectEmission>();
  const issues: TargetDiagnostic[] = [];
  const shapes = new Map([...input.shapes.knownShapes(), ...input.demand.artifacts.map(artifact => artifact.fact)]
    .map(shape => [objectShapeArtifactKey(shape), shape]));
  const hasMethodValues = (shape: CsharpObjectShapeFact): boolean => input.demand.get(objectShapeArtifactKey(shape))?.capabilities.includes("method-values") === true;
  const inherited = (shape: CsharpObjectShapeFact): readonly CsharpObjectShapeFact[] => (shape.implements ?? [])
    .flatMap(type => { const parent = input.shapes.resolveTarget(type); return parent === undefined ? [] : [parent]; });
  const writableMethodValue = (shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact): boolean =>
    shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true &&
    member.methodValueStorage !== undefined;
  const handleIsInherited = (shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact): boolean => {
    const name = objectShapeStorageMemberName(shape, member);
    const valueType = member.methodValueContract ?? member.type;
    return inherited(shape).some(parent => parent.members.some(candidate => {
      if (candidate.memberKind !== "method" || !hasMethodValues(parent) && candidate.optional !== true && candidate.methodValueStorage === undefined ||
        member.methodValueStorage !== undefined && candidate.methodValueStorage === undefined ||
        writableMethodValue(shape, member) && !writableMethodValue(parent, candidate) ||
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
    const methods = new Map<CsharpNativeCallableMember, CsharpStructuralMethodEmission>();
    const contracts: CsharpMethodValueContractEmission[] = [];
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
      if (!handleIsInherited(shape, member)) {
        const valueType = member.methodValueContract ?? member.type;
        const type = member.optional === true ? csharpNullableTargetType(valueType) : valueType;
        if ((hasMethodValues(shape) || member.optional === true || structural && member.methodValueStorage !== undefined) && admit(type, member)) {
          handle = Object.freeze({ name: objectShapeStorageMemberName(shape, member), type,
            writable: writableMethodValue(shape, member) });
          methodValues.push(handle);
        }
      }
      if (structural && handle !== undefined)
        interfaceMembers.push(Object.freeze({ kind: "property", property: handle }));
      const copied = member.methodValueStorage !== undefined;
      if (!(structural && member.optional !== true) && !copied) continue;
      const layout = input.objectMembers.objectMember.get(shape, member)?.declaration;
      if (layout === undefined || layout.kind !== "authored" && layout.kind !== "copied" &&
        layout.kind !== "method" && layout.kind !== "optional-method") {
        refuse("A structural method requires its complete admitted Native member-pair inventory.", member);
        continue;
      }
      if (layout.methods.length !== member.methods.length || layout.methods.some((entry, index) =>
        entry.member !== member.methods[index]?.member || entry.value !== member.methods[index]?.value)) {
        refuse("A structural method inventory must be the identical complete physical/value member pairing.", member);
        continue;
      }
      for (const entry of layout.methods) {
        const signature = entry.signature;
        const typeParameters = entry.member.typeParameters;
        const types = [signature.returnType, ...signature.parameters.map(parameter => parameter.type),
          ...(signature.receiver === undefined ? [] : [signature.receiver.type])];
        let complete = true;
        for (const parameter of typeParameters) {
          for (const constraint of parameter.constraints) {
            if (constraint.kind === "type" && !admit(constraint.type, member)) complete = false;
          }
        }
        if (!complete || !types.every(type => admit(type, member))) continue;
        const method: CsharpStructuralMethodEmission = Object.freeze({ name: entry.member.name,
          receiver: signature.receiver, returnType: signature.returnType, returnPassing: signature.returnPassing,
          typeParameters, parameters: signature.parameters });
        methods.set(entry.member, method);
        if (structural && member.optional !== true) interfaceMembers.push(Object.freeze({ kind: "method", method }));
        if (structural && member.methodValueContract !== undefined && targetTypeRefEquals(member.methodValueContract, shape.targetType)) {
          interfaceMembers.push(Object.freeze({ kind: "method", method: Object.freeze({ ...method, name: entry.value.name }) }));
        }
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
            writable: writableMethodValue(contract, required),
            source: required.methodValueContract !== undefined && body !== undefined &&
              (selected.methodValueStorage === undefined || presentBody) ? "this" : objectShapeStorageMemberName(shape, selected) }));
        }
      }
    }
    values.set(key, Object.freeze({ members: Object.freeze(interfaceMembers), methodValues: Object.freeze(methodValues), methods,
      contracts: Object.freeze(contracts) }));
  }
  return Object.freeze({ records: createCsharpStructuralObjectEmissionRecords(values), issues: Object.freeze(issues) });
}
