import {
  ExtensionObservationPoint,
  acceptObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpTargetOperationFromMember,
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  getSourceLibraryMember,
  isSourceLibraryType,
  recordCsharpTargetOperation,
  targetOperation,
  targetOperationFromMember,
  targetProperty,
} from "./source-library.js";
import {
  getMathPropertyTargetMember,
} from "./math.js";
import {
  hasObjectTargetMember,
} from "./objects.js";
import {
  getJsonTargetMembers,
} from "./json.js";
import {
  getCsharpArrayLengthMember,
  getCsharpArrayLikeElementType,
} from "./arrays.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
  getRegExpPropertyTargetMember,
} from "./regexp.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  getNumberPropertyTargetMember,
} from "./numbers.js";
import {
  getCollectionPropertyTargetMember,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  csharpJsSourceLibraryMemberHasCallableTarget,
} from "./policy.js";
import {
  rejectUnmappedCsharpJsSourceLibraryPropertyAccess,
  rejectUnsupportedCsharpJsSourceLibraryPropertyAccess,
} from "./unsupported.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createCsharpLifecycleObservationContext,
} from "../../runtime-carriers.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  return mapCsharpSourceLibraryPropertyOperation(request, context, sourceMember, host);
}

export function recordCsharpSourceLibraryPropertyFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createCsharpLifecycleObservationContext(lifecycleContext, ExtensionObservationPoint.mapCheckedPropertyAccess);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpSourceLibraryPropertyFact(node, sourceFile, context, host);
    });
  }
}

function recordCsharpSourceLibraryPropertyFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined || !compiler.ast.is.IsPropertyAccessExpression(node)) {
    return;
  }
  if (
    context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
    context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined
  ) {
    return;
  }
  if (isCallCalleePropertyAccess(node, compiler.ast)) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const name = asNodeSubject(getNodeField(node, "name"));
  if (receiver === undefined || name === undefined) {
    return;
  }
  const propertySymbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(name, { sourceFile }) ??
    compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(node, { sourceFile });
  const declaration = firstSymbolDeclaration(propertySymbol);
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const sourceMember = getSourceLibraryMember(declaration, context) ??
    getSourceLibraryMemberFromReceiverType(receiverType, compiler.ast.text(name), context);
  if (sourceMember === undefined) {
    return;
  }
  const mapped = mapCsharpSourceLibraryPropertyOperation({
    expression: node,
    receiver,
    ...(receiverType !== undefined ? { receiverType } : {}),
    propertyName: compiler.ast.text(name),
    ...(propertySymbol !== undefined ? { sourceSelectedPropertySymbol: propertySymbol } : {}),
    ...(declaration !== undefined ? { sourceSelectedDeclaration: declaration } : {}),
    target: host.targetId,
  }, context, sourceMember, host);
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
  }
}

function isCallCalleePropertyAccess(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): boolean {
  if (ast === undefined) {
    return false;
  }
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsCallExpression(parent) &&
    asNodeSubject(getNodeField(parent, "Expression")) === node;
}

function firstSymbolDeclaration(symbol: unknown): Node | undefined {
  return ((symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (symbol as { readonly declarations?: readonly Node[] } | undefined)?.declarations)?.[0];
}

function getSourceLibraryMemberFromReceiverType(
  receiverType: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  memberName: string,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  if (receiverType === undefined || memberName.length === 0) {
    return undefined;
  }
  const declaringName = isSourceLibraryType(receiverType, context, "Array")
    ? "Array"
    : isSourceLibraryType(receiverType, context, "ReadonlyArray")
        ? "ReadonlyArray"
        : isSourceLibraryType(receiverType, context, "String")
          ? "String"
          : isSourceLibraryType(receiverType, context, "Boolean")
            ? "Boolean"
            : isSourceLibraryType(receiverType, context, "RegExp")
              ? "RegExp"
              : isSourceLibraryType(receiverType, context, "Date")
                ? "Date"
                : isSourceLibraryType(receiverType, context, "Map")
                  ? "Map"
                  : isSourceLibraryType(receiverType, context, "ReadonlyMap")
                    ? "ReadonlyMap"
                    : isSourceLibraryType(receiverType, context, "Set")
                      ? "Set"
                      : isSourceLibraryType(receiverType, context, "ReadonlySet")
                        ? "ReadonlySet"
                        : undefined;
  return declaringName === undefined ? undefined : { declaringName, memberName };
}

function mapCsharpSourceLibraryPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  if (sourceLibrarySelectedDeclarationHasCallTarget(sourceMember)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(
        `tsonic.csharp.js.${sourceMember.declaringName}.${sourceMember.memberName}.callee`,
        "method",
        `${sourceMember.declaringName}.${sourceMember.memberName}`,
      ),
    }, [{ message: `C# JS surface callable property accepted from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'. Call expressions record the concrete target member; standalone callable values require finalized callable carrier facts before emission.` }]);
  }
  if (sourceMember.declaringName === "Console") {
    return undefined;
  }
  if (sourceMember.declaringName === "Object") {
    return hasObjectTargetMember(sourceMember.memberName)
      ? undefined
      : rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  if (sourceMember.declaringName === "JSON") {
    return getJsonTargetMembers(sourceMember.memberName).length > 0
      ? undefined
      : rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const receiverType = getSourceLibraryPropertyReceiverType(request, context, sourceMember, host);
  if (receiverType === undefined && sourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember)) {
    return undefined;
  }
  if (!sourceLibraryPropertyReceiverHasClosedFacts(receiverType, sourceMember, host)) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const member = getSourceLibraryPropertyMember(sourceMember, receiverType);
  if (member === undefined) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  if (!sourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember) || receiverType?.kind !== "array") {
    recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: sourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember)
      ? targetOperation(member.id, "property", sourceMember.memberName, {
          ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
        })
      : targetOperationFromMember(member),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function sourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Array" ||
    sourceMember.declaringName === "ReadonlyArray" ||
    sourceMember.declaringName === "Map" ||
    sourceMember.declaringName === "ReadonlyMap" ||
    sourceMember.declaringName === "Set" ||
    sourceMember.declaringName === "ReadonlySet";
}

function sourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray";
}

function sourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.declaringName === "Math") {
    return true;
  }
  if (sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray") {
    return getCsharpArrayLikeElementType(receiverType) !== undefined;
  }
  if (sourceMember.declaringName === "String") {
    return host.isCsharpStringType(receiverType);
  }
  if (sourceMember.declaringName === "RegExp") {
    return isCsharpJsRegExpRuntimeCarrier(receiverType);
  }
  if (sourceMember.declaringName === "Date") {
    return isCsharpJsDateRuntimeCarrier(receiverType);
  }
  if (sourceMember.declaringName === "Boolean") {
    return isCsharpBooleanTargetType(receiverType);
  }
  if (sourceMember.declaringName === "Number") {
    return getNumberPropertyTargetMember(sourceMember.memberName) !== undefined;
  }
  if (sourceMember.declaringName === "Map" || sourceMember.declaringName === "ReadonlyMap") {
    return isCsharpJsMapTargetType(receiverType);
  }
  if (sourceMember.declaringName === "Set" || sourceMember.declaringName === "ReadonlySet") {
    return isCsharpJsSetTargetType(receiverType);
  }
  return false;
}

function getSourceLibraryPropertyReceiverType(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  if (sourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember)) {
    return host.unwrapNullableTargetType(
      context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
        (request.receiverType === undefined ? undefined : context.factResolver.resolve(request.receiverType, runtimeCarrierFactKey)?.carrier) ??
        host.getTargetTypeRefForSubject(request.receiver, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }) ??
          host.getTargetTypeRefForSubject(request.receiverType, context, {
            allowRuntimeCarrier: true,
            allowSemanticTypeQuery: false,
          }),
    );
  }
  return host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(request.receiverType, context, csharpJsCheckedTypeQuery),
  );
}

function getSourceLibraryPropertyMember(sourceMember: SourceLibraryMember, receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>): TargetMember | undefined {
  if (sourceMember.memberName !== "length") {
    switch (sourceMember.declaringName) {
      case "Math":
        return getMathPropertyTargetMember(sourceMember.memberName);
      case "RegExp":
        return getRegExpPropertyTargetMember(sourceMember.memberName);
      case "Number":
        return getNumberPropertyTargetMember(sourceMember.memberName);
      case "Map":
      case "ReadonlyMap":
      case "Set":
      case "ReadonlySet":
        return getCollectionPropertyTargetMember(sourceMember, receiverType);
      default:
        return undefined;
    }
  }
  if (
    sourceMember.declaringName === "String"
  ) {
    return targetProperty(
      `tsonic.csharp.js.${sourceMember.declaringName}.length`,
      sourceMember.memberName,
      "Length",
      csharpSourcePrimitiveTargetType("int32"),
    );
  }
  if (
    sourceMember.declaringName === "Array" ||
    sourceMember.declaringName === "ReadonlyArray"
  ) {
    const lengthMember = receiverType?.kind === "array"
      ? "length"
      : getCsharpArrayLengthMember(receiverType);
    if (lengthMember === undefined) {
      return undefined;
    }
    return targetProperty(
      `tsonic.csharp.js.${sourceMember.declaringName}.length`,
      sourceMember.memberName,
      lengthMember,
      csharpSourcePrimitiveTargetType("int32"),
    );
  }
  return undefined;
}

function sourceLibrarySelectedDeclarationHasCallTarget(sourceMember: SourceLibraryMember): boolean {
  return csharpJsSourceLibraryMemberHasCallableTarget(sourceMember);
}
