import {
  AsIdentifier,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindExportAssignment,
  KindFunctionDeclaration,
  KindPropertyAccessExpression,
  KindVariableDeclaration,
  Node_Name,
  Node_Text,
  SourceFile_FileName,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { requireCsharpIdentifier, sanitizeIdentifier } from "./identifiers.js";
import { planIdentifierName } from "./names.js";
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
): CsharpExpression | undefined {
  const sourceName = Node_Text(AsIdentifier(identifier));
  const sourceReference = input.analysis.getProjectSourceReferenceForNode(identifier, { sourceFile });
  const referenceTargetBinding = input.targetFacts.getTargetBindingForReference(identifier, { sourceFile });
  if (isGlobalUndefinedExpression(identifier, sourceName, sourceFile, input, sourceReference, referenceTargetBinding)) {
    return { kind: "LiteralExpression", value: null };
  }
  if (isExternalDeclarationReference(sourceReference, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return undefined;
  }
  if (referenceTargetBinding !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return undefined;
  }
  const directSymbol = input.analysis.getSymbolAtLocation(identifier, { sourceFile });
  const resolvedSymbol = input.analysis.getResolvedSymbol(identifier, { sourceFile });
  const directTargetBinding = input.facts.getTargetBindingFact(directSymbol) ??
    input.facts.getTargetBindingFact(resolvedSymbol);
  if (
    directTargetBinding !== undefined ||
    isProviderVirtualDeclarationIdentifier(identifier, sourceFile, input)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return undefined;
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

function isGlobalUndefinedExpression(
  identifier: Node,
  sourceName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  sourceReference: ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]>,
  targetBinding: ReturnType<TargetCompileInput["targetFacts"]["getTargetBindingForReference"]>,
): boolean {
  if (!nullLiteralGlobalSourceNames.has(sourceName) || sourceReference !== undefined || targetBinding !== undefined) {
    return false;
  }
  const type = input.analysis.getTypeAtLocation(identifier, { sourceFile });
  return type !== undefined && input.types.isNullish(type);
}

const nullLiteralGlobalSourceNames = new Set(["undefined"]);

export function isExternalDeclarationReference(
  reference: ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]>,
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
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(input, SourceFile_FileName(sourceReference.sourceFile)),
    },
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
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
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
  };
}

function getProjectSourceReferenceForModuleMemberNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]> {
  return input.analysis.getProjectSourceReferenceForNode(node, { sourceFile }) ??
    getProjectSourceReferenceForPropertyAccessName(node, sourceFile, input);
}

function isProviderVirtualDeclarationIdentifier(
  identifier: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const symbols = [
    input.analysis.getSymbolAtLocation(identifier, { sourceFile }),
    input.analysis.getResolvedSymbol(identifier, { sourceFile }),
  ];
  return symbols.some((symbol) => {
    if (symbol === undefined) {
      return false;
    }
    if (input.facts.getTargetBindingFact(symbol) !== undefined) {
      return true;
    }
    const declarations = input.analysis.getSymbolDeclarations(symbol);
    return declarations.some((declaration) =>
      input.facts.getFact(declaration, providerVirtualDeclarationFactKey) !== undefined ||
      isProviderVirtualSourceFile(input, input.ast.getSourceFile(declaration)));
  });
}

function isModuleStaticValueDeclaration(declaration: Node, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.ast, declaration, KindVariableDeclaration) ||
    HasSourceKind(input.ast, declaration, KindExportAssignment);
}

function planProjectSourceModuleMemberName(
  declaration: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string {
  if (HasSourceKind(input.ast, declaration, KindExportAssignment)) {
    return sanitizeIdentifier("default");
  }
  return planIdentifierName(
    Node_Name(declaration),
    "InvalidCrossFileReference",
    input,
    diagnostics,
    "Cross-file source reference",
  );
}

function getProjectSourceReferenceForPropertyAccessName(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]> {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const name = AsPropertyAccessExpression(node)?.name;
  return name === undefined
    ? undefined
    : input.analysis.getProjectSourceReferenceForNode(name, { sourceFile });
}
