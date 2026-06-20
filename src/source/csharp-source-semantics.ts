import {
  TstsProviderContractVersion,
  acceptObservation,
  attributeFactKey,
  createSourceSemanticsExtension,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
  runtimeCarrierFactKey,
  sourcePrimitive,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  CompilerExtension,
  ExtensionObservation,
  ExtensionObservationContext,
  ExtensionDiagnostic,
  ExtensionFactSubject,
  Node,
  ProviderVirtualDeclarationFact,
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceCallMarkerDeclaration,
  SourcePrimitiveFact,
  SourcePrimitiveKind,
  SourceSemanticsModule,
  SourceTypeMarkerDeclaration,
  TargetBindingFact,
  TargetBindingProvider,
  TargetMember,
  TargetParameter,
  TargetSemanticProvider,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type { TargetExtensionContext } from "@tsonic/target-api";

export const neutralTypesModule = "@tsonic/core/types.js";
export const csharpTypesModule = "@tsonic/csharp/types.js";
export const neutralLangModule = "@tsonic/core/lang.js";
export const csharpLangModule = "@tsonic/csharp/lang.js";
export const dotnetCollectionsModule = "@tsonic/dotnet/System.Collections.Generic.js";

const csharpTargetId = "csharp";
const csharpProviderVersion = "0.0.1";

export function createCsharpSourceSemanticsExtension(_context: TargetExtensionContext): CompilerExtension {
  return createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
}

export function createCsharpTargetSemanticsExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.target-semantics",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.target",
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
      const provider = createCsharpSurfaceOperationsProvider();
      context.registerTargetSemanticProvider(provider);
      context.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) => {
        const primitive = resolverContext.facts.get(subject, sourcePrimitiveFactKey);
        return primitive === undefined
          ? undefined
          : {
              value: {
                carrier: csharpSourcePrimitiveTargetType(primitive.kind),
              },
              evidence: [{ message: "C# primitive carrier resolved from finalized source primitive fact." }],
            };
      });
    },
  };
}

function createCsharpSurfaceOperationsProvider(): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.surface-operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return mapRuntimeCarrier(request, context.factResolver.resolve(request.type, sourcePrimitiveFactKey));
    },
    mapCheckedCall(request, context) {
      return mapCsharpCheckedCall(request, context, identity.id);
    },
    mapCheckedPropertyAccess(request, context) {
      return mapCsharpCheckedPropertyAccess(request, context, identity.id);
    },
    mapCheckedElementAccess(request, context) {
      return mapCsharpCheckedElementAccess(request, context, identity.id);
    },
  };
}

function mapCsharpCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
): ExtensionObservation<CheckedCallMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isCheckedAttributeBuilderCall(request, context)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(undefined, request) },
    }, [{ message: "C# attribute builder marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const virtualDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  if (isErasedSourceSemanticsCall(virtualDeclaration)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(virtualDeclaration, request) },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const sourceLibraryCall = mapCsharpSourceLibraryCheckedCall(request, context);
  if (sourceLibraryCall !== undefined) {
    return sourceLibraryCall;
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedContainerSymbol,
    request.calleeReceiverTypeSymbol,
    request.calleeReceiverType,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
  ]);
  if (binding === undefined) {
    return deferObservation;
  }
  const member = findTargetMemberForCall(
    binding,
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey),
    request.calleePropertyName,
    request,
    context,
  );
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_FOUND", 9100100, `C# provider could not map checked call '${request.calleePropertyName ?? "<anonymous>"}' on target '${binding.id}'.`));
  }
  if (member.kind !== "method" && member.kind !== "constructor") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_CALLABLE", 9100101, `C# provider mapped checked call '${request.calleePropertyName ?? "<anonymous>"}' to non-callable target member '${member.id}'.`));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function isErasedSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== neutralLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "attribute" ||
    declaration.exportName === "field" ||
    declaration.exportName === "struct" ||
    declaration.exportName === "defaultof" ||
    declaration.exportName === "out" ||
    declaration.exportName === "ref" ||
    declaration.exportName === "inref" ||
    declaration.exportName === "borrow" ||
    declaration.exportName === "borrowMut" ||
    declaration.exportName === "move" ||
    declaration.exportName === "__TsonicAttributeBuilder" ||
    declaration.exportName === "__TsonicAttributeMemberBuilder";
}

function isCheckedAttributeBuilderCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.facts.get(request.call, attributeFactKey) !== undefined ||
    context.facts.get(request.calleeReceiver, attributeFactKey) !== undefined;
}

function erasedSourceSemanticsMember(
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
): TargetMember {
  const sourceName = declaration?.memberName ?? declaration?.exportName ?? request.calleePropertyName ?? "sourceMarker";
  return {
    id: declaration?.signatureId ?? `${declaration?.providerModuleId ?? "source-semantics"}.${sourceName}`,
    sourceName,
    targetName: "__tsonic_erased_source_marker",
    kind: "method",
    parameters: [],
  };
}

