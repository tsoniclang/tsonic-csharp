import {
  AsIdentifier,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindExportAssignment,
  KindFunctionDeclaration,
  KindPropertyAccessExpression,
  KindVariableDeclaration,
  Node_Text,
  SourceFile_FileName,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import {
  getCsharpLocalBindingName,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import { isProviderVirtualSourceFile } from "./provider-virtual-source-files.js";
import { sourceFileClassName } from "./source-paths.js";

export function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression {
  const sourceName = Node_Text(AsIdentifier(identifier));
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(identifier, { sourceFile });
  if (isExternalDeclarationReference(sourceReference, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("declaration identifier expression");
  }
  const referenceTargetBinding = input.semantics.getTargetBindingForReference(identifier, { sourceFile });
  if (referenceTargetBinding !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const directSymbol = input.semantics.getSymbolAtLocation(identifier, { sourceFile });
  const resolvedSymbol = input.semantics.getResolvedSymbol(identifier, { sourceFile });
  const directTargetBinding = input.facts.getTargetBindingFact(directSymbol) ??
    input.facts.getTargetBindingFact(resolvedSymbol);
  if (
    directTargetBinding !== undefined ||
    isProviderVirtualDeclarationIdentifier(identifier, sourceFile, input)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return invalidExpression("provider-owned identifier expression");
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(identifier, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  return {
    kind: "IdentifierName",
    name: getCsharpLocalBindingName(identifier, sourceFile, input, state) ??
      requireCsharpIdentifier(sourceName, diagnostics, "Source identifier"),
  };
}

export function isExternalDeclarationReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  return reference !== undefined &&
    reference.sourceFile !== sourceFile &&
    (reference.sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, reference.sourceFile));
}

export function planProjectSourceModuleMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined || sourceReference.sourceFile === sourceFile) {
    return undefined;
  }
  if (isExternalDeclarationReference(sourceReference, sourceFile, input)) {
    return undefined;
  }
  if (!isModuleStaticValueDeclaration(sourceReference.declaration, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Cross-file source reference requires a top-level function or variable declaration resolved by TSTS."));
    return invalidExpression("cross-file source reference");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(input, SourceFile_FileName(sourceReference.sourceFile)),
    },
    name: requireCsharpIdentifier(sourceReference.symbol.Name, diagnostics, "Cross-file source reference"),
  };
}

export function tryPlanProjectSourceModuleStaticMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined ||
    sourceReference.sourceFile === sourceFile ||
    isExternalDeclarationReference(sourceReference, sourceFile, input) ||
    !isModuleStaticValueDeclaration(sourceReference.declaration, input)) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(input, SourceFile_FileName(sourceReference.sourceFile)),
    },
    name: requireCsharpIdentifier(sourceReference.symbol.Name, diagnostics, "Cross-file source reference"),
  };
}

function getProjectSourceReferenceForModuleMemberNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]> {
  return input.semantics.getProjectSourceReferenceForNode(node, { sourceFile }) ??
    getProjectSourceReferenceForPropertyAccessName(node, sourceFile, input);
}

function isProviderVirtualDeclarationIdentifier(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const symbols = [
    input.semantics.getSymbolAtLocation(identifier, { sourceFile }),
    input.semantics.getResolvedSymbol(identifier, { sourceFile }),
  ];
  return symbols.some((symbol) => {
    if (symbol === undefined) {
      return false;
    }
    if (input.facts.getTargetBindingFact(symbol) !== undefined) {
      return true;
    }
    const declarations = getSymbolDeclarations(symbol);
    return declarations.some((declaration) =>
      input.facts.getFact(declaration, providerVirtualDeclarationFactKey) !== undefined ||
      isProviderVirtualSourceFile(input, input.ast.getSourceFile(declaration)));
  });
}

function getSymbolDeclarations(symbol: unknown): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined
      ? []
      : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

function isModuleStaticValueDeclaration(declaration: Node, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.ast, declaration, KindVariableDeclaration) ||
    HasSourceKind(input.ast, declaration, KindExportAssignment);
}

function getProjectSourceReferenceForPropertyAccessName(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]> {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const name = AsPropertyAccessExpression(node)?.name;
  return name === undefined
    ? undefined
    : input.semantics.getProjectSourceReferenceForNode(name, { sourceFile });
}
