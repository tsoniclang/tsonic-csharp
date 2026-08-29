import {
  csharpEnumerableTargetType,
  csharpObjectTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpImplicitArrayInputElementTargetType,
  getCsharpTaskResultTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../types/index.js";
import { csharpConversionIsApplicable } from "./expression.js";
import { namedTargetTypeImplicitlyAccepts, namedTargetTypesAreRelated, selectDelegateConversion, selectJsValueConversion, selectNullableConversion, selectRuntimeUnionConversion } from "./carriers.js";
import { selectProviderConversionOperator } from "./provider-operators.js";
import { sourcePrimitiveImplicitlyConverts } from "../source-primitives.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "./model.js";
import type { CsharpPolicyContext } from "../../context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";

export function selectCsharpConversion(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection {
  if (source === undefined || target === undefined) {
    return {
      kind: "rejected",
      reason:
        "C# conversion requires closed source and target representations.",
    };
  }
  if (targetTypeRefEquals(source, target)) {
    return { kind: "identity" };
  }
  const jsValueConversion = selectJsValueConversion(
    source,
    target,
  );
  if (jsValueConversion !== undefined) {
    return jsValueConversion;
  }
  if (
    getCsharpTaskResultTargetType(source) !== undefined ||
    getCsharpTaskResultTargetType(target) !== undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "Task carriers cannot be unwrapped, reinterpreted, or changed in arity without an exact target conversion relation.",
    };
  }
  const runtimeUnion = selectRuntimeUnionConversion(source, target, mode);
  if (runtimeUnion !== undefined) {
    return runtimeUnion;
  }
  const tuple = selectTupleConversion(input, source, target, mode);
  if (tuple !== undefined) {
    return tuple;
  }
  const nullable = selectNullableConversion(input, source, target, mode);
  if (nullable !== undefined) {
    return nullable;
  }
  const collectionInterface = selectCollectionInterfaceConversion(
    source,
    target,
  );
  if (collectionInterface !== undefined) {
    return collectionInterface;
  }
  if (sourcePrimitiveImplicitlyConverts(target, source)) {
    return { kind: "implicit", proof: "numeric" };
  }
  if (
    mode === "explicit" &&
    source.kind === "source-primitive" &&
    target.kind === "source-primitive"
  ) {
    return { kind: "cast", proof: "numeric" };
  }
  const delegate = selectDelegateConversion(input, source, target);
  if (delegate !== undefined) {
    return delegate;
  }
  if (
    targetTypeRefEquals(target, csharpObjectTargetType()) &&
    targetTypeImplicitlyConvertsToObject(source)
  ) {
    return { kind: "implicit", proof: "reference" };
  }
  if (namedTargetTypeImplicitlyAccepts(input, source, target, new Set())) {
    return { kind: "implicit", proof: "reference" };
  }
  const providerOperator = selectProviderConversionOperator(
    input,
    source,
    target,
    mode,
  );
  if (providerOperator.kind !== "none") {
    return providerOperator;
  }
  if (
    mode === "explicit" &&
    namedTargetTypesAreRelated(input, source, target)
  ) {
    return { kind: "cast", proof: "reference" };
  }
  return {
    kind: "rejected",
    reason:
      `No exact C# ${mode} conversion relates '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.`,
  };
}

function selectTupleConversion(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  if (source.kind !== "tuple" || target.kind !== "tuple") {
    return undefined;
  }
  if (source.elements.length !== target.elements.length) {
    return {
      kind: "rejected",
      reason: "C# tuple conversion requires equal source and target arity.",
    };
  }
  const elementConversions = source.elements.map((element, index) =>
    selectCsharpConversion(
      input,
      element,
      target.elements[index],
      mode,
    )
  );
  if (
    elementConversions.every((conversion) =>
      conversionIsImplicitlyApplicable(conversion)
    )
  ) {
    return { kind: "implicit", proof: "tuple" };
  }
  if (
    mode === "explicit" &&
    elementConversions.every((conversion) =>
      csharpConversionIsApplicable(conversion, mode)
    )
  ) {
    return { kind: "cast", proof: "tuple" };
  }
  return {
    kind: "rejected",
    reason:
      `C# tuple ${mode} conversion requires every corresponding element conversion to be applicable.`,
  };
}

export function conversionIsImplicitlyApplicable(
  selection: CsharpConversionSelection,
): boolean {
  return selection.kind === "identity" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter";
}

function targetTypeImplicitlyConvertsToObject(
  source: TargetTypeRef,
): boolean {
  switch (source.kind) {
    case "source-primitive":
    case "array":
    case "tuple":
      return true;
    case "target-named":
      return (source as CsharpTargetNamedTypeRef).csharpSpecialType !== "void";
    case "source-global":
    case "type-parameter":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

function selectCollectionInterfaceConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const implicitArrayInputElement =
    getCsharpImplicitArrayInputElementTargetType(target);
  if (
    source.kind === "array" &&
    implicitArrayInputElement !== undefined &&
    targetTypeRefEquals(source.element, implicitArrayInputElement)
  ) {
    return { kind: "implicit", proof: "collection-interface" };
  }
  const element = getCsharpCollectionElementTargetType(source);
  return element !== undefined &&
      targetTypeRefEquals(target, csharpEnumerableTargetType(element))
    ? { kind: "implicit", proof: "collection-interface" }
    : undefined;
}
