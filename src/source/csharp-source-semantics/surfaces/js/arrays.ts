import {
  acceptObservation,
  rejectObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpJsSurfaceHost } from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  isCsharpValueTypeTargetType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetMethod,
  targetOperation,
  targetParameter,
} from "./source-library.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  getCsharpArrayLikeElementType,
} from "./array-carriers.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";

export function mapCsharpJsArrayElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const elementType = getCsharpArrayLikeElementType(receiverType);
  if (elementType === undefined) {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!host.isIntegralTargetTypeRef(indexType) && !host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array element access requires an integral provider-backed index type."));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.array.indexer", "indexer", "Item", {
    resultType: elementType,
  }), [{ message: "C# JS surface array indexer operation recorded from checked TypeScript element access." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item", {
      resultType: elementType,
    }),
  }, [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

export function recordCsharpJsArrayElementAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsElementAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      recordCsharpJsArrayElementAccessFact(node, context, host);
    });
  }
}

function recordCsharpJsArrayElementAccessFact(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const argument = asNodeSubject(getNodeField(node, "ArgumentExpression"));
  const sourceFile = compiler.ast.getSourceFile(node);
  if (receiver === undefined || argument === undefined || sourceFile === undefined) {
    return;
  }
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const request = {
    expression: node,
    receiver,
    receiverType,
    argument,
    target: csharpTargetId,
  } satisfies CheckedElementAccessMappingRequest;
  const mapped = mapCsharpJsArrayElementAccess(
    request,
    context as ExtensionObservationContext<"operation.mapCheckedElementAccess">,
    host.unwrapNullableTargetType(
      host.getTargetTypeRefForSubject(receiverType, context, csharpJsCheckedTypeQuery) ??
        host.getTargetTypeRefForSubject(receiver, context, csharpJsCheckedTypeQuery),
    ),
    host,
  );
  if (mapped?.kind !== "accept") {
    return;
  }
  const csharpOperation = context.host.facts.get(node, csharpTargetOperationFactKey);
  context.host.facts.set(node, targetOperationFactKey, csharpOperation?.kind === "member" && csharpOperation.operationKind === "indexer"
    ? targetOperation(csharpOperation.operationId, "indexer", csharpOperation.memberName, {
        ...(csharpOperation.resultType !== undefined ? { resultType: csharpOperation.resultType } : {}),
      })
    : mapped.value.operation, mapped.evidence ?? [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

export function getArrayTargetMembers(sourceName: string, receiverElementType?: TargetTypeRef): readonly TargetMember[] {
  const itemType: TargetTypeRef = receiverElementType ?? { kind: "type-parameter", name: "T" };
  const mappedItemType: TargetTypeRef = { kind: "type-parameter", name: "U" };
  const enumerableType: TargetTypeRef = csharpEnumerableTargetType(itemType);
  const readOnlyListType: TargetTypeRef = csharpReadOnlyListTargetType(itemType);
  const listType: TargetTypeRef = csharpListTargetType(itemType);
  const intType = csharpSourcePrimitiveTargetType("int32");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const stringType = csharpStringTargetType();
  const arrayHelpersType = csharpTargetNamedType("Tsonic.CSharp.Js.Array", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Array"));
  switch (sourceName) {
    case "from":
      return [
        arrayStaticMethod(sourceName, "from", [targetParameter("iterable", enumerableType)], listType, arrayHelpersType, "from:array:native"),
        arrayStaticMethod(sourceName, "from", [targetParameter("source", stringType)], csharpListTargetType(stringType), arrayHelpersType, "from:string:native"),
        arrayStaticMethod(sourceName, "from", [
          targetParameter("iterable", enumerableType),
          targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType, intType], itemType)),
        ], listType, arrayHelpersType, "from:array:indexed-map:native"),
        arrayStaticMethod(sourceName, "from", [
          targetParameter("iterable", enumerableType),
          targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType], itemType)),
        ], listType, arrayHelpersType, "from:array:map:native"),
      ];
    case "of":
      return [
        arrayStaticMethod(sourceName, "of", [
          targetParameter("items", itemType, { paramsArray: true }),
        ], listType, arrayHelpersType, "of:native"),
      ];
    case "isArray":
      return [
        arrayStaticMethod(sourceName, "isArray", [
          targetParameter("value", readOnlyListType),
        ], boolType, arrayHelpersType, "isArray:native"),
      ];
    case "push":
      return [arrayHelperMethod(sourceName, "push", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType)];
    case "pop":
      return receiverElementType === undefined
        ? []
        : arrayNullishElementHelpers(sourceName, "popValue", "popReference", [
          targetParameter("array", listType),
        ], itemType, arrayHelpersType);
    case "shift":
      return receiverElementType === undefined
        ? []
        : arrayNullishElementHelpers(sourceName, "shiftValue", "shiftReference", [
          targetParameter("array", listType),
        ], itemType, arrayHelpersType);
    case "unshift":
      return [arrayHelperMethod(sourceName, "unshift", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType)];
    case "concat":
      return [arrayHelperMethod(sourceName, "concat", [
        targetParameter("array", enumerableType),
        targetParameter("items", enumerableType, { paramsArray: true }),
      ], listType, arrayHelpersType)];
    case "at":
      return receiverElementType === undefined
        ? []
        : arrayAtHelpers(sourceName, readOnlyListType, itemType, intType, arrayHelpersType);
    case "includes":
      return [arrayHelperMethod(sourceName, "includes", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], boolType, arrayHelpersType)];
    case "indexOf":
      return [arrayHelperMethod(sourceName, "indexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType)];
    case "lastIndexOf":
      return [arrayHelperMethod(sourceName, "lastIndexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType)];
    case "join":
      return [arrayHelperMethod(sourceName, "join", [targetParameter("array", readOnlyListType), targetParameter("separator", stringType, { optional: true })], stringType, arrayHelpersType)];
    case "slice":
      return [arrayHelperMethod(sourceName, "slice", [targetParameter("array", readOnlyListType), targetParameter("start", intType, { optional: true }), targetParameter("end", intType, { optional: true })], listType, arrayHelpersType)];
    case "splice":
      return [arrayHelperMethod(sourceName, "splice", [
        targetParameter("array", listType),
        targetParameter("start", intType),
        targetParameter("deleteCount", csharpNullableValueTargetType(intType), { optional: true }),
        targetParameter("items", itemType, { paramsArray: true }),
      ], listType, arrayHelpersType)];
    case "reverse":
      return [arrayHelperMethod(sourceName, "reverse", [targetParameter("array", listType)], listType, arrayHelpersType)];
    case "sort":
      return arrayCallbackHelpers(sourceName, "sort", "System.Func", itemType, csharpSourcePrimitiveTargetType("float64"), listType, listType, arrayHelpersType, { compareCallback: true, mutable: true });
    case "forEach":
      return arrayCallbackHelpers(sourceName, "forEach", "System.Action", itemType, csharpVoidTargetType(), csharpVoidTargetType(), readOnlyListType, arrayHelpersType);
    case "some":
      return arrayCallbackHelpers(sourceName, "some", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType);
    case "every":
      return arrayCallbackHelpers(sourceName, "every", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType);
    case "filter":
      return arrayCallbackHelpers(sourceName, "filter", "System.Func", itemType, boolType, listType, readOnlyListType, arrayHelpersType);
    case "map":
      return arrayCallbackHelpers(sourceName, "map", "System.Func", itemType, mappedItemType, csharpListTargetType(mappedItemType), readOnlyListType, arrayHelpersType, { typeParameters: [{ name: "U" }] });
    case "find":
      return receiverElementType === undefined
        ? []
        : arrayNullishElementCallbackHelpers(sourceName, "findValue", "findReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType);
    case "findIndex":
      return arrayCallbackHelpers(sourceName, "findIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType);
    case "findLast":
      return receiverElementType === undefined
        ? []
        : arrayNullishElementCallbackHelpers(sourceName, "findLastValue", "findLastReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType);
    case "findLastIndex":
      return arrayCallbackHelpers(sourceName, "findLastIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType);
    default:
      return [];
  }
}

function arrayCallbackHelpers(
  sourceName: string,
  targetName: string,
  delegateKind: "System.Action" | "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  memberReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly compareCallback?: boolean; readonly mutable?: boolean; readonly typeParameters?: readonly TargetTypeParameter[]; readonly idBase?: string } = {},
): readonly TargetMember[] {
  const intType = csharpSourcePrimitiveTargetType("int32");
  const callbackShapes: readonly TargetTypeRef[] = options.compareCallback === true
    ? [csharpDelegateTargetType("System.Func", [itemType, itemType], callbackReturnType)]
    : delegateKind === "System.Action"
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
  const idBase = options.idBase ?? sourceName;
  return callbackShapes.map((callback, index) => arrayHelperMethod(sourceName, targetName, [
    targetParameter("array", arrayType),
    targetParameter("callback", callback),
  ], memberReturnType, declaringType, { idSuffix: `${idBase}:${index + 1}`, typeParameters: options.typeParameters }));
}

function arrayNullishElementHelpers(
  sourceName: string,
  valueTargetName: string,
  referenceTargetName: string,
  parameters: readonly TargetParameter[],
  itemType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly TargetMember[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : [
        arrayHelperMethod(sourceName, selection.targetName, parameters, csharpNullableTargetType(itemType), declaringType, {
          idSuffix: `${sourceName}:${selection.kind}`,
        }),
      ];
}

function arrayNullishElementCallbackHelpers(
  sourceName: string,
  valueTargetName: string,
  referenceTargetName: string,
  delegateKind: "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly TargetMember[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : arrayCallbackHelpers(
        sourceName,
        selection.targetName,
        delegateKind,
        itemType,
        callbackReturnType,
        csharpNullableTargetType(itemType),
        arrayType,
        declaringType,
        { idBase: `${sourceName}:${selection.kind}` },
      );
}

function getNullishElementHelperSelection(
  itemType: TargetTypeRef,
  valueTargetName: string,
  referenceTargetName: string,
): { readonly kind: "value"; readonly targetName: string } | { readonly kind: "reference"; readonly targetName: string } | undefined {
  if (isCsharpValueTypeTargetType(itemType)) {
    return { kind: "value", targetName: valueTargetName };
  }
  return itemType.kind === "type-parameter"
    ? undefined
    : { kind: "reference", targetName: referenceTargetName };
}

function arrayAtHelpers(
  sourceName: string,
  arrayType: TargetTypeRef,
  itemType: TargetTypeRef,
  intType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly TargetMember[] {
  if (isCsharpValueTypeTargetType(itemType)) {
    return [arrayHelperMethod(sourceName, "atValue", [
      targetParameter("array", arrayType),
      targetParameter("index", intType),
    ], csharpNullableTargetType(itemType), declaringType, {
      idSuffix: `${sourceName}:value`,
    })];
  }
  if (itemType.kind === "type-parameter") {
    return [];
  }
  return [arrayHelperMethod(sourceName, "atReference", [
    targetParameter("array", arrayType),
    targetParameter("index", intType),
  ], csharpNullableTargetType(itemType), declaringType, {
    idSuffix: `${sourceName}:reference`,
  })];
}

function arrayStaticMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  idSuffix = sourceName,
): TargetMember {
  const owner = declaringType.kind === "target-named" ? declaringType.id.replace(/`.*$/, "") : "Tsonic.CSharp.Js.Array";
  return targetMethod(`${owner}.${idSuffix}`, sourceName, targetName, parameters, returnType, {
    declaringType,
    static: true,
  });
}

function arrayHelperMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly idSuffix?: string; readonly typeParameters?: readonly TargetTypeParameter[] } = {},
): TargetMember {
  const member = targetMethod(`Tsonic.CSharp.Js.Array.${options.idSuffix ?? sourceName}`, sourceName, targetName, parameters, returnType, {
    declaringType,
    static: true,
    receiverPassing: "first-argument",
  });
  return options.typeParameters === undefined
    ? member
    : {
        ...member,
        typeParameters: options.typeParameters,
      };
}

export {
  getCsharpArrayLengthMember,
  getCsharpArrayLikeElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./array-carriers.js";
