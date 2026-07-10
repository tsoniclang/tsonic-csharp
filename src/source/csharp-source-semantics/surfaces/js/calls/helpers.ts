import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../arrays.js";
import {
  getCsharpJsArrayRuntimeCarrierForType,
} from "../array-carriers.js";
import {
  getCsharpJsCollectionRuntimeCarrierForType,
} from "../collections.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  asType,
  csharpSourcePrimitiveTargetType,
  csharpJsCheckedTypeQuery,
} from "../source-library.js";
import {
  asNodeSubject,
} from "../../../ast-utils.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../../../checked-call-request-context.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../../dictionaries.js";
import {
  getReferencedDeclarationTargetTypeRef,
} from "../../../referenced-declaration-target.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../dictionaries.js";

export function getNonSemanticTargetType(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node))) {
    return undefined;
  }
  return host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(subject, context, {
    ...csharpJsCheckedTypeQuery,
    allowSemanticTypeQuery: false,
  }));
}

export function isNumericSourcePrimitive(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" &&
    (
      type.name === "float64" ||
      type.name === "float32" ||
      type.name === "int32" ||
      type.name === "uint32" ||
      type.name === "int16" ||
      type.name === "uint16" ||
      type.name === "int8" ||
      type.name === "uint8"
    );
}

export function isNewExpression(
  subject: unknown,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const node = asNodeSubject(subject as ExtensionFactSubject | undefined);
  if (node === undefined) {
    return false;
  }
  const ast = context.compiler?.ast;
  return ast?.is.IsNewExpression(node) === true;
}

export function getSourceLibraryCallReceiverElementType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .map(getCsharpArrayLikeElementType)
    .find((element): element is TargetTypeRef => element !== undefined);
}

export function getSourceLibraryCallReceiverTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetTypeRef[] {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const candidates = [
    requestContext.calleeReceiver,
    requestContext.calleeReceiverType,
    requestContext.calleeReceiverTypeSymbol,
  ];
  const result: TargetTypeRef[] = [];
  for (const candidate of candidates) {
    const targetType = host.unwrapNullableTargetType(getSourceLibraryReceiverTargetTypeForSubject(candidate, context, host));
    if (targetType !== undefined && !result.includes(targetType)) {
      result.push(targetType);
    }
  }
  return result;
}

export function getSourceLibraryCallArgumentTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly (TargetTypeRef | undefined)[] {
  return request.arguments.map((argument) => {
    const node = asNodeSubject(argument);
    const isNestedCall = node !== undefined &&
      (context.compiler?.ast.is.IsCallExpression(node) === true || context.compiler?.ast.is.IsNewExpression(node) === true);
    const sourceFile = node === undefined ? undefined : context.compiler?.ast.getSourceFile(node);
    return isNestedCall
      ? host.unwrapNullableTargetType(
          context.facts.get(argument, selectedTargetSignatureFactKey)?.member.returnType ??
            context.facts.get(argument, runtimeCarrierFactKey)?.carrier ??
            context.factResolver.resolve(argument, selectedTargetSignatureFactKey)?.member.returnType ??
            context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier,
        )
      : host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(argument, context, {
          ...csharpJsCheckedTypeQuery,
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
          sourceFile,
        }) ?? getReferencedDeclarationTargetTypeRef(argument, context, host.getTargetTypeRefForSubject, {
          ...csharpJsCheckedTypeQuery,
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: true,
          sourceFile,
        }) ?? host.getTargetTypeRefForSubject(argument, context, {
          ...csharpJsCheckedTypeQuery,
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: true,
          sourceFile,
        }));
  });
}

export function getSourceLibraryCallResultTargetType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const sourceReturnType = asType(request.sourceReturnType);
  return host.unwrapNullableTargetType(
    context.facts.get(request.call, selectedTargetSignatureFactKey)?.member.returnType ??
      context.facts.get(request.call, runtimeCarrierFactKey)?.carrier ??
      context.factResolver.resolve(request.call, selectedTargetSignatureFactKey)?.member.returnType ??
      context.factResolver.resolve(request.call, runtimeCarrierFactKey)?.carrier ??
      getCsharpJsCollectionRuntimeCarrierForType(sourceReturnType, context, host) ??
      getCsharpJsArrayRuntimeCarrierForType(sourceReturnType, context, host) ??
      host.getTargetTypeRefForSubject(request.call, context, {
        ...csharpJsCheckedTypeQuery,
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}

export function isStringKeyedRecordDictionaryTargetType(
  type: TargetTypeRef,
  host: CsharpJsSurfaceHost,
): type is CsharpRecordDictionaryTargetTypeRef {
  const typeArguments = type.kind === "target-named" ? type.typeArguments ?? [] : [];
  const keyType = typeArguments[0];
  return isCsharpRecordDictionaryTargetType(type) &&
    host.isCsharpStringType(keyType);
}

function getSourceLibraryReceiverTargetTypeForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  if (subject === undefined) {
    return undefined;
  }
  const localFactTarget = getTargetTypeRefFromLocalFacts(subject, context);
  if (localFactTarget !== undefined) {
    return localFactTarget;
  }
  const resolvedFactTarget = getTargetTypeRefFromResolvedFacts(subject, context);
  if (resolvedFactTarget !== undefined) {
    return resolvedFactTarget;
  }
  if (asType(subject) !== undefined) {
    return undefined;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node))) {
    return localFactTarget;
  }
  const referencedDeclarationTarget = getReferencedDeclarationTargetTypeRef(subject, context, host.getTargetTypeRefForSubject, {
    ...csharpJsCheckedTypeQuery,
    allowSemanticTypeQuery: false,
  });
  if (referencedDeclarationTarget !== undefined) {
    return referencedDeclarationTarget;
  }
  return host.getTargetTypeRefForSubject(subject, context, {
      ...csharpJsCheckedTypeQuery,
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: false,
    });
}

function getTargetTypeRefFromLocalFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  return context.facts.get(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    context.facts.get(subject, runtimeCarrierFactKey)?.carrier;
}

function getTargetTypeRefFromResolvedFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  return context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    (primitive === undefined ? undefined : csharpSourcePrimitiveTargetType(primitive.kind));
}
