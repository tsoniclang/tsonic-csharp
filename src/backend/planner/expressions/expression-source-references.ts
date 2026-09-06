import type { CsharpPlanningContext } from "../context.js";
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
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { requireCsharpIdentifier, sanitizeIdentifier } from "../../../target-model/names/identifiers.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import {
  getCsharpLocalBindingName,
} from "../bindings/index.js";
import {
  planFlowReadUseSiteProjection,
} from "./flow-read-projections.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import { isProviderVirtualSourceFile } from "../program/provider-virtual-source-files.js";
import { sourceFileClassName } from "../artifacts/source-paths.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

export function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const sourceName = Node_Text(input.program.source.ast, AsIdentifier(input.program.source.ast, identifier));
  const sourceReference = input.program.sourceNavigation.referenceFor(identifier);
  const declarationReference = input.program.sourceNavigation.sourceReferenceFor(identifier);
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
    isProviderVirtualDeclarationIdentifier(identifier, input)
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
  const declaration = declarationReference?.declaration;
  const value: CsharpExpression = declaration !== undefined && input.program.storage.nativeBacking(declaration) !== undefined
    ? { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Value" } : expression;
  return planFlowReadUseSiteProjection(identifier, value, sourceFile, input, diagnostics);
}

function planProviderValueReference(
  identifier: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = input.program.operations.providerValue(identifier);
  if (selection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      identifier,
      "C# planning received a provider value without a sealed operation classification.",
    ));
    return undefined;
  }
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
  input: CsharpPlanningContext,
  sourceReference: ReturnType<CsharpPlanningContext["program"]["sourceNavigation"]["referenceFor"]>,
): boolean {
  if (!nullLiteralGlobalSourceNames.has(sourceName) || sourceReference !== undefined) {
    return false;
  }
  const type = input.program.sourceEvidence.expressionType(identifier);
  return type !== undefined &&
    input.program.sourceEvidence.semanticType(type, sourceFile)?.nullish === true;
}

const nullLiteralGlobalSourceNames = new Set(["undefined"]);

export function isExternalDeclarationReference(
  reference: { readonly sourceFile: SourceFile } | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  return reference !== undefined &&
    reference.sourceFile !== sourceFile &&
    (reference.sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, reference.sourceFile));
}

export function planProjectSourceModuleMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceTypeMemberReference = tryPlanProjectSourceTypeMemberReference(node, sourceFile, input, diagnostics);
  if (sourceTypeMemberReference !== undefined) {
    return sourceTypeMemberReference;
  }
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined) {
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
  if (
    sourceReference.sourceFile === sourceFile &&
    !isModuleStaticValueDeclaration(sourceReference.declaration, input)
  ) {
    return undefined;
  }
  if (!isModuleStaticValueDeclaration(sourceReference.declaration, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Project source reference requires a top-level function or variable declaration resolved by TSTS."));
    return undefined;
  }
  if (
    sourceReference.sourceFile === sourceFile &&
    input.types.projectTypes.definitionContainingDeclaration(node) === undefined
  ) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(
        input,
        input.program.source.ast.getFileName(sourceReference.sourceFile),
      ),
    },
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
  };
}

export function tryPlanProjectSourceModuleStaticMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const sourceTypeMemberReference = tryPlanProjectSourceTypeMemberReference(node, sourceFile, input, diagnostics);
  if (sourceTypeMemberReference !== undefined) {
    return sourceTypeMemberReference;
  }
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined ||
    isExternalDeclarationReference(sourceReference, sourceFile, input) ||
    !isModuleStaticValueDeclaration(sourceReference.declaration, input)) {
    return undefined;
  }
  if (
    sourceReference.sourceFile === sourceFile &&
    input.types.projectTypes.definitionContainingDeclaration(node) === undefined
  ) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: {
      kind: "IdentifierName",
      name: sourceFileClassName(
        input,
        input.program.source.ast.getFileName(sourceReference.sourceFile),
      ),
    },
    name: planProjectSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
  };
}

function getProjectSourceReferenceForModuleMemberNode(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): ReturnType<CsharpPlanningContext["program"]["sourceNavigation"]["referenceFor"]> {
  return input.program.sourceNavigation.referenceFor(node) ??
    getProjectSourceReferenceForPropertyAccessName(node, sourceFile, input);
}