function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const sourceLibraryProperty = mapCsharpSourceLibraryCheckedPropertyAccess(request, context);
  if (sourceLibraryProperty !== undefined) {
    return sourceLibraryProperty;
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedContainerSymbol,
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiverAliasedSymbol,
    request.receiverResolvedSymbol,
    request.receiverSymbol,
  ]);
  if (binding === undefined) {
    return deferObservation;
  }
  const member = findTargetMember(binding, context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey), request.propertyName);
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_FOUND", 9100102, `C# provider could not map checked property '${request.propertyName}' on target '${binding.id}'.`));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function mapCsharpCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const sourceLibraryElement = mapCsharpSourceLibraryCheckedElementAccess(request, context);
  if (sourceLibraryElement !== undefined) {
    return sourceLibraryElement;
  }
  const binding = findTargetBinding(context, [
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiver,
  ]);
  if (binding === undefined) {
    return deferObservation;
  }
  const indexers = (binding.members ?? []).filter((member) => member.kind === "indexer");
  const member = indexers.length === 1 ? indexers[0] : undefined;
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider could not map checked element access on target '${binding.id}' to a unique indexer.`));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# target indexer access selected from checked TSTS provider declaration." }]);
}

function findTargetBinding(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = context.facts.get(subject, targetBindingFactKey);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

function findTargetMemberForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetMember | undefined {
  const candidates = getTargetMemberCandidates(binding, declaration, sourceName);
  return selectTargetMember(candidates, request.arguments, context);
}

function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): TargetMember | undefined {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  return memberName === undefined ? undefined : members.find((member) => member.sourceName === memberName);
}

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.filter((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  if (memberName !== undefined) {
    return members.filter((member) => member.sourceName === memberName);
  }
  return members.filter((member) => member.kind === "constructor");
}

function selectTargetMember(
  candidates: readonly TargetMember[],
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
): TargetMember | undefined {
  const scored = candidates
    .map((member) => ({ member, score: scoreTargetMember(member, arguments_, context) }))
    .filter((candidate) => candidate.score !== undefined) as readonly { readonly member: TargetMember; readonly score: number }[];
  if (scored.length === 0) {
    return undefined;
  }
  const bestScore = Math.max(...scored.map((candidate) => candidate.score));
  const best = scored.filter((candidate) => candidate.score === bestScore);
  return best.length === 1 ? best[0]!.member : undefined;
}

function scoreTargetMember(
  member: TargetMember,
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
): number | undefined {
  const parameterOffset = member.receiverPassing === "first-argument" ? 1 : 0;
  const parameters = member.parameters.slice(parameterOffset);
  if (!targetArityMatches(parameters, arguments_.length)) {
    return undefined;
  }
  let score = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    if (parameter === undefined) {
      return undefined;
    }
    const argumentType = getTargetTypeRefForSubject(arguments_[index], context);
    const argumentScore = scoreTargetTypeMatch(parameter.type, argumentType, arguments_[index], context);
    if (argumentScore === undefined) {
      return undefined;
    }
    score += argumentScore;
  }
  return score + (parameters.length === arguments_.length ? 1 : 0);
}

function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required && (hasParamsArray || argumentCount <= parameters.length);
}

function getParameterForArgument(parameters: readonly TargetParameter[], index: number): TargetParameter | undefined {
  const parameter = parameters[index];
  if (parameter !== undefined) {
    return parameter;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function scoreTargetTypeMatch(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const delegateScore = scoreDelegateTargetTypeMatch(expected, subject, context);
  if (delegateScore !== undefined) {
    return delegateScore;
  }
  if (expected.kind === "type-parameter") {
    return 1;
  }
  if (expected.kind === "opaque" && (expected.id === "any" || expected.id === "unknown")) {
    return 1;
  }
  if (expected.kind === "target-named" && expected.id === "System.Object") {
    return 1;
  }
  if (actual === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(expected, actual)) {
    return 8;
  }
  return undefined;
}

function scoreDelegateTargetTypeMatch(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  if (expected.kind !== "target-named") {
    return undefined;
  }
  const stripped = stripMetadataArity(expected.id);
  if (stripped !== "System.Func" && stripped !== "System.Action" && stripped !== "System.Predicate") {
    return undefined;
  }
  const callbackParameterCount = getCallbackParameterCount(subject, context);
  if (callbackParameterCount === undefined) {
    return undefined;
  }
  const genericArgumentCount = (expected.typeArguments ?? []).length;
  const expectedParameterCount = stripped === "System.Func"
    ? genericArgumentCount - 1
    : genericArgumentCount;
  return callbackParameterCount === expectedParameterCount ? 6 : undefined;
}

function getCallbackParameterCount(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (!ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) {
    return undefined;
  }
  return ast.parameters(node).length;
}

function getTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const direct = resolveRuntimeCarrier(subject, context);
  if (direct !== undefined) {
    return direct;
  }
  const type = asType(context.compiler?.checker.getTypeAtLocation(asNodeSubject(subject)));
  return getTargetTypeRefForType(type, context);
}

function getTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  const direct = resolveRuntimeCarrier(type, context) ??
    resolveRuntimeCarrier(type.symbol, context);
  if (direct !== undefined) {
    return direct;
  }
  const binding = resolveTargetBinding(type.symbol, context);
  if (binding !== undefined) {
    return { kind: "target-named", id: binding.id };
  }
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  if (types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (types.isStringLike(type)) {
    return csharpTargetNamedType("System.String");
  }
  if (types.isBigIntLike(type)) {
    return csharpTargetNamedType("System.Numerics.BigInteger");
  }
  if (types.isArrayLike(type)) {
    const element = getTargetTypeRefForType(types.getTypeArguments(type)[0], context);
    return element === undefined ? undefined : { kind: "array", element };
  }
  return undefined;
}

function resolveRuntimeCarrier(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier;
}

function resolveTargetBinding(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetBindingFact | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, targetBindingFactKey);
}

function asNodeSubject(subject: ExtensionFactSubject | undefined): Node | undefined {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number"
    ? subject as Node
    : undefined;
}

function asType(subject: unknown): Type | undefined {
  return typeof subject === "object" && subject !== null && "flags" in subject ? subject as Type : undefined;
}

function targetTypeRefEquals(left: TargetTypeRef, right: TargetTypeRef): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefListEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListEquals(left.args, right.args) &&
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
        Object.is(left.value, right.value);
  }
}

function targetTypeRefListEquals(left: readonly TargetTypeRef[], right: readonly TargetTypeRef[]): boolean {
  return left.length === right.length && left.every((item, index) => targetTypeRefEquals(item, right[index]!));
}

interface SourceLibraryMember {
  readonly declaringName: string;
  readonly memberName: string;
  readonly fileName: string;
}

function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, request.calleePropertyName, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember);
  if (candidates.length === 0) {
    return undefined;
  }
  const member = selectTargetMember(candidates, request.arguments, context);
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic("tsonic.csharp.surface-operations", "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# provider could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' to a unique target member from finalized argument facts.`));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# target call selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function mapCsharpSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, request.propertyName, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  const operation = getSourceLibraryPropertyOperation(sourceMember);
  if (operation === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation,
  }, [{ message: `C# target property selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getTargetTypeRefForSubject(request.receiver, context);
  if (receiverType?.kind === "array") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: {
        operationId: "tsonic.csharp.source.array.indexer",
        operationKind: "indexer",
        targetOperation: "System.Array.Item",
      },
    }, [{ message: "C# target array indexer selected from checked TypeScript element access." }]);
  }
  if (receiverType?.kind === "target-named" && receiverType.id === "System.String") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: {
        operationId: "tsonic.csharp.source.string.codeUnit",
        operationKind: "indexer",
        targetOperation: "string-code-unit",
      },
    }, [{ message: "C# target string code-unit access selected from checked TypeScript element access." }]);
  }
  return undefined;
}

function getSourceLibraryMember(
  declarationSubject: ExtensionFactSubject | undefined,
  fallbackMemberName: string | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const ast = context.compiler?.ast;
  const declaration = asNodeSubject(declarationSubject);
  if (ast === undefined || declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  if (!fileName.startsWith("bundled:///libs/")) {
    return undefined;
  }
  const memberName = ast.text(ast.name(declaration)) || fallbackMemberName;
  const containerName = ast.text(ast.name(ast.parent(declaration)));
  return memberName === undefined || memberName === "" || containerName === ""
    ? undefined
    : { declaringName: normalizeSourceLibraryDeclaringName(containerName), memberName, fileName };
}

function normalizeSourceLibraryDeclaringName(name: string): string {
  return name.endsWith("Constructor") ? name.slice(0, -"Constructor".length) : name;
}

function getSourceLibraryCallMembers(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(sourceMember.memberName);
    default:
      return [];
  }
}

function getSourceLibraryPropertyOperation(sourceMember: SourceLibraryMember) {
  if ((sourceMember.declaringName === "String" || sourceMember.declaringName === "Array" || sourceMember.declaringName === "ReadonlyArray") && sourceMember.memberName === "length") {
    return {
      operationId: `tsonic.csharp.source.${sourceMember.declaringName}.length`,
      operationKind: "property" as const,
      targetOperation: "Length",
    };
  }
  return undefined;
}

const mathTargetNames = new Map<string, string>([
  ["abs", "Abs"],
  ["acos", "Acos"],
  ["asin", "Asin"],
  ["atan", "Atan"],
  ["atan2", "Atan2"],
  ["cos", "Cos"],
  ["cosh", "Cosh"],
  ["exp", "Exp"],
  ["log", "Log"],
  ["log10", "Log10"],
  ["log2", "Log2"],
  ["max", "Max"],
  ["min", "Min"],
  ["pow", "Pow"],
  ["sin", "Sin"],
  ["sinh", "Sinh"],
  ["sqrt", "Sqrt"],
  ["tan", "Tan"],
  ["tanh", "Tanh"],
  ["trunc", "Truncate"],
]);

function getMathTargetMembers(sourceName: string): readonly TargetMember[] {
  const targetName = mathTargetNames.get(sourceName);
  if (targetName === undefined) {
    return [];
  }
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const parameterCount = sourceName === "atan2" || sourceName === "max" || sourceName === "min" || sourceName === "pow" ? 2 : 1;
  return [targetMethod(`System.Math.${targetName}`, sourceName, targetName, range(parameterCount).map((index) => targetParameter(`value${index}`, doubleType)), doubleType, {
    declaringType: csharpTargetNamedType("System.Math"),
    static: true,
  })];
}

const stringInstanceTargetNames = new Map<string, string>([
  ["toString", "ToString"],
  ["trim", "Trim"],
  ["trimStart", "TrimStart"],
  ["trimLeft", "TrimStart"],
  ["trimEnd", "TrimEnd"],
  ["trimRight", "TrimEnd"],
  ["toLowerCase", "ToLower"],
  ["toUpperCase", "ToUpper"],
]);

const stringHelperNames = new Set([
  "charAt",
  "charCodeAt",
  "codePointAt",
  "endsWith",
  "fromCharCode",
  "fromCodePoint",
  "includes",
  "indexOf",
  "lastIndexOf",
  "padEnd",
  "padStart",
  "repeat",
  "replace",
  "replaceAll",
  "slice",
  "split",
  "startsWith",
  "substr",
  "substring",
  "valueOf",
]);

function getStringTargetMembers(sourceName: string): readonly TargetMember[] {
  const stringType = csharpTargetNamedType("System.String");
  const intType = csharpSourcePrimitiveTargetType("int32");
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const instanceName = stringInstanceTargetNames.get(sourceName);
  if (instanceName !== undefined) {
    return [targetMethod(`System.String.${instanceName}`, sourceName, instanceName, [], stringType)];
  }
  if (sourceName === "concat") {
    return [targetMethod("System.String.Concat(System.String[])", sourceName, "Concat", [
      targetParameter("value", stringType),
      targetParameter("values", stringType, { paramsArray: true }),
    ], stringType, {
      declaringType: csharpTargetNamedType("System.String"),
      static: true,
      receiverPassing: "first-argument",
    })];
  }
  if (!stringHelperNames.has(sourceName)) {
    return [];
  }
  const helperType = csharpTargetNamedType("Tsonic.CSharp.Js.String");
  const returnType = getStringHelperReturnType(sourceName, stringType, intType, doubleType, boolType);
  const parameters = getStringHelperParameters(sourceName, stringType, intType);
  const isStaticConstructor = sourceName === "fromCharCode" || sourceName === "fromCodePoint";
  return [targetMethod(`Tsonic.CSharp.Js.String.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: helperType,
    static: true,
    ...(isStaticConstructor ? {} : { receiverPassing: "first-argument" }),
  })];
}

