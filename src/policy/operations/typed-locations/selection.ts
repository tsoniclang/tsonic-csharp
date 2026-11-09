import type { Node } from "@tsonic/tsts";
import type { SourceTypedLocationOperation } from "@tsonic/target-api/source";
import type { CsharpNativeRefReturnSelection, CsharpTypedLocationOperand,
  CsharpTypedLocationOperationSelection } from "../../../target-model/records/storage/typed-locations.js";
import type { CsharpTypedLocationStorageSelection } from "../../../target-model/records/storage/typed-location-storage.js";
import type { CsharpNativeGenericTypeDefinition, TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpNativeCallableApplication } from "../../../target-model/conversions/selection.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import { csharpRuntimeLocationPointee, csharpRuntimeLocationTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, isCsharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals, type CsharpNativeTypeIdentity } from "../../../target-model/types/equality.js";

export function selectCsharpNativeTypedLocationOperation(identity: CsharpNativeTypeIdentity, source: SourceTypedLocationOperation,
  pointeeType: TargetTypeRef, definition: CsharpNativeGenericTypeDefinition, carriers: ReadonlyMap<Node, TargetTypeRef>,
  native: CsharpNativeRefReturnSelection | undefined, storage: CsharpTypedLocationStorageSelection | undefined,
  sourcePointee: TargetTypeRef | undefined, runtime: CsharpNativeCallableApplication | undefined): CsharpTypedLocationOperationSelection {
  const locationType = csharpRuntimeLocationTargetType(pointeeType, definition);
  const call = source.occurrence;
  const operation = source.operation === "address-of" ? "location-address" : source.operation === "allocate" ? "location-allocate"
    : source.operation === "load" ? "location-load" : source.operation === "store" ? "location-store"
      : source.operation === "equal-pointer" ? "location-equal" : source.operation === "hash-pointer" ? "location-hash"
        : source.operation === "bind-pointer" ? "location-bind" : source.operation === "project-pointer" ? "location-project" : "location-view";
  const reject = (reason: string): CsharpTypedLocationOperationSelection => Object.freeze({ kind: "rejected", operation, reason });
  const equalityOperand = (type: TargetTypeRef | undefined, pointee = pointeeType): boolean => {
    const selected = csharpRuntimeLocationPointee(type, definition);
    return isCsharpAbsenceTargetType(type) || selected !== undefined && targetTypeRefEquals(identity, selected, pointee);
  };
  if (native?.kind === "rejected") return reject(native.reason);
  if (source.operation === "address-of") {
    if (storage === undefined || storage.kind === "rejected") return reject(storage?.reason ?? "The original writable place has no admitted physical Native address.");
    if (!targetTypeRefEquals(identity, storage.storage.valueType, pointeeType)) return reject("The actual storage and pointee must have identical Native carriers.");
    return Object.freeze({ kind: "location-address", call, pointeeType, locationType, storage: storage.storage });
  }
  if (source.operation === "allocate") return carriers.has(source.initial.occurrence)
    ? Object.freeze({ kind: "location-allocate", call, pointeeType, locationType, initialExpression: source.initial.occurrence })
    : reject("The initial value requires its completed actual Native value record.");
  if (source.operation === "load" || source.operation === "store") {
    const selected = locationOperand(identity, source.pointer.occurrence, pointeeType, locationType, native, carriers.get(source.pointer.occurrence));
    if (selected.kind === "rejected") return reject(selected.reason);
    if (source.operation === "load") return Object.freeze({ kind: "location-load", call, pointeeType, locationType, location: selected.location });
    if (selected.location.kind === "native-ref-return" && selected.location.returnPassing === "byref-readonly") return reject(
      `The selected C# ref-return '${selected.location.targetIdentity}' exposes a readonly Native location.`);
    return carriers.has(source.value.occurrence)
      ? Object.freeze({ kind: "location-store", call, pointeeType, locationType, location: selected.location, valueExpression: source.value.occurrence })
      : reject("The stored value requires its completed actual Native value record.");
  }
  if (source.operation === "equal-pointer") return equalityOperand(carriers.get(source.left.occurrence)) && equalityOperand(carriers.get(source.right.occurrence))
    ? Object.freeze({ kind: "location-equal", call, pointeeType, locationType, leftExpression: source.left.occurrence,
        rightExpression: source.right.occurrence, parameterType: csharpNullableReferenceTargetType(locationType) })
    : reject("Each equality operand must retain the exact acquired Native location carrier or absence.");
  if (source.operation === "hash-pointer") return equalityOperand(carriers.get(source.pointer.occurrence))
    ? Object.freeze({ kind: "location-hash", call, pointeeType, locationType, locationExpression: source.pointer.occurrence,
        parameterType: csharpNullableReferenceTargetType(locationType) })
    : reject("Pointer hashing requires the exact acquired Native location carrier or absence.");
  if (runtime === undefined) return reject("A Native accessor operation requires its complete admitted physical helper application.");
  const signature = runtime.applied.signature;
  const operands = source.operation === "bind-pointer" ? [source.identity, source.read, source.write]
    : source.operation === "project-pointer" ? [source.pointer, source.fromSource, source.toSource] : [source.pointer, source.read, source.write];
  if (signature.parameters.length !== operands.length || signature.parameterPassingModes.some(mode => mode !== "by-value") ||
    operands.some(operand => !carriers.has(operand.occurrence))) return reject("The complete Native helper signature must cover every original accessor operand.");
  if (source.operation === "bind-pointer") {
    const identity = carriers.get(source.identity.occurrence)!;
    if (isCsharpValueTypeTargetType(identity)) return reject("Pointer binding requires stable reference identity, not a boxed value.");
  } else if (sourcePointee === undefined || !equalityOperand(carriers.get(source.pointer.occurrence), sourcePointee) ||
    source.operation === "view" && !source.optional && (isCsharpAbsenceTargetType(carriers.get(source.pointer.occurrence)) ||
      isCsharpNullableReferenceTargetType(carriers.get(source.pointer.occurrence)))) {
    return reject("The pointer accessor requires its exact acquired original Native location carrier and presence contract.");
  }
  const method = runtime.original.name;
  if (method !== "Bind" && method !== "Project" && method !== "ProjectOptional" && method !== "View" && method !== "ViewOptional") {
    return reject("The actual selected Native helper does not implement the original pointer accessor operation.");
  }
  return Object.freeze({ kind: source.operation === "bind-pointer" ? "location-bind" : source.operation === "project-pointer" ? "location-project" : "location-view",
    call, pointeeType, locationType, method, typeArguments: runtime.typeArguments,
    arguments: Object.freeze(operands.map((operand, index) => Object.freeze({ expression: operand.occurrence, type: signature.parameters[index]! }))) });
}