function isProviderVirtualDeclarationIdentifier(
  identifier: Node,
  input: CsharpPlanningContext,
): boolean {
  const declaration = input.program.sourceNavigation.referenceFor(identifier)?.declaration ??
    input.program.sourceNavigation.declarationFor(identifier);
  if (declaration === undefined) {
    return false;
  }
  return input.program.sourceEvidence.providerVirtualDeclaration(declaration) ||
    isProviderVirtualSourceFile(input, input.program.source.ast.getSourceFile(declaration));
}

function isModuleStaticValueDeclaration(declaration: Node, input: CsharpPlanningContext): boolean {
  if (
    HasSourceKind(input.program.source.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindExportAssignment)
  ) {
    const parent = input.program.source.ast.parent(declaration);
    return parent !== undefined && input.program.source.ast.is.IsSourceFile(parent);
  }
  if (!HasSourceKind(input.program.source.ast, declaration, KindVariableDeclaration)) {
    return false;
  }
  const declarationList = input.program.source.ast.parent(declaration);
  if (
    declarationList === undefined ||
    !input.program.source.ast.is.IsVariableDeclarationList(declarationList)
  ) {
    return false;
  }
  const statement = input.program.source.ast.parent(declarationList);
  if (
    statement === undefined ||
    !input.program.source.ast.is.IsVariableStatement(statement)
  ) {
    return false;
  }
  const sourceFile = input.program.source.ast.parent(statement);
  return sourceFile !== undefined && input.program.source.ast.is.IsSourceFile(sourceFile);
}

function isModuleTypeValueDeclaration(declaration: Node, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, declaration, KindClassDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindEnumDeclaration);
}

function tryPlanProjectSourceTypeMemberReference(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (!HasSourceKind(input.program.source.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const propertyAccess = AsPropertyAccessExpression(input.program.source.ast, node);
  if (propertyAccess?.Expression === undefined || propertyAccess.name === undefined) {
    return undefined;
  }
  const receiverReference = input.program.sourceNavigation.referenceFor(propertyAccess.Expression);
  if (receiverReference === undefined ||
    receiverReference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, receiverReference.sourceFile) ||
    !isModuleTypeValueDeclaration(receiverReference.declaration, input)) {
    return undefined;
  }
  const selectedMemberReference = input.program.sourceNavigation.referenceFor(node) ??
    input.program.sourceNavigation.referenceFor(propertyAccess.name);
  if (selectedMemberReference === undefined ||
    selectedMemberReference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, selectedMemberReference.sourceFile) ||
    input.program.source.ast.parent(selectedMemberReference.declaration) !== receiverReference.declaration ||
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

function isProjectSourceTypeMemberDeclaration(declaration: Node, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, declaration, KindEnumMember) ||
    HasSourceKind(input.program.source.ast, declaration, KindGetAccessor) ||
    HasSourceKind(input.program.source.ast, declaration, KindMethodDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindPropertyDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindSetAccessor);
}

function isNestedProjectSourceMemberDeclaration(declaration: Node, input: CsharpPlanningContext): boolean {
  if (!isProjectSourceTypeMemberDeclaration(declaration, input)) {
    return false;
  }
  const parent = input.program.source.ast.parent(declaration);
  return HasSourceKind(input.program.source.ast, parent, KindClassDeclaration) ||
    HasSourceKind(input.program.source.ast, parent, KindEnumDeclaration) ||
    HasSourceKind(input.program.source.ast, parent, KindInterfaceDeclaration);
}

function planProjectSourceModuleMemberName(
  declaration: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string {
  if (HasSourceKind(input.program.source.ast, declaration, KindExportAssignment)) {
    return sanitizeIdentifier("default");
  }
  return planIdentifierName(
    Node_Name(input.program.source.ast, declaration),
    "InvalidCrossFileReference",
    input,
    diagnostics,
    "Cross-file source reference",
  );
}

function getProjectSourceReferenceForPropertyAccessName(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
): ReturnType<CsharpPlanningContext["program"]["sourceNavigation"]["referenceFor"]> {
  if (!HasSourceKind(input.program.source.ast, node, KindPropertyAccessExpression)) {
    return undefined;
  }
  const name = AsPropertyAccessExpression(input.program.source.ast, node)?.name;
  return name === undefined
    ? undefined
    : input.program.sourceNavigation.referenceFor(name);
}
