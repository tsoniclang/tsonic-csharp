import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetPlanningSourceNavigation } from "@tsonic/target-api/analysis";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";
import { csharpSourceTypeArgumentNodes } from "../../../target-model/syntax/type-arguments.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function getCsharpTypeFromProjectSourceReferenceNode(
  node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const declaration = input.program.records.projectSourceReference.get(node);
  return declaration === undefined ? undefined : renderProjectSourceType(declaration, input, diagnostics);
}

export function getCsharpTypeFromProjectSourceTypeReferenceNode(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  resolveCsharpType: (typeNode: Node | undefined, typeSourceFile: SourceFile, typeInput: CsharpPlanningContext,
    typeDiagnostics?: TargetDiagnostic[]) => CsharpTypeNode,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const referenceNode = input.program.source.ast.name(node) ?? node;
  const type = getCsharpTypeFromProjectSourceReferenceNode(referenceNode, sourceFile, input, diagnostics);
  if (type === undefined) return undefined;
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, node)
    .map(argument => resolveCsharpType(argument, sourceFile, input, diagnostics));
  return withCsharpTypeArguments(type, typeArguments);
}

export function getCsharpTypeFromProjectSourceReference(
  reference: ReturnType<TargetPlanningSourceNavigation["referenceFor"]>, input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  return reference === undefined ? undefined : renderProjectSourceType(reference.declaration, input, diagnostics);
}

function renderProjectSourceType(declaration: Node, input: CsharpPlanningContext, diagnostics?: TargetDiagnostic[]): CsharpTypeNode | undefined {
  const selected = input.program.records.projectSourceType.get(declaration);
  if (selected === undefined) return undefined;
  const factory = input.program.records.classFactory.get(declaration);
  if (factory !== undefined) return { kind: "QualifiedName",
    left: { kind: "IdentifierName", name: sanitizeIdentifier(factory.instanceScope) }, name: sanitizeIdentifier(factory.instanceName) };
  if (selected.name === undefined) failCsharpPlannerInvariant("An admitted native source type requires its exact declaration name.", declaration);
  const name = planIdentifierName(selected.name, input, "Project source type reference");
  return selected.scopeName === undefined ? { kind: "IdentifierName", name }
    : { kind: "QualifiedName", left: { kind: "IdentifierName", name: sanitizeIdentifier(selected.scopeName) }, name };
}

export function withCsharpTypeArguments(type: CsharpTypeNode, typeArguments: readonly CsharpTypeNode[]): CsharpTypeNode {
  if (typeArguments.length === 0) return type;
  if (type.kind !== "IdentifierName" && type.kind !== "QualifiedName")
    failCsharpPlannerInvariant("An admitted project source type requires a named native generic destination.");
  return { ...type, typeArguments };
}
