import type { CsharpObjectMemberPolicyInput } from "../../model/object-members.js";
import type { CsharpObjectMemberDeclaration, CsharpObjectMemberEmission, CsharpObjectMethodEmission, CsharpObjectMethodSignature } from "../../../target-model/records/objects/object-members.js";
import { csharpDelegateTargetType, getCsharpCallableMembers, getCsharpNullableElementTargetType, isCsharpVoidTargetType } from "../../../target-model/types/index.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRecordFieldTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTargetTypeRenderingRejection } from "../model/renderability.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpDelegateSignatureShape, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { SourceStorageDomainBoundary, SourceStorageMemberWritesSelection } from "@tsonic/target-api/analysis";
import { objectShapeMethodBodyName, objectShapeMethodValueStorageNames } from "../../../target-model/names/object-members.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpMethodValueEnvironment } from "./method-environments.js";
import { csharpDelegateSignatureHasSupportedPassingModes, csharpNativeCallableMemberKey } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { selectCsharpExplicitImplementationConstraints } from "../../constraints/type-parameter-constraints.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { represented } from "../source-type-flow/representation-results.js";

export function selectCsharpObjectMethodSignature(metadata: CsharpDelegateSignatureShape): CsharpObjectMethodSignature | undefined {
  if (metadata.returnType === undefined || !csharpDelegateSignatureHasSupportedPassingModes(metadata)) return undefined;
  const optional = new Set(metadata.optionalParameterIndexes ?? []);
  const rest = metadata.restParameterIndex;
  if (optional.size !== (metadata.optionalParameterIndexes?.length ?? 0) ||
    [...optional].some(index => index < 0 || index >= metadata.parameters.length || index === rest ||
      getCsharpNullableElementTargetType(metadata.parameters[index]) === undefined &&
      getCsharpGenericOptionalParts(metadata.parameters[index]) === undefined) ||
    rest !== undefined && (rest !== metadata.parameters.length - 1 || rest < 0)) return undefined;
  return Object.freeze({ receiver: metadata.receiver, returnType: metadata.returnType, returnPassing: metadata.returnPassing,
    returnsVoid: isCsharpVoidTargetType(metadata.returnType),
    parameters: Object.freeze(metadata.parameters.map((type, index) => Object.freeze({ type,
      passingMode: metadata.parameterPassingModes[index]!, rest: rest === index, optional: optional.has(index) }))) });
}

export function csharpObjectMethodHasFixedNativeExposure(
  writes: SourceStorageMemberWritesSelection | undefined,
): CsharpRepresentationOutcome<boolean> {
  if (writes?.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: writes });
  return represented(writes !== undefined && writes.kind !== "unresolved" && writes.writes.length === 0 &&
    (writes.kind === "complete" || writes.boundaries.length > 0 && writes.boundaries.every(
      (boundary: Omit<SourceStorageDomainBoundary, "bindings">) => boundary.kind === "external-write")));
}

function selectMethods(member: Extract<CsharpObjectShapeMemberFact, { readonly memberKind: "method" }>):
  readonly CsharpObjectMethodEmission[] | undefined {
  const values = getCsharpCallableMembers(getCsharpNullableElementTargetType(member.type) ?? member.type);
  if (values === undefined || values.length !== member.methods.length || member.methods.length === 0) return undefined;
  const remaining = new Set(values.map(value => csharpNativeCallableMemberKey(value)));
  const names = new Set<string>();
  const methods: CsharpObjectMethodEmission[] = [];
  for (const pair of member.methods) {
    if (names.has(pair.member.name) || !remaining.delete(csharpNativeCallableMemberKey(pair.value)) ||
      csharpNativeCallableMemberKey(pair.member) !== csharpNativeCallableMemberKey({ ...pair.value, name: pair.member.name }) ||
      pair.member.typeParameters.some((parameter, index) => parameter.identity !== pair.value.typeParameters[index]?.identity ||
        parameter.name !== pair.value.typeParameters[index]?.name || parameter.declaration !== pair.value.typeParameters[index]?.declaration)) return undefined;
    names.add(pair.member.name);
    const signature = selectCsharpObjectMethodSignature(pair.member.signature);
    if (signature === undefined) return undefined;
    const types = [signature.returnType, ...signature.parameters.map(parameter => parameter.type),
      ...(signature.receiver === undefined ? [] : [signature.receiver.type])];
    if (types.some(type => csharpTargetTypeRenderingRejection(type) !== undefined)) return undefined;
    methods.push(Object.freeze({ ...pair, signature,
      explicitConstraints: selectCsharpExplicitImplementationConstraints(pair.member.typeParameters, types) }));
  }
  return remaining.size === 0 ? Object.freeze(methods) : undefined;
}

