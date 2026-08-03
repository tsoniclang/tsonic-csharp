import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsIdentifier,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindExportAssignment,
  KindClassDeclaration,
  KindEnumDeclaration,
  KindEnumMember,
  KindFunctionDeclaration,
  KindGetAccessor,
  KindInterfaceDeclaration,
  KindMethodDeclaration,
  KindPropertyAccessExpression,
  KindPropertyDeclaration,
  KindSetAccessor,
  KindVariableDeclaration,
  Node_Name,
  Node_Text,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { requireCsharpIdentifier, sanitizeIdentifier } from "./identifiers.js";
import { planIdentifierName } from "./names.js";
import {
  getCsharpLocalBindingName,
} from "./bindings.js";
import {
  planFlowReadUseSiteProjection,
} from "./flow-read-projections.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import { isProviderVirtualSourceFile } from "./provider-virtual-source-files.js";
import { sourceFileClassName } from "./source-paths.js";
import {
  selectCsharpProviderValue,
} from "../../policy/members/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const sourceName = Node_Text(input.ast, AsIdentifier(identifier));
  const sourceReference = input.navigation.referenceFor(identifier);
  const declarationReference = input.navigation.sourceReferenceFor(identifier);
  if (isGlobalUndefinedExpression(identifier, sourceName, sourceFile, input, sourceReference)) {
    return { kind: "LiteralExpression", value: null };
  }
  const providerDiagnosticsStart = diagnostics.length;
  const providerValue = planProviderValueReference(
    identifier,
    input,
    diagnostics,
  );
  if (providerValue !== undefined) {
    return providerValue;
  }
  if (diagnostics.length > providerDiagnosticsStart) {
    return undefined;
  }
  if (isExternalDeclarationReference(declarationReference, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return undefined;
  }
  if (
    isProviderVirtualDeclarationIdentifier(identifier, sourceFile, input)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`));
    return undefined;
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(identifier, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const expression: CsharpExpression = {
    kind: "IdentifierName",
    name: getCsharpLocalBindingName(identifier, input, state) ??
      requireCsharpIdentifier(sourceName, diagnostics, "Source identifier"),
  };
  return planFlowReadUseSiteProjection(identifier, expression, sourceFile, input, diagnostics);
}

function planProviderValueReference(
  identifier: Node,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = selectCsharpProviderValue(input, identifier);
  if (selection.kind === "not-provider") {
    return undefined;
  }
  if (selection.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(identifier, selection.reason));
    return undefined;
  }
  const member = selection.relation.targetMember;
  if (
    member.static !== true ||
    (
      member.kind !== "property" &&
      member.kind !== "field"
    ) ||
    member.declaringType === undefined
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      identifier,
      `Selected provider value relation '${member.id}' is not a static C# property or field.`,
    ));
    return undefined;
  }
  const receiver = csharpTypeFromTargetTypeRef(member.declaringType);
  if (receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      identifier,
      `Selected provider value relation '${member.id}' has no renderable C# declaring type.`,
    ));
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver,
    name: member.targetName,
  };
}

function isGlobalUndefinedExpression(
  identifier: Node,
  sourceName: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  sourceReference: ReturnType<CsharpTranslationContext["navigation"]["referenceFor"]>,
): boolean {
  if (!nullLiteralGlobalSourceNames.has(sourceName) || sourceReference !== undefined) {
    return false;
  }
  const semantics = input.semantics(sourceFile);
  const type = semantics.getTypeAtLocation(identifier);
  return type !== undefined && semantics.isNullish(type);
}

const nullLiteralGlobalSourceNames = new Set(["undefined"]);

export function isExternalDeclarationReference(
  reference: { readonly sourceFile: SourceFile } | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  return reference !== undefined &&
    reference.sourceFile !== sourceFile &&
    (reference.sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, reference.sourceFile));
}

export function planProjectSourceModuleMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceTypeMemberReference = tryPlanProjectSourceTypeMemberReference(node, sourceFile, input, diagnostics);
  if (sourceTypeMemberReference !== undefined) {
    return sourceTypeMemberReference;
  }
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined || sourceReference.sourceFile === sourceFile) {
    return undefined;
  }
  if (isExternalDeclarationReference(sourceReference, sourceFile, input)) {
    return undefined;
  }
  if (isModuleTypeValueDeclaration(sourceReference.declaration, input)) {
    return {
      kind: "IdentifierName",
      name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
    };
  }
  if (isNestedProjectSourceMemberDeclaration(sourceReference.declaration, input)) {
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
      name: sourceFileClassName(
        input,
        input.ast.getFileName(sourceReference.sourceFile),
      ),
    },
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
  };
}

export function tryPlanProjectSourceModuleStaticMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceTypeMemberReference = tryPlanProjectSourceTypeMemberReference(node, sourceFile, input, diagnostics);
  if (sourceTypeMemberReference !== undefined) {
    return sourceTypeMemberReference;
  }
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
      name: sourceFileClassName(
        input,
        input.ast.getFileName(sourceReference.sourceFile),
      ),
    },
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
  };
}

function getProjectSourceReferenceForModuleMemberNode(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): ReturnType<CsharpTranslationContext["navigation"]["referenceFor"]> {
  return input.navigation.referenceFor(node) ??
    getProjectSourceReferenceForPropertyAccessName(node, sourceFile, input);
}

function isProviderVirtualDeclarationIdentifier(
  identifier: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const symbols = [
    input.semantics(sourceFile).getSymbolAtLocation(identifier),
    input.semantics(sourceFile).getResolvedSymbol(identifier),
  ];
  return symbols.some((symbol) => {
    if (symbol === undefined) {
      return false;
    }
    if (
      input.sourceFacts?.getFact(
        symbol,
        providerVirtualDeclarationFactKey,
      ) !== undefined
    ) {
      return true;
    }
    const declarations = input.semantics(sourceFile).getSymbolDeclarations(symbol);
    return declarations.some((declaration) =>
      input.sourceFacts?.getFact(
        declaration,
        providerVirtualDeclarationFactKey,
      ) !== undefined ||
      isProviderVirtualSourceFile(input, input.ast.getSourceFile(declaration)));
  });
}

function isModuleStaticValueDeclaration(declaration: Node, input: CsharpTranslationContext): boolean {
  return HasSourceKind(input.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.ast, declaration, KindVariableDeclaration) ||
    HasSourceKind(input.ast, declaration, KindExportAssignment);
}

function isModuleTypeValueDeclaration(declaration: Node, input: CsharpTranslationContext): boolean {
  return HasSourceKind(input.ast, declaration, KindClassDeclaration) ||
    HasSourceKind(input.ast, declaration, KindEnumDeclaration);
}

function tryPlanProjectSourceTypeMemberReference(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const propertyAccess = AsPropertyAccessExpression(node);
  if (propertyAccess?.Expression === undefined || propertyAccess.name === undefined) {
    return undefined;
  }
  const receiverReference = input.navigation.referenceFor(propertyAccess.Expression);
  if (receiverReference === undefined ||
    receiverReference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, receiverReference.sourceFile) ||
    !isModuleTypeValueDeclaration(receiverReference.declaration, input)) {
    return undefined;
  }
  const selectedMemberReference = input.navigation.referenceFor(node) ??
    input.navigation.referenceFor(propertyAccess.name);
  if (selectedMemberReference === undefined ||
    selectedMemberReference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, selectedMemberReference.sourceFile) ||
    input.ast.parent(selectedMemberReference.declaration) !== receiverReference.declaration ||
    !isProjectSourceTypeMemberDeclaration(selectedMemberReference.declaration, input)) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: planProjectSourceModuleMemberName(receiverReference.declaration, input, diagnostics),
    },
    name: planProjectSourceModuleMemberName(selectedMemberReference.declaration, input, diagnostics),
  };
}

function isProjectSourceTypeMemberDeclaration(declaration: Node, input: CsharpTranslationContext): boolean {
  return HasSourceKind(input.ast, declaration, KindEnumMember) ||
    HasSourceKind(input.ast, declaration, KindGetAccessor) ||
    HasSourceKind(input.ast, declaration, KindMethodDeclaration) ||
    HasSourceKind(input.ast, declaration, KindPropertyDeclaration) ||
    HasSourceKind(input.ast, declaration, KindSetAccessor);
}

function isNestedProjectSourceMemberDeclaration(declaration: Node, input: CsharpTranslationContext): boolean {
  if (!isProjectSourceTypeMemberDeclaration(declaration, input)) {
    return false;
  }
  const parent = input.ast.parent(declaration);
  return HasSourceKind(input.ast, parent, KindClassDeclaration) ||
    HasSourceKind(input.ast, parent, KindEnumDeclaration) ||
    HasSourceKind(input.ast, parent, KindInterfaceDeclaration);
}

function planProjectSourceModuleMemberName(
  declaration: Node,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): string {
  if (HasSourceKind(input.ast, declaration, KindExportAssignment)) {
    return sanitizeIdentifier("default");
  }
  return planIdentifierName(
    Node_Name(input.ast, declaration),
    "InvalidCrossFileReference",
    input,
    diagnostics,
    "Cross-file source reference",
  );
}

function getProjectSourceReferenceForPropertyAccessName(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpTranslationContext,
): ReturnType<CsharpTranslationContext["navigation"]["referenceFor"]> {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const name = AsPropertyAccessExpression(node)?.name;
  return name === undefined
    ? undefined
    : input.navigation.referenceFor(name);
}