function getStringHelperReturnType(sourceName: string, stringType: TargetTypeRef, intType: TargetTypeRef, doubleType: TargetTypeRef, boolType: TargetTypeRef): TargetTypeRef {
  switch (sourceName) {
    case "includes":
    case "startsWith":
    case "endsWith":
      return boolType;
    case "indexOf":
    case "lastIndexOf":
      return intType;
    case "charCodeAt":
      return doubleType;
    case "codePointAt":
      return { kind: "target-named", id: "System.Nullable`1", typeArguments: [intType] };
    case "split":
      return { kind: "array", element: stringType };
    default:
      return stringType;
  }
}

function getStringHelperParameters(sourceName: string, stringType: TargetTypeRef, intType: TargetTypeRef): readonly TargetParameter[] {
  const receiver = targetParameter("value", stringType);
  switch (sourceName) {
    case "fromCharCode":
    case "fromCodePoint":
      return [targetParameter("code", intType, { paramsArray: true })];
    case "includes":
    case "startsWith":
    case "endsWith":
    case "indexOf":
    case "lastIndexOf":
      return [receiver, targetParameter("search", stringType), targetParameter("position", intType, { optional: true })];
    case "replace":
    case "replaceAll":
      return [receiver, targetParameter("search", stringType), targetParameter("replacement", stringType)];
    case "substring":
    case "slice":
    case "substr":
      return [receiver, targetParameter("start", intType), targetParameter("end", intType, { optional: true })];
    case "padStart":
    case "padEnd":
      return [receiver, targetParameter("targetLength", intType), targetParameter("padString", stringType, { optional: true })];
    case "repeat":
    case "charAt":
    case "charCodeAt":
    case "codePointAt":
      return [receiver, targetParameter("index", intType)];
    case "split":
      return [receiver, targetParameter("separator", stringType), targetParameter("limit", intType, { optional: true })];
    case "valueOf":
      return [receiver];
    default:
      return [receiver];
  }
}

