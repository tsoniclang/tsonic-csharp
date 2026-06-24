import {
  acceptObservation,
  rejectObservation,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  ExtensionFactSubject,
  Node,
  SourceFile,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getArrayTargetMembers,
  getCsharpArrayLikeElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./arrays.js";
import {
  getMathTargetMembers,
} from "./math.js";
import {
  getObjectTargetMembers,
  isCsharpJsObjectCarrierTargetType,
} from "./objects.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "./console.js";
import {
  getRegExpTargetMembers,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpTargetOperationFromMember,
  csharpJsCheckedTypeQuery,
  getSourceLibraryMember,
  recordCsharpTargetOperation,
} from "./source-library.js";
import {
  getStringTargetMembers,
} from "./strings.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "./unsupported.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const consoleCall = mapCsharpJsConsoleCheckedCall(request, context, sourceMember, host);
  if (consoleCall !== undefined) {
    return consoleCall;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' because the selected receiver lacks finalized target runtime facts.`));
  }
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE", 9100113, `C# JS surface call '${sourceMember.declaringName}.${sourceMember.memberName}' requires exact selected TypeScript library signature identity because the declaration maps to multiple target members.`));
  }
  const member = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context, sourceLibraryCallSelectionOptions(request, context, sourceMember, host));
  if (member === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' to a unique target member from finalized argument facts.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{ message: `C# JS surface target call operation recorded from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

export function recordCsharpSourceLibraryCallFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext) as unknown as ExtensionObservationContext<"operation.mapCheckedCall">;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host);
    });
  }
}

function recordCsharpSourceLibraryCallFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (
    compiler === undefined ||
    !compiler.ast.is.IsCallExpression(node) ||
    context.host.facts.get(node, selectedTargetSignatureFactKey) !== undefined
  ) {
    return;
  }
  const callee = asNodeSubject(getNodeField(node, "Expression"));
  if (callee === undefined) {
    return;
  }
  const sourceSelectedSignature = compiler.checker.getResolvedSignature(node, { sourceFile }) as ExtensionFactSubject | undefined;
  const sourceSelectedDeclaration = getSignatureDeclaration(sourceSelectedSignature);
  if (getSourceLibraryMember(sourceSelectedDeclaration, context) === undefined) {
    return;
  }
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  const calleeReceiverType = calleeReceiver === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(calleeReceiver, { sourceFile });
  const sourceSelectedDeclarationContainer = getNodeParent(sourceSelectedDeclaration);
  const mapped = mapCsharpSourceLibraryCheckedCall({
    call: node,
    callee,
    ...(calleeReceiver !== undefined ? { calleeReceiver } : {}),
    ...(calleeReceiverType !== undefined ? { calleeReceiverType } : {}),
    ...(getPropertyAccessName(callee, compiler.ast) !== undefined ? { calleePropertyName: getPropertyAccessName(callee, compiler.ast) } : {}),
    arguments: getNodeList(getNodeField(node, "Arguments")),
    ...(sourceSelectedSignature !== undefined ? { sourceSelectedSignature } : {}),
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
    ...(host.targetId !== undefined ? { target: host.targetId } : {}),
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
    selectedTargetSignatureFactKey,
    mapped.value.selectedSignature,
    mapped.evidence ?? [{ message: "C# JS surface selected target signature recorded from checked TypeScript library call before finalization." }],
  );
}

function getSignatureDeclaration(signature: ExtensionFactSubject | undefined): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}

function getNodeParent(node: Node | undefined): Node | undefined {
  return asNodeSubject((node as { readonly Parent?: unknown } | undefined)?.Parent);
}

function getPropertyAccessName(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  if (!ast.is.IsPropertyAccessExpression(node)) {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(node, "name"));
  const text = name === undefined ? "" : ast.text(name);
  return text.length === 0 ? undefined : text;
}

function sourceLibraryCallSelectionOptions(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): Parameters<CsharpJsSurfaceHost["selectTargetMember"]>[3] {
  if (sourceMember.declaringName !== "Array" && sourceMember.declaringName !== "ReadonlyArray") {
    return {};
  }
  const receiverType = getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .find((candidate) => getCsharpArrayLikeElementType(candidate) !== undefined);
  return receiverType === undefined
    ? {}
    : {
        declaringTargetType: receiverType,
        declaringTypeParameters: [{ name: "T" }],
      };
}

function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.declaringName === "Object") {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!sourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  switch (sourceMember.declaringName) {
    case "Array":
      return sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember) ||
        receiverTypes.some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
    case "ReadonlyArray":
      return receiverTypes.some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
    case "String":
      return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType));
    case "RegExp":
      return receiverTypes.some((receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType));
    default:
      return true;
  }
}

function sourceLibraryObjectCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.memberName === "hasOwnProperty") {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "keys":
    case "values":
    case "entries":
      return isSupportedObjectHelperSourceTargetType(argumentTypes[0]);
    case "assign":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        argumentTypes.slice(1).every(isSupportedObjectHelperSourceTargetType);
    default:
      return true;
  }
}

function isSupportedObjectHelperSourceTargetType(type: TargetTypeRef | undefined): boolean {
  return type !== undefined &&
    (
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      type.kind === "source-primitive" ||
      type.kind === "target-named" && type.id === "System.String"
    );
}

function sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Array" &&
    (sourceMember.memberName === "from" || sourceMember.memberName === "of" || sourceMember.memberName === "isArray");
}

function getSourceLibraryCallReceiverTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly NonNullable<ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]>>[] {
  const candidates = [
    request.calleeReceiver,
    request.calleeReceiverSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverType,
    request.calleeReceiverTypeSymbol,
  ];
  const result: NonNullable<ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]>>[] = [];
  for (const candidate of candidates) {
    const targetType = host.unwrapNullableTargetType(getTargetTypeRefForOptionalSubject(candidate, context, host));
    if (targetType !== undefined && !result.includes(targetType)) {
      result.push(targetType);
    }
  }
  return result;
}

function getSourceLibraryCallArgumentTargetTypes(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly (TargetTypeRef | undefined)[] {
  return request.arguments.map((argument) =>
    host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(argument, context, csharpJsCheckedTypeQuery)));
}

function getTargetTypeRefForOptionalSubject(
  subject: CheckedCallMappingRequest["calleeReceiverType"],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  return subject === undefined
    ? undefined
    : host.getTargetTypeRefForSubject(subject, context, csharpJsCheckedTypeQuery);
}

function sourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  switch (sourceMember.declaringName) {
    case "Array":
      return !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember);
    case "ReadonlyArray":
      return true;
    case "String":
      return sourceMember.memberName !== "fromCharCode" && sourceMember.memberName !== "fromCodePoint";
    case "RegExp":
      return sourceMember.memberName !== "constructor";
    case "Object":
      return sourceMember.memberName === "hasOwnProperty";
    default:
      return false;
  }
}

function getSourceLibraryCallMembers(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Object":
      return getObjectTargetMembers(sourceMember.memberName);
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(sourceMember.memberName);
    default:
      return [];
  }
}
