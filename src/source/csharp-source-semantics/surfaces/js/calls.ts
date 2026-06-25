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
  getObjectRecordDictionaryTargetMembers,
  isCsharpJsObjectCarrierTargetType,
} from "./objects.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "./console.js";
import {
  getRegExpTargetMembers,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import {
  getDateTargetMembers,
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  getJsonTargetMembers,
} from "./json.js";
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
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

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
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  const prevalidatedMember = getPrevalidatedSourceLibraryCallMember(sourceMember, candidates, request, context, host);
  if (sourceMember.declaringName === "Date" && prevalidatedMember === undefined) {
    return undefined;
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' because the selected receiver lacks finalized target runtime facts.`));
  }
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined && prevalidatedMember === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE", 9100113, `C# JS surface call '${sourceMember.declaringName}.${sourceMember.memberName}' requires exact selected TypeScript library signature identity because the declaration maps to multiple target members.`));
  }
  const member = prevalidatedMember ??
    host.selectTargetMember(candidates, {
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

function getPrevalidatedSourceLibraryCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  const dateMember = getPrevalidatedDateCallMember(sourceMember, candidates, request, context, host);
  if (dateMember !== undefined) {
    return dateMember;
  }
  const jsonMember = getPrevalidatedJsonCallMember(sourceMember, candidates, request, context, host);
  if (jsonMember !== undefined) {
    return jsonMember;
  }
  return sourceMember.declaringName === "Object" &&
    sourceMember.memberName === "assign" &&
    candidates.length === 1
    ? candidates[0]
    : undefined;
}

function getPrevalidatedJsonCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "JSON") {
    return undefined;
  }
  return host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context);
}

function getPrevalidatedDateCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "Date") {
    return undefined;
  }
  if (sourceMember.memberName !== "constructor") {
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  if (!isNewExpression(request.call, context)) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date.call");
  }
  const argumentCount = request.arguments.length;
  if (argumentCount === 0) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor()");
  }
  if (argumentCount === 1) {
    const argument = request.arguments[0];
    if (dateSingleArgumentIsString(argument, context, host)) {
      return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.String)");
    }
    if (dateSingleArgumentIsNumber(argument, context, host)) {
      return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Double)");
    }
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Object)");
  }
  return argumentCount <= 7
    ? candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)")
    : undefined;
}

function dateSingleArgumentIsString(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  if (subject === undefined) {
    return false;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && (ast.kindName(node) === "KindStringLiteral" || ast.kindName(node) === "KindNoSubstitutionTemplateLiteral")) {
    return true;
  }
  return targetTypeIsString(context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType) ||
    targetTypeIsString(getNonSemanticTargetType(subject, context, host));
}

function dateSingleArgumentIsNumber(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  if (subject === undefined) {
    return false;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && ast.kindName(node) === "KindNumericLiteral") {
    return true;
  }
  const returnType = context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    getNonSemanticTargetType(subject, context, host);
  return isNumericSourcePrimitive(returnType);
}