function getArrayTargetMembers(sourceName: string): readonly TargetMember[] {
  const itemType: TargetTypeRef = { kind: "type-parameter", name: "T" };
  const arrayType: TargetTypeRef = { kind: "array", element: itemType };
  const intType = csharpSourcePrimitiveTargetType("int32");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const stringType = csharpTargetNamedType("System.String");
  const helperType = csharpTargetNamedType("Tsonic.CSharp.Runtime.ArrayHelpers");
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
      return arrayCallbackHelpers(sourceName, "ForEach", "System.Action", itemType, arrayType, csharpTargetNamedType("System.Void"), helperType);
    case "some":
      return arrayCallbackHelpers(sourceName, "Some", "System.Func", itemType, arrayType, boolType, helperType);
    case "every":
      return arrayCallbackHelpers(sourceName, "Every", "System.Func", itemType, arrayType, boolType, helperType);
    case "findIndex":
      return arrayCallbackHelpers(sourceName, "FindIndex", "System.Func", itemType, arrayType, intType, helperType);
    case "findLastIndex":
      return arrayCallbackHelpers(sourceName, "FindLastIndex", "System.Func", itemType, arrayType, intType, helperType);
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
  returnType: TargetTypeRef,
  helperType: TargetTypeRef,
): readonly TargetMember[] {
  const intType = csharpSourcePrimitiveTargetType("int32");
  const callbackShapes: readonly TargetTypeRef[] = delegateKind === "System.Action"
    ? [
        csharpTargetNamedType("System.Action`1", [itemType]),
        csharpTargetNamedType("System.Action`2", [itemType, intType]),
        csharpTargetNamedType("System.Action`3", [itemType, intType, arrayType]),
      ]
    : [
        csharpTargetNamedType("System.Func`2", [itemType, returnType]),
        csharpTargetNamedType("System.Func`3", [itemType, intType, returnType]),
        csharpTargetNamedType("System.Func`4", [itemType, intType, arrayType, returnType]),
      ];
  return callbackShapes.map((callback, index) => arrayHelper(`${sourceName}:${index + 1}`, targetName, [
    targetParameter("array", arrayType),
    targetParameter("callback", callback),
  ], returnType, helperType, sourceName));
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

function targetMethod(
  id: string,
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
    readonly receiverPassing?: TargetMember["receiverPassing"];
  } = {},
): TargetMember {
  return {
    id,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.static !== undefined ? { static: options.static } : {}),
    ...(options.receiverPassing !== undefined ? { receiverPassing: options.receiverPassing } : {}),
  };
}