export function selectCsharpObjectMemberEmission(input: CsharpObjectMemberPolicyInput):
  | { readonly kind: "selected"; readonly value: CsharpObjectMemberEmission }
  | { readonly kind: "rejected"; readonly reason: string } {
  const { shape, member, receiverBound } = input;
  const methodStorage = member.memberKind !== "method" ? undefined : member.methodValueStorage?.type ?? member.type;
  const boundStorage = member.bound === true ? csharpRuntimeRecordFieldTargetType(member.type) : undefined;
  const reject = (reason: string) => ({ kind: "rejected" as const, reason });
  const emit = (declaration: CsharpObjectMemberDeclaration) => ({ kind: "selected" as const,
    value: Object.freeze({ member, receiverBound, methodStorage, boundStorage, declaration: Object.freeze(declaration) }) });
  const renderable = (types: readonly TargetTypeRef[]) => types.every(type => csharpTargetTypeRenderingRejection(type) === undefined);
  if (member.memberKind === "method") {
    const methods = selectMethods(member);
    if (methods === undefined || methodStorage === undefined || !renderable([methodStorage])) return reject(
      `Object-shape method '${member.sourceName}' requires its complete paired physical and callable-value Native inventory.`);
    if (input.authored) {
      if (member.methodValueStorage === undefined) return emit({ kind: "authored", bodyName: member.targetName, methods,
        value: Object.freeze({ kind: "fixed" }) });
      const storage = member.methodValueStorage;
      const expected = member.optional === true ? csharpNullableTargetType(member.type) : member.type;
      if (!targetTypeRefEquals(storage.type, expected)) return reject(
          "An authored Native method requires its exact current callable-value storage and body environment.");
      const names = objectShapeMethodValueStorageNames(shape, member);
      const environment = selectCsharpMethodValueEnvironment(shape, member);
      if (environment === undefined || environment.storage !== storage) return reject(
        "An authored Native method requires its exact body invocation and current-value storage contract.");
      return emit({ kind: "authored", bodyName: objectShapeMethodBodyName(shape, member), methods,
        value: Object.freeze({ kind: "stored", type: storage.type, name: environment.currentSlotName, valueName: names.valueName }) });
    }
    if (member.optional === true) return emit({ kind: "optional-method",
      type: csharpNullableTargetType(methodStorage), methods });
    if (member.methodValueStorage !== undefined) return emit({ kind: "copied", storage: member.methodValueStorage.type, methods });
    return emit({ kind: "method", methods, storage: methodStorage });
  }
  if (!renderable([member.type])) return reject(
    `Object-shape member '${member.sourceName}' must carry a renderable target carrier type before C# emission.`);
  if (input.deferred) return emit({ kind: "deferred", type: member.type });
  if (member.accessor !== undefined) {
    const getter = csharpDelegateTargetType("System.Func", [shape.targetType], member.type);
    const setter = member.accessor.setter ? csharpDelegateTargetType("System.Action", [shape.targetType, member.type]) : undefined;
    if (!renderable([shape.targetType, getter, ...setter === undefined ? [] : [setter]])) return reject(
      `Object-shape accessor '${member.sourceName}' has no exact renderable self/getter/setter delegate contract.`);
    return emit({ kind: "accessor", type: member.type, getter, setter });
  }
  if (boundStorage !== undefined) return renderable([boundStorage]) ? emit({ kind: "bound", type: member.type, storage: boundStorage })
    : reject("An admitted bound Native value field lost its renderable storage contract.");
  if (input.nativeField !== undefined) {
    const location = csharpRuntimeLocationTargetType(member.type);
    return renderable([location]) ? emit({ kind: "native-backing", type: member.type, location,
      name: input.nativeField.storageName, layout: input.nativeField.layout }) : reject(
        "An admitted object declaration requires its complete Native member rendering.");
  }
  return emit({ kind: input.implementsInterface ? "property" : "field", type: member.type, required: member.optional !== true });
}