function getNonSemanticTargetType(
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

function isNumericSourcePrimitive(type: TargetTypeRef | undefined): boolean {
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

function targetTypeIsString(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as { readonly csharpSpecialType?: unknown }).csharpSpecialType === "string";
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
    const checkedCallNodes: Node[] = [];
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsCallExpression(node) || compiler.ast.is.IsNewExpression(node)) {
        checkedCallNodes.push(node);
      }
    });
    for (const node of checkedCallNodes.reverse()) {
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host);
    }
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
    (!compiler.ast.is.IsCallExpression(node) && !compiler.ast.is.IsNewExpression(node)) ||
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
  const calleeReceiverSymbol = calleeReceiver === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, calleeReceiver, sourceFile);
  const calleeReceiverResolvedSymbol = calleeReceiver === undefined
    ? undefined
    : compiler.checker.getResolvedSymbol(calleeReceiver, { sourceFile });
  const sourceSelectedDeclarationContainer = getNodeParent(sourceSelectedDeclaration);
  const mapped = mapCsharpSourceLibraryCheckedCall({
    call: node,
    callee,
    ...(calleeReceiver !== undefined ? { calleeReceiver } : {}),
    ...(calleeReceiverSymbol !== undefined ? { calleeReceiverSymbol } : {}),
    ...(calleeReceiverResolvedSymbol !== undefined ? { calleeReceiverResolvedSymbol } : {}),
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
  if (sourceMember.declaringName === "JSON") {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
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
    case "Date":
      return sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember) ||
        request.sourceSelectedDeclaration !== undefined ||
        receiverTypes.some((receiverType) => isCsharpJsDateRuntimeCarrier(receiverType));
    default:
      return true;
  }
}

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "parse":
      return host.isCsharpStringType(argumentTypes[0]);
    case "stringify":
      return isSupportedJsonValueTargetType(argumentTypes[0], host);
    default:
      return false;
  }
}

function isSupportedJsonValueTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      host.isCsharpStringType(type) ||
      isNumericSourcePrimitive(type) ||
      (type.kind === "source-primitive" && type.name === "bool") ||
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type)
    );
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
      return isSupportedObjectHelperSourceTargetType(argumentTypes[0], host);
    case "hasOwn":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        host.isCsharpStringType(argumentTypes[1]);
    case "assign":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        argumentTypes.slice(1).every((argumentType) => isSupportedObjectHelperSourceTargetType(argumentType, host));
    default:
      return true;
  }
}

function isSupportedObjectHelperSourceTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      type.kind === "source-primitive" ||
      host.isCsharpStringType(type) ||
      isStringKeyedRecordDictionaryTargetType(type, host)
    );
}

function isStringKeyedRecordDictionaryTargetType(
  type: TargetTypeRef,
  host: CsharpJsSurfaceHost,
): type is CsharpRecordDictionaryTargetTypeRef {
  const typeArguments = type.kind === "target-named" ? type.typeArguments ?? [] : [];
  const keyType = typeArguments[0];
  return isCsharpRecordDictionaryTargetType(type) &&
    host.isCsharpStringType(keyType);
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
    : host.getTargetTypeRefForSubject(subject, context, {
        ...csharpJsCheckedTypeQuery,
        allowSemanticTypeQuery: false,
      });
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
    case "Date":
      return !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember);
    case "Object":
      return sourceMember.memberName === "hasOwnProperty";
    default:
      return false;
  }
}

function getSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Date":
      return getDateTargetMembers(
        sourceMember.memberName,
        isNewExpression(request.call, context) ? "new" : "call",
      );
    case "JSON":
      return getJsonTargetMembers(sourceMember.memberName);
    case "Object":
      return [
        ...getObjectTargetMembers(sourceMember.memberName),
        ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
      ];
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(
        sourceMember.memberName,
        getSourceLibraryCallReceiverElementType(request, context, host),
      );
    default:
      return [];
  }
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Date" &&
    (
      sourceMember.memberName === "constructor" ||
      sourceMember.memberName === "now" ||
      sourceMember.memberName === "parse" ||
      sourceMember.memberName === "UTC"
    );
}

function isNewExpression(
  subject: unknown,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const node = asNodeSubject(subject as ExtensionFactSubject | undefined);
  return context.compiler?.ast.is?.IsNewExpression(node) === true ||
    (subject as { readonly Kind?: unknown }).Kind === "KindNewExpression";
}

function getSourceLibraryCallReceiverElementType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .map(getCsharpArrayLikeElementType)
    .find((element): element is TargetTypeRef => element !== undefined);
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (sourceMember.memberName !== "keys" && sourceMember.memberName !== "values" && sourceMember.memberName !== "entries") {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : getObjectRecordDictionaryTargetMembers(sourceMember.memberName, dictionaryType);
}
