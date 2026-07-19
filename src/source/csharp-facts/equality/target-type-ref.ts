import type {
  ExtensionFactSubject,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../types.js";
import type {
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
} from "../../csharp-source-semantics/target-types.js";
import {
  isCsharpNullableReferenceTargetType,
} from "../../csharp-source-semantics/target-types.js";

export function targetTypeRefArrayEquals(
  left: readonly TargetTypeRef[] | undefined,
  right: readonly TargetTypeRef[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => targetTypeRefEquals(item, right[index]));
}

export function extensionFactSubjectTypeRefEquals(
  left: ExtensionFactSubject | undefined,
  right: ExtensionFactSubject | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return isTargetTypeRefSubject(left) && isTargetTypeRefSubject(right) && targetTypeRefEquals(left, right);
}

function isTargetTypeRefSubject(subject: ExtensionFactSubject | undefined): subject is TargetTypeRef {
  return typeof subject === "object" &&
    subject !== null &&
    "kind" in subject &&
    typeof (subject as { readonly kind?: unknown }).kind === "string";
}

export function targetTypeRefEquals(left: TargetTypeRef | undefined, right: TargetTypeRef | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  if (isCsharpNullableReferenceTargetType(left) !== isCsharpNullableReferenceTargetType(right)) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "source-global":
      return right.kind === "source-global" &&
        left.name === right.name &&
        targetTypeRefArrayEquals(left.typeArguments, right.typeArguments);
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefArrayEquals(left.typeArguments, right.typeArguments) &&
        csharpNamedTargetMetadataEquals(left as CsharpTargetNamedTypeRef, right as CsharpTargetNamedTypeRef);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefArrayEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        stringArrayEquals(left.abi, right.abi) &&
        targetTypeRefArrayEquals(left.args, right.args) &&
        targetTypeRefEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        left.payloadId === right.payloadId;
  }
}

function csharpNamedTargetMetadataEquals(
  left: CsharpTargetNamedTypeRef,
  right: CsharpTargetNamedTypeRef,
): boolean {
  return csharpRenderShapeEquals(left.csharpRender, right.csharpRender) &&
    left.csharpThrowable === right.csharpThrowable &&
    left.csharpTypeofRuntimeKind === right.csharpTypeofRuntimeKind &&
    left.csharpSpecialType === right.csharpSpecialType &&
    left.csharpSourceDeclarationKind === right.csharpSourceDeclarationKind &&
    targetTypeRefEquals(left.csharpBaseType, right.csharpBaseType) &&
    left.csharpValueType === right.csharpValueType &&
    targetTypeRefEquals(left.csharpArrayLiteralElementType, right.csharpArrayLiteralElementType) &&
    targetTypeRefEquals(left.csharpArrayLiteralConstructionType, right.csharpArrayLiteralConstructionType) &&
    targetTypeRefEquals(left.csharpEnumerableElementType, right.csharpEnumerableElementType) &&
    targetTypeRefEquals(left.csharpReadOnlyIndexableElementType, right.csharpReadOnlyIndexableElementType) &&
    targetTypeRefEquals(left.csharpDenseMutableElementType, right.csharpDenseMutableElementType) &&
    csharpDelegateSignatureEquals(left.csharpDelegateSignature, right.csharpDelegateSignature) &&
    targetTypeRefEquals(left.csharpTaskResultType, right.csharpTaskResultType) &&
    targetTypeRefArrayEquals(left.csharpRuntimeUnionArms, right.csharpRuntimeUnionArms) &&
    csharpObjectShapeArrayEquals(left.csharpRuntimeUnionObjectShapes, right.csharpRuntimeUnionObjectShapes) &&
    left.csharpJsSurfaceKind === right.csharpJsSurfaceKind &&
    left.csharpCollectionSurface === right.csharpCollectionSurface;
}

function csharpRenderShapeEquals(
  left: CsharpTargetTypeRenderShape | undefined,
  right: CsharpTargetTypeRenderShape | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "predefined":
      return right.kind === "predefined" && left.name === right.name;
    case "nullable":
      return right.kind === "nullable";
    case "named":
      return right.kind === "named" &&
        left.externAlias === right.externAlias &&
        stringArrayEquals(left.namespace, right.namespace) &&
        left.name === right.name &&
        left.genericArity === right.genericArity &&
        nestedRenderShapeArrayEquals(left.nested, right.nested);
  }
}

function nestedRenderShapeArrayEquals(
  left: readonly { readonly name: string; readonly genericArity?: number }[] | undefined,
  right: readonly { readonly name: string; readonly genericArity?: number }[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return other !== undefined && item.name === other.name && item.genericArity === other.genericArity;
    });
}

function csharpDelegateSignatureEquals(
  left: CsharpTargetNamedTypeRef["csharpDelegateSignature"],
  right: CsharpTargetNamedTypeRef["csharpDelegateSignature"],
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    targetTypeRefArrayEquals(left.parameters, right.parameters) &&
    targetTypeRefEquals(left.returnType, right.returnType);
}

function csharpObjectShapeArrayEquals(
  left: readonly (CsharpObjectShapeFact | undefined)[] | undefined,
  right: readonly (CsharpObjectShapeFact | undefined)[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((shape, index) => csharpObjectShapeEquals(shape, right[index]));
}

function csharpObjectShapeEquals(
  left: CsharpObjectShapeFact | undefined,
  right: CsharpObjectShapeFact | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    targetTypeRefEquals(left.targetType, right.targetType) &&
    targetTypeRefArrayEquals(left.implements, right.implements) &&
    left.constructible === right.constructible &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => {
      const other = right.members[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        extensionFactSubjectArrayEquals(member.sourceSubjects, other.sourceSubjects) &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        targetTypeRefEquals(member.type, other.type) &&
        member.optional === other.optional &&
        member.readonly === other.readonly;
    });
}

function extensionFactSubjectArrayEquals(
  left: readonly ExtensionFactSubject[] | undefined,
  right: readonly ExtensionFactSubject[] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((subject, index) => subject === right[index]);
}

function stringArrayEquals(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  return left !== undefined && right !== undefined &&
    left.length === right.length &&
    left.every((item, index) => item === right[index]);
}
