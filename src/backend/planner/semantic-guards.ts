import {
  KindClassDeclaration,
  KindConstructor,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindInterfaceDeclaration,
  KindArrayBindingPattern,
  KindBindingElement,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
  KindMethodDeclaration,
  GetSourceFileOfNode,
  SourceFile_FileName,
  TypeFlagsBigIntLike,
  TypeFlagsBooleanLike,
  TypeFlagsNumberLike,
  TypeFlagsStringLike,
  TypeFlagsTypeParameter,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, Symbol, Type } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export interface SemanticOwnership {
  readonly requiresTargetFact: boolean;
  readonly sourceOwned: boolean;
  readonly reasons: readonly string[];
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
  const symbol = input.checker.getSymbolAtLocation(node, { sourceFile }) ?? input.checker.getResolvedSymbol(node, { sourceFile });
  appendTargetFactReasons(reasons, input, symbol, "symbol");
  const type = input.checker.getTypeAtLocation(node, { sourceFile });
  appendTargetFactReasons(reasons, input, type, "type");
  appendTargetFactReasons(reasons, input, type?.symbol, "type symbol");
  if (hasBuiltinLoweredScalarType(type)) {
    reasons.push("builtin scalar target lowering");
  }
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned: isDirectSourceShapeType(type, input),
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
  const symbol = input.checker.getSymbolAtLocation(callee, { sourceFile }) ?? input.checker.getResolvedSymbol(callee, { sourceFile });
  appendTargetFactReasons(reasons, input, symbol, "callee symbol");
  const type = input.checker.getTypeAtLocation(callee, { sourceFile });
  appendTargetFactReasons(reasons, input, type, "callee type");
  appendTargetFactReasons(reasons, input, type?.symbol, "callee type symbol");
  const sourceOwned = isSourceDeclaredCallable(symbol, input) || isDirectSourceShapeType(type, input);
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned,
    reasons,
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

function hasBuiltinLoweredScalarType(type: Type | undefined): boolean {
  return type !== undefined &&
    (type.flags & (TypeFlagsStringLike | TypeFlagsNumberLike | TypeFlagsBooleanLike | TypeFlagsBigIntLike)) !== 0;
}

function isDirectSourceShapeType(type: Type | undefined, input: TargetCompileInput): boolean {
  if (type !== undefined && (type.flags & TypeFlagsTypeParameter) !== 0) {
    return true;
  }
  const declaration = getPrimaryDeclaration(type?.symbol);
  return isProjectSourceDeclaration(declaration, input) &&
    (declaration?.Kind === KindClassDeclaration || declaration?.Kind === KindInterfaceDeclaration);
}

function isSourceDeclaredCallable(symbol: Symbol | undefined, input: TargetCompileInput): boolean {
  const declaration = getPrimaryDeclaration(symbol);
  return !hasProviderOnlySymbolName(symbol) &&
    isProjectSourceDeclaration(declaration, input) &&
    (
      declaration?.Kind === KindFunctionDeclaration ||
      declaration?.Kind === KindFunctionExpression ||
      declaration?.Kind === KindMethodDeclaration ||
      declaration?.Kind === KindConstructor
    );
}

function getPrimaryDeclaration(symbol: Symbol | undefined): Node | undefined {
  return symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate): candidate is Node => candidate !== undefined);
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