function locationOperand(identity: CsharpNativeTypeIdentity, expression: Node, pointee: TargetTypeRef, location: TargetTypeRef,
  native: CsharpNativeRefReturnSelection | undefined, carrier: TargetTypeRef | undefined):
  { readonly kind: "resolved"; readonly location: CsharpTypedLocationOperand } | { readonly kind: "rejected"; readonly reason: string } {
  if (native?.kind === "resolved") return native.returnType !== undefined && targetTypeRefEquals(identity, native.returnType, pointee)
    ? { kind: "resolved", location: { kind: "native-ref-return", expression, targetIdentity: native.targetIdentity, returnPassing: native.returnPassing } }
    : { kind: "rejected", reason: "The actual Native ref-return must retain the identical physical pointee ABI." };
  return carrier !== undefined && targetTypeRefEquals(identity, carrier, location)
    ? { kind: "resolved", location: { kind: "runtime-location", expression } }
    : { kind: "rejected", reason: "The operand must have its exact acquired Native location or selected ref-return contract." };
}

export function nativeRefReturnFromMember(member: CsharpTargetMember, optionalChain: boolean): CsharpNativeRefReturnSelection {
  if (member.csharpReturnPassing === undefined) return Object.freeze({ kind: "not-native" });
  return optionalChain ? Object.freeze({ kind: "rejected", reason: `The selected C# ref-return '${member.id}' cannot be accessed through an optional chain.` })
    : Object.freeze({ kind: "resolved", targetIdentity: member.id, returnPassing: member.csharpReturnPassing, returnType: member.returnType });
}