function targetParameter(
  name: string,
  type: TargetTypeRef,
  options: { readonly optional?: boolean; readonly paramsArray?: boolean } = {},
): TargetParameter {
  return {
    name,
    type,
    passingMode: "by-value",
    ...(options.optional === true ? { optional: true } : {}),
    ...(options.paramsArray === true ? { paramsArray: true } : {}),
  };
}

function csharpTargetNamedType(id: string, typeArguments?: readonly TargetTypeRef[]): TargetTypeRef {
  return {
    kind: "target-named",
    id,
    ...(typeArguments !== undefined && typeArguments.length > 0 ? { typeArguments } : {}),
  };
}

function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_value, index) => index);
}

function stripMetadataArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}

function targetOperationFromMember(member: TargetMember) {
  return {
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" as const : member.kind,
    targetOperation: member.static === true && member.declaringType?.kind === "target-named"
      ? `${member.declaringType.id}.${member.targetName}`
      : member.targetName,
  };
}

function mapRuntimeCarrier(
  _request: RuntimeCarrierFactRequest,
  primitive: SourcePrimitiveFact | undefined,
) {
  if (primitive === undefined) {
    return deferObservation;
  }
  return acceptObservation<RuntimeCarrierFactResult>({
    carrier: csharpSourcePrimitiveTargetType(primitive.kind),
  }, [{ message: "C# runtime carrier mapped from source primitive fact." }]);
}

