import type { CsharpObjectMemberPolicyInput } from "../../model/object-members.js";
import type { CsharpObjectMemberDeclaration, CsharpObjectMemberEmission, CsharpObjectMethodSignature } from "../../../target-model/records/object-members.js";
import { csharpDelegateTargetType, getCsharpDelegateSignature, getCsharpNullableElementTargetType, isCsharpVoidTargetType } from "../../../target-model/types/index.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRecordFieldTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTargetTypeRenderingRejection } from "../model/renderability.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { SourceStorageMemberWritesSelection } from "@tsonic/target-api/analysis";
import { objectShapeMethodBodyName, objectShapeMethodInvocationName, objectShapeMethodValueStorageNames } from "../../../target-model/names/object-members.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpMethodValueEnvironment } from "./method-environments.js";

export function csharpObjectMethodHasFixedNativeExposure(writes: SourceStorageMemberWritesSelection | undefined): boolean {
  return writes !== undefined && writes.kind !== "unresolved" && writes.writes.length === 0 &&
    (writes.kind === "complete" || writes.boundaries.length > 0 && writes.boundaries.every(boundary => boundary.kind === "external-write"));
}

export function selectCsharpObjectMemberEmission(input: CsharpObjectMemberPolicyInput):
  | { readonly kind: "selected"; readonly value: CsharpObjectMemberEmission }
  | { readonly kind: "rejected"; readonly reason: string } {
  const { shape, member, receiverBound } = input;
  const metadata = getCsharpDelegateSignature(getCsharpNullableElementTargetType(member.type) ?? member.type);
  const returnsVoid = metadata !== undefined && isCsharpVoidTargetType(metadata.returnType);
  const methodStorage = member.memberKind !== "method" ? undefined : member.methodStorageType !== undefined
    ? receiverBound ? undefined : member.methodStorageType : metadata === undefined || receiverBound ? undefined : member.type;
  const boundStorage = member.bound === true ? csharpRuntimeRecordFieldTargetType(member.type) : undefined;
  const reject = (reason: string) => ({ kind: "rejected" as const, reason });
  const emit = (declaration: CsharpObjectMemberDeclaration) => ({ kind: "selected" as const,
    value: Object.freeze({ member, receiverBound, methodStorage, boundStorage, declaration: Object.freeze(declaration) }) });
  const signature = (): CsharpObjectMethodSignature | undefined => {
    // Delegate metadata without its return fact has no complete method signature.
    if (metadata === undefined || metadata.returnType === undefined) return undefined;
    const optional = new Set(metadata.optionalParameterIndexes ?? []);
    const rest = metadata.restParameterIndex;
    if (optional.size !== (metadata.optionalParameterIndexes?.length ?? 0) ||
      [...optional].some(index => index < 0 || index >= metadata.parameters.length || index === rest || getCsharpNullableElementTargetType(metadata.parameters[index]) === undefined) ||
      rest !== undefined && (rest !== metadata.parameters.length - 1 || rest < 0)) return undefined;
    return Object.freeze({ returnType: metadata.returnType, returnsVoid,
      parameters: Object.freeze(metadata.parameters.map((type, index) => Object.freeze({ type, rest: rest === index, optional: optional.has(index) }))) });
  };
  const renderable = (types: readonly TargetTypeRef[]) => types.every(type => csharpTargetTypeRenderingRejection(type) === undefined);
  if (member.memberKind === "method" && input.authored) {
    const selected = signature();
    if (receiverBound || selected === undefined) return reject("An authored native method requires its exact closed receiver and callable signature.");
    if (member.methodStorageType === undefined) return emit({ kind: "authored", bodyName: member.targetName, signature: selected,
      value: Object.freeze({ kind: "fixed" }) });
    const expected = member.methodValueContract ?? member.type;
    const stored = getCsharpNullableElementTargetType(member.methodStorageType) ?? member.methodStorageType;
    if (!targetTypeRefEquals(stored, getCsharpNullableElementTargetType(expected) ?? expected) ||
      (getCsharpNullableElementTargetType(member.methodStorageType) !== undefined) !== (member.optional === true) ||
      !renderable([member.methodStorageType, selected.returnType, ...selected.parameters.map(parameter => parameter.type)]))
      return reject("An authored native method requires its complete closed callable storage.");
    const names = objectShapeMethodValueStorageNames(shape, member);
    const environment = selectCsharpMethodValueEnvironment(shape, member);
    if (environment === undefined || !targetTypeRefEquals(environment.storage, member.methodStorageType))
      return reject("An authored native method requires its exact body invocation and current-value storage contract.");
    return emit({ kind: "authored", bodyName: objectShapeMethodBodyName(shape, member), signature: selected,
      value: environment.kind === "delegate"
        ? Object.freeze({ kind: "delegate", type: member.methodStorageType, name: names.name, valueName: names.valueName })
        : Object.freeze({ kind: "protocol", type: member.methodStorageType, interface: environment.type,
          name: environment.currentSlotName, valueName: names.valueName, invocationName: environment.invocationName,
          initializedName: member.optional === true ? names.initializedName : undefined }) });
  }
  if ((member.typeParameters?.length ?? 0) > 0 || member.methodValueContract !== undefined) {
    if (member.methodStorageType !== undefined) {
      if (member.optional === true && member.methodValueContract !== undefined) {
        const type = csharpNullableTargetType(member.methodStorageType);
        return renderable([type]) ? emit({ kind: "optional-method", type })
          : reject("An admitted object declaration requires its complete native member rendering.");
      }
      const selected = signature();
      if (selected === undefined || !renderable([member.methodStorageType, selected.returnType, ...selected.parameters.map(parameter => parameter.type)]))
        return reject("An admitted object declaration requires its complete native member rendering.");
      return emit({ kind: "copied", storage: member.methodStorageType, signature: selected,
        invocationName: objectShapeMethodInvocationName(member) });
    }
    if (member.optional === true && member.methodValueContract !== undefined) {
      const type = csharpNullableTargetType(member.methodValueContract);
      return renderable([type]) ? emit({ kind: "optional-method", type }) : reject("An admitted object declaration requires its complete native member rendering.");
    }
    return reject("An admitted object declaration requires its complete native member rendering.");
  }
  if (!renderable([member.type])) return reject(`Object-shape member '${member.sourceName}' must carry a renderable target carrier type before C# emission.`);
  if (input.deferred) return emit({ kind: "deferred", type: member.type });
  if (member.memberKind === "method") {
    const selected = signature();
    if (selected === undefined || methodStorage === undefined || !renderable([methodStorage, selected.returnType, ...selected.parameters.map(parameter => parameter.type)]))
      return reject(`Object-shape method '${member.sourceName}' must carry a Func/Action delegate target type with explicit return facts before C# emission.`);
    return emit({ kind: "method", signature: selected, storage: methodStorage });
  }
  if (member.accessor !== undefined) {
    const getter = csharpDelegateTargetType("System.Func", [shape.targetType], member.type);
    const setter = member.accessor.setter ? csharpDelegateTargetType("System.Action", [shape.targetType, member.type]) : undefined;
    if (!renderable([shape.targetType, getter, ...setter === undefined ? [] : [setter]]))
      return reject(`Object-shape accessor '${member.sourceName}' has no exact renderable self/getter/setter delegate contract.`);
    return emit({ kind: "accessor", type: member.type, getter, setter });
  }
  if (boundStorage !== undefined) return renderable([boundStorage]) ? emit({ kind: "bound", type: member.type, storage: boundStorage })
    : reject("An admitted bound native value field lost its renderable storage contract.");
  if (input.nativeField !== undefined) {
    const location = csharpRuntimeLocationTargetType(member.type);
    return renderable([location]) ? emit({ kind: "native-backing", type: member.type, location,
      name: input.nativeField.storageName, layout: input.nativeField.layout }) : reject("An admitted object declaration requires its complete native member rendering.");
  }
  return emit({ kind: input.implementsInterface ? "property" : "field", type: member.type, required: member.optional !== true });
}
