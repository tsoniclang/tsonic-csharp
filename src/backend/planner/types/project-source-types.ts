import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetPlanningSourceNavigation } from "@tsonic/target-api/analysis";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function getCsharpTypeFromProjectSourceReferenceNode(
  node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const declaration = input.program.records.projectSourceReference.get(node);
  return declaration === undefined ? undefined : renderProjectSourceType(declaration, input, diagnostics);
}

export function getCsharpTypeFromProjectSourceReference(
  reference: ReturnType<TargetPlanningSourceNavigation["referenceFor"]>, input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  return reference === undefined ? undefined : renderProjectSourceType(reference.declaration, input, diagnostics);
}

function renderProjectSourceType(declaration: Node, input: CsharpPlanningContext, _diagnostics?: TargetDiagnostic[]): CsharpTypeNode | undefined {
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
