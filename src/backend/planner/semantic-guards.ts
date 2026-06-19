import {
  AsParameterDeclaration,
  AsVariableDeclaration,
  KindClassDeclaration,
  KindConstructor,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindFunctionType,
  KindInterfaceDeclaration,
  KindEnumDeclaration,
  KindEnumMember,
  KindElementAccessExpression,
  KindArrayBindingPattern,
  KindBindingElement,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
  KindMethodDeclaration,
  KindPropertyAccessExpression,
  KindIdentifier,
  GetSourceFileOfNode,
  getTypeScriptUnionTypes,
  KindVariableDeclaration,
  isTypeScriptNullishType,
  SourceFile_FileName,
  TypeFlagsTypeParameter,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, SourcePrimitiveFact, Symbol, Type } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export interface SemanticOwnership {
  readonly requiresTargetFact: boolean;
  readonly sourceOwned: boolean;
  readonly reasons: readonly string[];
}

export interface OperationSemanticOwnership extends SemanticOwnership {
  readonly sourcePrimitive: SourcePrimitiveFact | undefined;
}

export function getSemanticOwnership(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): SemanticOwnership {
  if (node === undefined) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["missing AST subject"] };
  }
  if (node.Kind === KindTypeLiteral) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["structural type literal"] };
  }
  if (
    node.Kind === KindObjectBindingPattern ||
    node.Kind === KindArrayBindingPattern ||
    node.Kind === KindBindingElement ||
    node.Kind === KindParameter
  ) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["non-queryable binding syntax"] };
  }
  const reasons: string[] = [];
  appendTargetFactReasons(reasons, input, node, "node");
  const symbol = getQueryableSymbol(node, sourceFile, input);
  appendTargetFactReasons(reasons, input, symbol, "symbol");
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  const sourceOwned = isSourceOwnedProjectShapeType(type, input);
  if (!sourceOwned) {
    appendTargetFactReasons(reasons, input, type, "type");
    appendTargetFactReasons(reasons, input, type?.symbol, "type symbol");
  }
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

export function getCallableSemanticOwnership(
  callee: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): SemanticOwnership {
  if (callee === undefined) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["missing callable AST subject"] };
  }
  const reasons: string[] = [];
  appendTargetFactReasons(reasons, input, callee, "callee node");
  const symbol = getQueryableSymbol(callee, sourceFile, input);
  appendTargetFactReasons(reasons, input, symbol, "callee symbol");
  const type = input.checker.getTypeAtLocation(callee, { sourceFile });
  const sourceOwned = isSourceDeclaredCallable(symbol, input) || isSourceOwnedProjectShapeType(type, input);
  if (!sourceOwned) {
    appendTargetFactReasons(reasons, input, type, "callee type");
    appendTargetFactReasons(reasons, input, type?.symbol, "callee type symbol");
  }
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

export function getProviderOperationOwnership(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): OperationSemanticOwnership {
  if (node === undefined) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["missing operation operand"],
      sourcePrimitive: undefined,
    };
  }
  if (node.Kind === KindTypeLiteral) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["structural type literal"],
      sourcePrimitive: undefined,
    };
  }
  if (
    node.Kind === KindObjectBindingPattern ||
    node.Kind === KindArrayBindingPattern ||
    node.Kind === KindBindingElement ||
    node.Kind === KindParameter
  ) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["non-queryable binding syntax"],
      sourcePrimitive: undefined,
    };
  }
  const reasons: string[] = [];
  appendProviderOperationFactReasons(reasons, input, node, "operand node");
  const symbol = getQueryableSymbol(node, sourceFile, input);
  appendProviderOperationFactReasons(reasons, input, symbol, "operand symbol");
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  appendProviderOperationFactReasons(reasons, input, type, "operand type");
  appendProviderOperationFactReasons(reasons, input, type?.symbol, "operand type symbol");
  const sourcePrimitive = getSourcePrimitiveFact(input, node, symbol, type);
  const typeParameter = isTypeParameterType(type);
  if (typeParameter) {
    reasons.push("operand type parameter");
  }
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned: !typeParameter && (sourcePrimitive !== undefined || isSourceOwnedProjectShapeType(type, input)),
    reasons,
    sourcePrimitive,
  };
}

