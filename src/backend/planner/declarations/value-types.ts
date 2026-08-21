import type { CsharpPlanningContext } from "../context.js";
import {
  AsCallExpression,
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsVariableDeclaration,
  KindCallExpression,
  KindObjectLiteralExpression,
  KindPropertyAssignment,
  Node_Name,
  Node_Text,
  SourceKind,
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpSourceField,
  CsharpSourceStruct,
} from "../../../analysis/source-evidence/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpFieldDeclaration, CsharpStructDeclaration, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planIdentifierName } from "../names/source-identifiers.js";

export function planValueTypeDeclaration(
  declarationNode: Node,
  valueType: CsharpSourceStruct,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpStructDeclaration {
  const declaration = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  if (valueType.valueType !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(declarationNode, "Struct declaration emission requires a finalized value-type struct fact."));
  }
  diagnoseUnprovenValueTypeFields(declaration, input, diagnostics);
  return {
    kind: "StructDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousValueType", input, diagnostics, "Value type name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(declarationNode, sourceFile, input, diagnostics),
    members: valueType.fields.map((field): CsharpFieldDeclaration => ({
      kind: "FieldDeclaration",
      name: field.sourceName,
      modifiers: field.readonly ? ["public", "readonly"] : ["public"],
      type: getCsharpTypeForSourceField(field, "Value-type field", sourceFile, input, diagnostics),
    })),
  };
}

export function getCsharpTypeForSourceField(
  field: CsharpSourceField,
  diagnosticLabel: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  return getCsharpTypeForNode(
    field.sourceType,
    sourceFile,
    input,
    invalidCsharpType(`${diagnosticLabel} '${field.sourceName}' type`),
    diagnostics,
  );
}

function diagnoseUnprovenValueTypeFields(
  declaration: NonNullable<ReturnType<typeof AsVariableDeclaration>>,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  const initializer = SourceKind(input.program.source.ast, declaration.Initializer) === KindCallExpression
    ? AsCallExpression(input.program.source.ast, declaration.Initializer)
    : undefined;
  const shapeNode = (initializer?.Arguments?.Nodes ?? [])[0];
  const shape = SourceKind(input.program.source.ast, shapeNode) === KindObjectLiteralExpression
    ? AsObjectLiteralExpression(input.program.source.ast, shapeNode)
    : undefined;
  if (shape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration.Initializer ?? declaration,
      "Struct declaration emission requires struct(...) to receive an object-literal field shape so C# value-type fields are proven before emission.",
    ));
    return;
  }
  for (const property of shape.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    if (SourceKind(input.program.source.ast, property) !== KindPropertyAssignment) {
      diagnostics.push(unsupportedNodeDiagnostic(property, "Value-type members require finalized field facts from field-marker property assignments."));
      continue;
    }
    const assignment = AsPropertyAssignment(input.program.source.ast, property)!;
    if (input.program.sourceEvidence.sourceField([
      property,
      assignment.Initializer,
      Node_Name(input.program.source.ast, property),
    ]) === undefined) {
      const name = Node_Text(input.program.source.ast, Node_Name(input.program.source.ast, property));
      diagnostics.push(unsupportedNodeDiagnostic(property, `Value-type member '${name}' requires a finalized field fact before C# struct emission.`));
    }
  }
}
