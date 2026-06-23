import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpJsSurfaceHost } from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpDelegateTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetMethod,
  targetOperation,
  targetParameter,
} from "./source-library.js";

export function mapCsharpJsArrayElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!host.isIntegralTargetTypeRef(indexType) && !host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(host.csharpProviderDiagnostic("tsonic.csharp.js-surface-operations", "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array element access requires an integral provider-backed index type."));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.array.indexer", "indexer", "Item", {
    resultType: receiverType.element,
  }), [{ message: "C# JS surface array indexer operation recorded from checked TypeScript element access." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item", {
      resultType: receiverType.element,
    }),
  }, [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

export function getArrayLengthOperation(declaringName: string): CheckedOperationMappingResult["operation"] {
  return targetOperation(`tsonic.csharp.js.${declaringName}.length`, "property", "Length", {
    resultType: csharpSourcePrimitiveTargetType("int32"),
  });
}

export function getArrayTargetMembers(sourceName: string): readonly TargetMember[] {
  const itemType: TargetTypeRef = { kind: "type-parameter", name: "T" };
  const arrayType: TargetTypeRef = { kind: "array", element: itemType };
  const intType = csharpSourcePrimitiveTargetType("int32");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const stringType = csharpStringTargetType();
  const helperType = csharpTargetNamedType("Tsonic.CSharp.Runtime.ArrayHelpers", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "ArrayHelpers"));
  switch (sourceName) {
    case "includes":
      return [arrayHelper(sourceName, "Includes", [targetParameter("array", arrayType), targetParameter("value", itemType), targetParameter("fromIndex", intType, { optional: true })], boolType, helperType)];
    case "indexOf":
      return [arrayHelper(sourceName, "IndexOf", [targetParameter("array", arrayType), targetParameter("value", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, helperType)];
    case "lastIndexOf":
      return [arrayHelper(sourceName, "LastIndexOf", [targetParameter("array", arrayType), targetParameter("value", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, helperType)];
    case "join":
      return [arrayHelper(sourceName, "Join", [targetParameter("array", arrayType), targetParameter("separator", stringType, { optional: true })], stringType, helperType)];
    case "slice":
      return [arrayHelper(sourceName, "Slice", [targetParameter("array", arrayType), targetParameter("start", intType, { optional: true }), targetParameter("end", intType, { optional: true })], arrayType, helperType)];
    case "forEach":
      return arrayCallbackHelpers(sourceName, "ForEach", "System.Action", itemType, arrayType, csharpVoidTargetType(), csharpVoidTargetType(), helperType);
    case "some":
      return arrayCallbackHelpers(sourceName, "Some", "System.Func", itemType, arrayType, boolType, boolType, helperType);
    case "every":
      return arrayCallbackHelpers(sourceName, "Every", "System.Func", itemType, arrayType, boolType, boolType, helperType);
    case "findIndex":
      return arrayCallbackHelpers(sourceName, "FindIndex", "System.Func", itemType, arrayType, boolType, intType, helperType);
    case "findLastIndex":
      return arrayCallbackHelpers(sourceName, "FindLastIndex", "System.Func", itemType, arrayType, boolType, intType, helperType);
    default:
      return [];
  }
}

function arrayCallbackHelpers(
  sourceName: string,
  targetName: string,
  delegateKind: "System.Action" | "System.Func",
  itemType: TargetTypeRef,
  arrayType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  memberReturnType: TargetTypeRef,
  helperType: TargetTypeRef,
): readonly TargetMember[] {
  const intType = csharpSourcePrimitiveTargetType("int32");
  const callbackShapes: readonly TargetTypeRef[] = delegateKind === "System.Action"
    ? [
        csharpDelegateTargetType("System.Action", [itemType]),
        csharpDelegateTargetType("System.Action", [itemType, intType]),
        csharpDelegateTargetType("System.Action", [itemType, intType, arrayType]),
      ]
    : [
        csharpDelegateTargetType("System.Func", [itemType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType, arrayType], callbackReturnType),
      ];
  return callbackShapes.map((callback, index) => arrayHelper(`${sourceName}:${index + 1}`, targetName, [
    targetParameter("array", arrayType),
    targetParameter("callback", callback),
  ], memberReturnType, helperType, sourceName));
}

function arrayHelper(
  idSuffix: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  helperType: TargetTypeRef,
  sourceName = idSuffix,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Runtime.ArrayHelpers.${idSuffix}`, sourceName, targetName, parameters, returnType, {
    declaringType: helperType,
    static: true,
    receiverPassing: "first-argument",
  });
}
