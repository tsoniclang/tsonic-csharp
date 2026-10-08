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
  Node_Text,
  sourceDeclarationIsModuleScoped,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import {
  getCsharpLocalBindingName,
} from "../bindings/index.js";
import { getCsharpExpressionOverride } from "../bindings/binding-state.js";
import {
  planFlowReadUseSiteProjection,
} from "./flow-read-projections.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import { isProviderVirtualSourceFile } from "../program/provider-virtual-source-files.js";
import { sourceFileClassName } from "../artifacts/source-paths.js";
import { planCsharpSourceModuleMemberName, planCsharpSourceModuleValueReference } from "../bindings/module-values.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { csharpCapturedBindingExpression } from "../bindings/capture-storage.js";
import { planCsharpFrameClosureReference } from "../bindings/capture-closures.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { getCsharpTypeFromProjectSourceReference } from "../types/project-source-types.js";

export function planIdentifierExpression(
  identifier: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const override = getCsharpExpressionOverride(identifier, state);
  if (override !== undefined) return override;
  const sourceName = Node_Text(input.program.source.ast, AsIdentifier(input.program.source.ast, identifier));
  const sourceReference = input.program.sourceNavigation.referenceFor(identifier);
  const declarationReference = input.program.sourceNavigation.sourceReferenceFor(identifier);
  if (declarationReference !== undefined && input.program.captureStorage.closure(declarationReference.declaration) !== undefined) {
    return planCsharpFrameClosureReference(declarationReference.declaration, input, diagnostics, state);
  }
  const selectedClass = declarationReference === undefined ? undefined : input.scope.classValues?.get(declarationReference.declaration);
  if (selectedClass !== undefined) return selectedClass;
  if (declarationReference !== undefined && input.program.classFactories.get(declarationReference.declaration) !== undefined) {
    return { kind: "IdentifierName", name: getCsharpLocalBindingName(identifier, input, state) ??
      requireCsharpIdentifier(sourceName, diagnostics, "Local class value") };
  }
  if (declarationReference !== undefined && input.program.source.ast.is.IsClassDeclaration(declarationReference.declaration)) {
    const constructor = getCsharpDelegateSignature(input.types.classifications.resolveNode(identifier));
    if (constructor !== undefined) {
      const resultType = csharpTypeFromTargetTypeRef(constructor.returnType, input.scope.typeParameterNames);
      const parameters = constructor.parameters.map((type, index) => ({ name: `argument${index}`, type: csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames) }));
      if (resultType === undefined || parameters.some(parameter => parameter.type === undefined)) {
        diagnostics.push(unsupportedNodeDiagnostic(identifier, "The selected constructor value has no closed native factory signature."));
        return undefined;
      }
      return {
        kind: "LambdaExpression",
        parameters: parameters.map(parameter => ({ kind: "Parameter", name: parameter.name, type: parameter.type! })),
        body: { kind: "ObjectCreationExpression", type: resultType,
          arguments: parameters.map(parameter => ({ kind: "Argument", expression: { kind: "IdentifierName", name: parameter.name } })) },
      };
    }
  }
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
  const declaration = declarationReference?.declaration;
  const expression: CsharpExpression = (declaration === undefined ? undefined : csharpCapturedBindingExpression(declaration, input, state)) ?? {
    kind: "IdentifierName",
    name: getCsharpLocalBindingName(identifier, input, state) ??
      requireCsharpIdentifier(sourceName, diagnostics, "Source identifier"),
  };
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
  const receiver = csharpTypeFromTargetTypeRef(member.declaringType, input.scope.typeParameterNames);
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
  const sourceReference = getProjectSourceReferenceForModuleMemberNode(node, sourceFile, input);
  if (sourceReference === undefined) {
    return undefined;
  }
  if (isExternalDeclarationReference(sourceReference, sourceFile, input)) {
    return undefined;
  }
  if (isModuleTypeValueDeclaration(sourceReference.declaration, input)) {
    return getCsharpTypeFromProjectSourceReference(sourceReference, input, diagnostics);
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
  return planCsharpSourceModuleValueReference(sourceReference, node, sourceFile, input, diagnostics);
}

export function tryPlanProjectSourceModuleStaticMemberReference(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
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
    name: planCsharpSourceModuleMemberName(sourceReference.declaration, input, diagnostics),
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
  return (HasSourceKind(input.program.source.ast, declaration, KindFunctionDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindExportAssignment) ||
    HasSourceKind(input.program.source.ast, declaration, KindVariableDeclaration) ||
    input.program.source.ast.is.IsBindingElement(declaration)) &&
    sourceDeclarationIsModuleScoped(declaration, input.program.source.ast);
}

function isModuleTypeValueDeclaration(declaration: Node, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, declaration, KindClassDeclaration) ||
    HasSourceKind(input.program.source.ast, declaration, KindEnumDeclaration);
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