export function pushMissingTargetFactDiagnostic(
  diagnostics: TargetDiagnostic[],
  node: Node,
  message: string,
  ownership: SemanticOwnership,
): void {
  const reasons = ownership.reasons.length === 0
    ? "no provider/source facts and no source-owned declaration"
    : ownership.reasons.join(", ");
  diagnostics.push(unsupportedNodeDiagnostic(node, `${message} Missing finalized target fact evidence: ${reasons}.`));
}

function appendTargetFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
  label: string,
): void {
  if (subject === undefined) {
    return;
  }
  if (input.facts.getTargetBindingFact(subject) !== undefined) {
    reasons.push(`${label} target binding`);
  }
  if (input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined) {
    reasons.push(`${label} provider virtual declaration`);
  }
  if (input.facts.getRuntimeCarrierFact(subject) !== undefined) {
    reasons.push(`${label} runtime carrier`);
  }
  if (input.facts.getSourcePrimitiveFact(subject) !== undefined) {
    reasons.push(`${label} source primitive`);
  }
  if (input.facts.getTargetConversionFact(subject) !== undefined) {
    reasons.push(`${label} target conversion`);
  }
  if (input.facts.getContextualTargetTypeFact(subject)?.targetType !== undefined) {
    reasons.push(`${label} contextual target type`);
  }
  if (input.facts.getArgumentPassingFact(subject) !== undefined) {
    reasons.push(`${label} argument passing`);
  }
  if (input.facts.getValueTypeFact(subject) !== undefined) {
    reasons.push(`${label} value type`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getSourceMarkerFact(subject) !== undefined) {
    reasons.push(`${label} source marker`);
  }
  if (input.facts.getDefaultValueFact(subject) !== undefined) {
    reasons.push(`${label} default value`);
  }
  if (input.facts.getPointerFact(subject) !== undefined) {
    reasons.push(`${label} pointer`);
  }
  if (input.facts.getFunctionPointerFact(subject) !== undefined) {
    reasons.push(`${label} function pointer`);
  }
}

function appendProviderOperationFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
  label: string,
): void {
  if (subject === undefined) {
    return;
  }
  if (input.facts.getTargetBindingFact(subject) !== undefined) {
    reasons.push(`${label} target binding`);
  }
  if (input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined) {
    reasons.push(`${label} provider virtual declaration`);
  }
  if (input.facts.getRuntimeCarrierFact(subject) !== undefined) {
    reasons.push(`${label} runtime carrier`);
  }
  if (input.facts.getTargetConversionFact(subject) !== undefined) {
    reasons.push(`${label} target conversion`);
  }
  if (input.facts.getContextualTargetTypeFact(subject)?.targetType !== undefined) {
    reasons.push(`${label} contextual target type`);
  }
  if (input.facts.getArgumentPassingFact(subject) !== undefined) {
    reasons.push(`${label} argument passing`);
  }
  if (input.facts.getValueTypeFact(subject) !== undefined) {
    reasons.push(`${label} value type`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getSourceMarkerFact(subject) !== undefined) {
    reasons.push(`${label} source marker`);
  }
  if (input.facts.getDefaultValueFact(subject) !== undefined) {
    reasons.push(`${label} default value`);
  }
  if (input.facts.getPointerFact(subject) !== undefined) {
    reasons.push(`${label} pointer`);
  }
  if (input.facts.getFunctionPointerFact(subject) !== undefined) {
    reasons.push(`${label} function pointer`);
  }
}

function getSourcePrimitiveFact(
  input: TargetCompileInput,
  node: Node,
  symbol: Symbol | undefined,
  type: Type | undefined,
): SourcePrimitiveFact | undefined {
  return input.facts.getSourcePrimitiveFact(node) ??
    input.facts.getSourcePrimitiveFact(symbol) ??
    input.facts.getSourcePrimitiveFact(type) ??
    input.facts.getSourcePrimitiveFact(type?.symbol);
}

function isTypeParameterType(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlagsTypeParameter) !== 0;
}

