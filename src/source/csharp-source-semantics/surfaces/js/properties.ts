import {
  acceptObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
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
  recordCsharpTargetOperation,
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
  getCsharpArrayLengthMember,
  getCsharpArrayLikeElementType,
} from "./arrays.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
  getRegExpPropertyTargetMember,
} from "./regexp.js";
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
  createRuntimeCarrierLifecycleObservationContext,
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
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext) as unknown as ExtensionObservationContext<"operation.mapCheckedPropertyAccess">;
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
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const name = asNodeSubject(getNodeField(node, "name"));
  if (receiver === undefined || name === undefined) {
    return;
  }
  const propertySymbol = compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(node, { sourceFile });
  const declaration = firstSymbolDeclaration(propertySymbol);
  if (getSourceLibraryMember(declaration, context) === undefined) {
    return;
  }
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const mapped = mapCsharpDirectSourceLibraryCheckedPropertyAccess({
    expression: node,
    receiver,
    ...(receiverType !== undefined ? { receiverType } : {}),
    propertyName: compiler.ast.text(name),
    ...(propertySymbol !== undefined ? { sourceSelectedPropertySymbol: propertySymbol } : {}),
    ...(declaration !== undefined ? { sourceSelectedDeclaration: declaration } : {}),
    target: host.targetId,
  }, context, host);
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
  }
  context.host.facts.set(
    node,
    targetOperationFactKey,
    mapped.value.operation,
    mapped.evidence ?? [{ message: "C# JS surface selected target property operation recorded from checked TypeScript library property before finalization." }],
  );
}

function firstSymbolDeclaration(symbol: unknown): Node | undefined {
  return ((symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (symbol as { readonly declarations?: readonly Node[] } | undefined)?.declarations)?.[0];
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
  if (sourceMember.declaringName === "Console") {
    return undefined;
  }
  if (sourceMember.declaringName === "Object") {
    return hasObjectTargetMember(sourceMember.memberName)
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
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function sourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember: SourceLibraryMember): boolean {
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
  return false;
}

function getSourceLibraryPropertyReceiverType(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  if (sourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember)) {
    return context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier;
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
    const lengthMember = getCsharpArrayLengthMember(receiverType);
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