function csharpSourceSemanticsModules(): readonly SourceSemanticsModule[] {
  return [
    {
      moduleSpecifier: neutralTypesModule,
      packageName: "@tsonic/core",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
        sourcePrimitive("char", "char", "string", false, 16),
        sourcePrimitive("int8", "int8", "number", true, 8),
        sourcePrimitive("uint8", "uint8", "number", false, 8),
        sourcePrimitive("int16", "int16", "number", true, 16),
        sourcePrimitive("uint16", "uint16", "number", false, 16),
        sourcePrimitive("int32", "int32", "number", true, 32),
        sourcePrimitive("uint32", "uint32", "number", false, 32),
        sourcePrimitive("int64", "int64", "bigint", true, 64),
        sourcePrimitive("uint64", "uint64", "bigint", false, 64),
        sourcePrimitive("int128", "int128", "bigint", true, 128),
        sourcePrimitive("uint128", "uint128", "bigint", false, 128),
        sourcePrimitive("nativeInt", "native-int", "number", true),
        sourcePrimitive("nativeUint", "native-uint", "number", false),
        sourcePrimitive("float16", "float16", "number", true, 16),
        sourcePrimitive("float32", "float32", "number", true, 32),
        sourcePrimitive("float64", "float64", "number", true, 64),
        sourcePrimitive("decimal", "decimal", "number", true, 128),
      ],
    },
    {
      moduleSpecifier: csharpTypesModule,
      packageName: "@tsonic/csharp",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
        sourcePrimitive("char", "char", "string", false, 16),
        sourcePrimitive("byte", "uint8", "number", false, 8),
        sourcePrimitive("sbyte", "int8", "number", true, 8),
        sourcePrimitive("short", "int16", "number", true, 16),
        sourcePrimitive("ushort", "uint16", "number", false, 16),
        sourcePrimitive("int", "int32", "number", true, 32),
        sourcePrimitive("uint", "uint32", "number", false, 32),
        sourcePrimitive("long", "int64", "bigint", true, 64),
        sourcePrimitive("ulong", "uint64", "bigint", false, 64),
        sourcePrimitive("nint", "native-int", "number", true),
        sourcePrimitive("nuint", "native-uint", "number", false),
        sourcePrimitive("float", "float32", "number", true, 32),
        sourcePrimitive("double", "float64", "number", true, 64),
        sourcePrimitive("decimal", "decimal", "number", true, 128),
      ],
    },
    {
      moduleSpecifier: neutralLangModule,
      packageName: "@tsonic/core",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "out", marker: "out" },
        { kind: "call-marker", exportName: "ref", marker: "ref" },
        { kind: "call-marker", exportName: "inref", marker: "inref" },
        { kind: "call-marker", exportName: "borrow", marker: "borrow" },
        { kind: "call-marker", exportName: "borrowMut", marker: "borrowMut" },
        { kind: "call-marker", exportName: "move", marker: "move" },
        { kind: "call-marker", exportName: "struct", marker: "struct" },
        { kind: "call-marker", exportName: "field", marker: "field" },
        { kind: "call-marker", exportName: "attribute", marker: "attribute" },
        { kind: "call-marker", exportName: "defaultof", marker: "defaultof" },
        { kind: "type-marker", exportName: "ptr", marker: "ptr" },
        { kind: "type-marker", exportName: "fnptr", marker: "fnptr" },
      ],
    },
    {
      moduleSpecifier: csharpLangModule,
      packageName: "@tsonic/csharp",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "out", marker: "out" },
        { kind: "call-marker", exportName: "ref", marker: "ref" },
        { kind: "call-marker", exportName: "inref", marker: "inref" },
        { kind: "call-marker", exportName: "struct", marker: "struct" },
        { kind: "call-marker", exportName: "field", marker: "field" },
        { kind: "call-marker", exportName: "attribute", marker: "attribute" },
        { kind: "call-marker", exportName: "defaultof", marker: "defaultof" },
        { kind: "type-marker", exportName: "ptr", marker: "ptr" },
        { kind: "type-marker", exportName: "fnptr", marker: "fnptr" },
      ],
    },
    {
      moduleSpecifier: dotnetCollectionsModule,
      packageName: "@tsonic/dotnet",
      subpath: "System.Collections.Generic.js",
      exports: [],
    },
  ];
}

function createCsharpCoreVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.core-virtual-modules",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: "Tsonic C# source modules",
  };
  return {
    identity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = modules.get(specifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_UNOWNED", 9100001, `C# core provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://tsonic-csharp/${encodeURIComponent(specifier)}`,
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_DECLARATION_MISSING", 9100002, `No C# core declaration model exists for '${resolution.moduleSpecifier}'.`);
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: providerExportDeclarationsForModule(module),
        evidence: [{ message: "Declaration model is generated from C# target source semantics." }],
      };
    },
    getTargetIdentity(symbol) {
      if (symbol.exportName === undefined) {
        return undefined;
      }
      const declaration = providerExportDeclarationsForModule(modules.get(symbol.moduleSpecifier) ?? emptySourceModule(symbol.moduleSpecifier))
        .find((candidate) => candidate.name === symbol.exportName);
      return declaration?.targetIdentity ?? {
        target: csharpTargetId,
        id: `${symbol.moduleSpecifier}#${symbol.exportName}`,
        displayName: symbol.exportName,
      };
    },
  };
}

function providerExportDeclarationsForModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return [
    ...sourceSemanticsHelperDeclarations(module.moduleSpecifier),
    ...module.exports.map(providerExportDeclarationForSourceSemantics),
    ...csharpTargetProviderExports(module.moduleSpecifier),
  ];
}

function sourceSemanticsHelperDeclarations(moduleSpecifier: string): readonly ProviderExportDeclaration[] {
  if (moduleSpecifier !== neutralLangModule && moduleSpecifier !== csharpLangModule) {
    return [];
  }
  return [
    attributeBuilderDeclaration(),
    attributeMemberBuilderDeclaration(),
  ];
}

function providerExportDeclarationForSourceSemantics(declaration: SourceSemanticsModule["exports"][number]): ProviderExportDeclaration {
  switch (declaration.kind) {
    case "source-primitive":
      return {
        id: declaration.exportName,
        name: declaration.exportName,
        kind: "type",
        type: providerTypeForPrimitive(declaration.primitive),
        targetIdentity: {
          target: csharpTargetId,
          id: `tsonic.source.${declaration.primitive}`,
          displayName: declaration.exportName,
        },
      };
    case "type-marker":
      return providerTypeMarkerDeclaration(declaration.exportName, declaration.marker);
    case "call-marker":
      return providerCallMarkerDeclaration(declaration.exportName, declaration.marker);
  }
}