export function isSourceOwnedProjectShapeType(type: Type | undefined, input: TargetCompileInput): boolean {
  const effectiveType = getSingleNonNullishUnionType(type) ?? type;
  if (isTypeParameterType(effectiveType)) {
    return true;
  }
  const declaration = getPrimaryDeclaration(effectiveType?.symbol);
  return isProjectSourceDeclaration(declaration, input) &&
    (
      declaration?.Kind === KindClassDeclaration ||
      declaration?.Kind === KindInterfaceDeclaration ||
      declaration?.Kind === KindEnumDeclaration ||
      declaration?.Kind === KindEnumMember
    );
}

function getSingleNonNullishUnionType(type: Type | undefined): Type | undefined {
  const unionTypes = getTypeScriptUnionTypes(type);
  if (unionTypes === undefined) {
    return undefined;
  }
  const nonNullishTypes = unionTypes.filter((unionType) => !isTypeScriptNullishType(unionType));
  return nonNullishTypes.length === 1 && nonNullishTypes.length < unionTypes.length
    ? nonNullishTypes[0]
    : undefined;
}

function isSourceDeclaredCallable(symbol: Symbol | undefined, input: TargetCompileInput): boolean {
  const declaration = getPrimaryDeclaration(symbol);
  return !hasProviderOnlySymbolName(symbol) &&
    isProjectSourceDeclaration(declaration, input) &&
    (
      declaration?.Kind === KindFunctionDeclaration ||
      declaration?.Kind === KindFunctionExpression ||
      declaration?.Kind === KindMethodDeclaration ||
      declaration?.Kind === KindConstructor ||
      isExplicitSourceFunctionTypedBinding(declaration)
    );
}

function isExplicitSourceFunctionTypedBinding(declaration: Node | undefined): boolean {
  switch (declaration?.Kind) {
    case KindParameter:
      return AsParameterDeclaration(declaration)?.Type?.Kind === KindFunctionType;
    case KindVariableDeclaration:
      return AsVariableDeclaration(declaration)?.Type?.Kind === KindFunctionType;
    default:
      return false;
  }
}

function getPrimaryDeclaration(symbol: Symbol | undefined): Node | undefined {
  return symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate): candidate is Node => candidate !== undefined);
}

function getQueryableSymbol(node: Node, sourceFile: SourceFile, input: TargetCompileInput): Symbol | undefined {
  switch (node.Kind) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
    case KindElementAccessExpression:
      return input.checker.getSymbolAtLocation(node, { sourceFile }) ?? input.checker.getResolvedSymbol(node, { sourceFile });
    default:
      return undefined;
  }
}

function hasProviderOnlySymbolName(symbol: Symbol | undefined): boolean {
  return symbol?.Name === undefined || symbol.Name.length === 0;
}

function isProjectSourceDeclaration(declaration: Node | undefined, input: TargetCompileInput): boolean {
  if (declaration === undefined) {
    return false;
  }
  const declarationFile = GetSourceFileOfNode(declaration);
  if (declarationFile === undefined || declarationFile.IsDeclarationFile) {
    return false;
  }
  const declarationFileName = SourceFile_FileName(declarationFile);
  if (declarationFileName.startsWith("tsts-provider://")) {
    return false;
  }
  return input.sourceFiles.some((sourceFile) =>
    sourceFile === declarationFile ||
    (!sourceFile.IsDeclarationFile && SourceFile_FileName(sourceFile) === declarationFileName));
}