function providerTypeMarkerDeclaration(exportName: string, marker: SourceTypeMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameters = marker === "ptr"
    ? [{ name: "T" }]
    : [{ name: "TArgs" }, { name: "TReturn" }];
  return {
    id: exportName,
    name: exportName,
    kind: "type",
    typeParameters,
    type: { kind: "unknown" },
  };
}

function providerCallMarkerDeclaration(exportName: string, marker: SourceCallMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameter = { kind: "type-parameter" as const, name: "T" };
  switch (marker) {
    case "out":
    case "ref":
    case "inref":
    case "borrow":
    case "borrowMut":
    case "move":
    case "struct":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}(value)`,
          typeParameters: [{ name: "T" }],
          parameters: [{ name: "value", type: typeParameter }],
          returnType: typeParameter,
        }],
      };
    case "field":
    case "defaultof":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>()`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: typeParameter,
        }],
      };
    case "attribute":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>(...args)`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: {
            kind: "provider-ref",
            name: "__TsonicAttributeBuilder",
            typeArguments: [typeParameter],
          },
        }],
      };
  }
}

function csharpTargetProviderExports(moduleSpecifier: string): readonly ProviderExportDeclaration[] {
  if (moduleSpecifier === dotnetCollectionsModule) {
    return [csharpListProviderDeclaration()];
  }
  if (moduleSpecifier === csharpLangModule) {
    return [
      csharpExceptionProviderDeclaration(),
      csharpConvertProviderDeclaration(),
      csharpEnvironmentProviderDeclaration(),
      csharpClsCompliantAttributeProviderDeclaration(),
    ];
  }
  return [];
}

function attributeBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const memberBuilder: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeBuilder",
    name: "__TsonicAttributeBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "any" }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeBuilder.property", "property", [
        {
          name: "selector",
          type: {
            kind: "function",
            parameters: [{ name: "target", type: ownerType }],
            returnType: { kind: "unknown" },
          },
        },
      ], memberBuilder),
      methodMember("__TsonicAttributeBuilder.method", "method", [
        {
          name: "selector",
          type: {
            kind: "function",
            parameters: [{ name: "target", type: ownerType }],
            returnType: { kind: "unknown" },
          },
        },
      ], memberBuilder),
    ],
  };
}

function attributeMemberBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const self: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeMemberBuilder",
    name: "__TsonicAttributeMemberBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeMemberBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "any" }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeMemberBuilder.parameter", "parameter", [
        { name: "name", type: { kind: "string" } },
      ], self),
    ],
  };
}

function csharpListProviderDeclaration(): ProviderExportDeclaration {
  const itemType: ProviderTypeExpression = { kind: "type-parameter", name: "T" };
  const intType = providerTypeForPrimitive("int32");
  const boolType = providerTypeForPrimitive("bool");
  return {
    id: "List",
    name: "List",
    kind: "class",
    targetIdentity: {
      target: csharpTargetId,
      id: "System.Collections.Generic.List`1",
      displayName: "System.Collections.Generic.List",
    },
    typeParameters: [{ name: "T" }],
    members: [
      constructorMember("System.Collections.Generic.List`1..ctor()", []),
      constructorMember("System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1)", [
        { name: "items", type: { kind: "array", elementType: itemType } },
      ]),
      propertyMember("Count", "count", intType),
      indexerMember("System.Collections.Generic.List`1.Item(System.Int32)", "item", [{ name: "index", type: intType }], itemType),
      methodMember("System.Collections.Generic.List`1.Add(T)", "add", [{ name: "item", type: itemType }], { kind: "void" }),
      methodMember("System.Collections.Generic.List`1.Clear()", "clear", [], { kind: "void" }),
      methodMember("System.Collections.Generic.List`1.Contains(T)", "contains", [{ name: "item", type: itemType }], boolType),
      methodMember("System.Collections.Generic.List`1.IndexOf(T)", "indexOf", [{ name: "item", type: itemType }], intType),
      methodMember("System.Collections.Generic.List`1.Remove(T)", "remove", [{ name: "item", type: itemType }], boolType),
      methodMember("System.Collections.Generic.List`1.RemoveAt(System.Int32)", "removeAt", [{ name: "index", type: intType }], { kind: "void" }),
      methodMember("System.Collections.Generic.List`1.ToArray()", "toArray", [], { kind: "array", elementType: itemType }),
    ],
  };
}

function csharpExceptionProviderDeclaration(): ProviderExportDeclaration {
  const stringType = providerCsharpStringType();
  return {
    id: "Exception",
    name: "Exception",
    kind: "class",
    targetIdentity: {
      target: csharpTargetId,
      id: "System.Exception",
      displayName: "System.Exception",
    },
    members: [
      constructorMember("System.Exception..ctor(System.String)", [{ name: "message", type: stringType }]),
      propertyMember("Message", "message", stringType),
      methodMember("System.Exception.ToString()", "toString", [], stringType),
    ],
  };
}

function csharpConvertProviderDeclaration(): ProviderExportDeclaration {
  const doubleType = providerTypeForPrimitive("float64");
  return {
    id: "Convert",
    name: "Convert",
    kind: "class",
    targetIdentity: {
      target: csharpTargetId,
      id: "System.Convert",
      displayName: "System.Convert",
    },
    members: [
      staticMethodMember("System.Convert.ToByte(System.Double)", "toByte", [{ name: "value", type: doubleType }], providerTypeForPrimitive("uint8")),
      staticMethodMember("System.Convert.ToInt32(System.Double)", "toInt32", [{ name: "value", type: doubleType }], providerTypeForPrimitive("int32")),
      staticMethodMember("System.Convert.ToString(System.Double)", "toString", [{ name: "value", type: doubleType }], providerCsharpStringType()),
    ],
  };
}

function csharpEnvironmentProviderDeclaration(): ProviderExportDeclaration {
  return {
    id: "Environment",
    name: "Environment",
    kind: "class",
    targetIdentity: {
      target: csharpTargetId,
      id: "System.Environment",
      displayName: "System.Environment",
    },
    members: [
      staticPropertyMember("System.Environment.NewLine", "newLine", providerCsharpStringType()),
      staticMethodMember("System.Environment.Exit(System.Int32)", "exit", [{ name: "exitCode", type: providerTypeForPrimitive("int32") }], { kind: "void" }),
    ],
  };
}

function csharpClsCompliantAttributeProviderDeclaration(): ProviderExportDeclaration {
  return {
    id: "CLSCompliantAttribute",
    name: "CLSCompliantAttribute",
    kind: "class",
    targetIdentity: {
      target: csharpTargetId,
      id: "System.CLSCompliantAttribute",
      displayName: "System.CLSCompliantAttribute",
    },
    members: [
      constructorMember("System.CLSCompliantAttribute..ctor(System.Boolean)", [{ name: "isCompliant", type: providerTypeForPrimitive("bool") }]),
    ],
  };
}

function constructorMember(id: string, parameters: readonly ProviderParameterDeclaration[]) {
  return {
    id,
    name: "constructor",
    kind: "constructor" as const,
    signatures: [{ id, parameters }],
  };
}

function propertyMember(id: string, sourceName: string, type: ProviderTypeExpression) {
  return {
    id,
    name: sourceName,
    kind: "property" as const,
    type,
  };
}

function staticPropertyMember(id: string, sourceName: string, type: ProviderTypeExpression) {
  return {
    id,
    name: sourceName,
    kind: "property" as const,
    static: true,
    type,
  };
}

function indexerMember(id: string, sourceName: string, parameters: readonly ProviderParameterDeclaration[], returnType: ProviderTypeExpression) {
  return {
    id,
    name: sourceName,
    kind: "indexer" as const,
    signatures: [{ id, parameters, returnType }],
  };
}

function methodMember(id: string, sourceName: string, parameters: readonly ProviderParameterDeclaration[], returnType: ProviderTypeExpression) {
  return {
    id,
    name: sourceName,
    kind: "method" as const,
    signatures: [{ id, name: targetMemberNameFromId(id), parameters, returnType }],
  };
}

function staticMethodMember(id: string, sourceName: string, parameters: readonly ProviderParameterDeclaration[], returnType: ProviderTypeExpression) {
  return {
    id,
    name: sourceName,
    kind: "method" as const,
    static: true,
    signatures: [{ id, name: targetMemberNameFromId(id), parameters, returnType }],
  };
}

function targetMemberNameFromId(id: string): string {
  const paren = id.indexOf("(");
  const qualifiedName = paren === -1 ? id : id.slice(0, paren);
  const lastDot = qualifiedName.lastIndexOf(".");
  return qualifiedName.slice(lastDot + 1);
}

function providerTypeForPrimitive(kind: SourcePrimitiveKind): ProviderTypeExpression {
  switch (kind) {
    case "bool":
      return { kind: "boolean" };
    case "char":
      return { kind: "string" };
    case "int64":
    case "uint64":
    case "int128":
    case "uint128":
      return { kind: "bigint" };
    default:
      return { kind: "number" };
  }
}

function providerCsharpStringType(): ProviderTypeExpression {
  return {
    kind: "target-named",
    target: csharpTargetId,
    id: "System.String",
    displayName: "string",
    sourceShape: { kind: "string" },
  };
}

function csharpSourcePrimitiveTargetType(kind: SourcePrimitiveKind): TargetTypeRef {
  return { kind: "source-primitive", name: kind };
}

function emptySourceModule(moduleSpecifier: string): SourceSemanticsModule {
  return {
    moduleSpecifier,
    exports: [],
  };
}

function csharpProviderDiagnostic(extensionId: string, extensionCode: string, numericCode: number, message: string): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
  };
}
