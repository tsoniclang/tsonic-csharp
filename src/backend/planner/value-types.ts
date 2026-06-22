import {
  AsCallExpression,
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsVariableDeclaration,
  isAstNode,
  KindPropertyAssignment,
  Node_Name,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { FieldFact, Node, SourceFile, StructFact } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpFieldDeclaration, CsharpStructDeclaration, CsharpTypeNode } from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";
import {
  asSemanticType,
  asTargetTypeRef,
} from "../../source/fact-subjects.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getTargetTypeRefForType,
} from "./runtime-carriers.js";

export function planValueTypeDeclaration(
  declarationNode: Node,
  valueType: StructFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStructDeclaration {
  const declaration = AsVariableDeclaration(declarationNode)!;
  if (valueType.valueType !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(declarationNode, "Struct declaration emission requires a finalized value-type struct fact."));
  }
  diagnoseUnprovenValueTypeFields(declaration, input, diagnostics);
  return {
    kind: "StructDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousValueType", input, diagnostics, "Value type name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(declarationNode, sourceFile, input, diagnostics),
    members: (valueType.fields ?? []).map((field): CsharpFieldDeclaration => ({
      kind: "FieldDeclaration",
      name: field.name,
      modifiers: field.readonly === true ? ["public", "readonly"] : ["public"],
      type: getCsharpTypeForFieldFact(field, declarationNode, "Value-type field", sourceFile, input, diagnostics),
    })),
  };
}

export function getCsharpTypeForFieldFact(
  field: FieldFact,
  diagnosticNode: Node,
  diagnosticLabel: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  if (isAstNode(field.type)) {
    return getCsharpTypeForNode(field.type, sourceFile, input, undefined, diagnostics);
  }
  const directTargetType = asTargetTypeRef(field.type);
  const semanticType = asSemanticType(field.type);
  const targetType = directTargetType ?? getTargetTypeRefForType(input, semanticType, sourceFile);
  const csharpType = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${diagnosticLabel} '${field.name}' must carry a renderable AST, semantic type, or target type reference from finalized TSTS source facts.`));
  return invalidCsharpType(`${diagnosticLabel} fact type subject`);
}

function diagnoseUnprovenValueTypeFields(
  declaration: NonNullable<ReturnType<typeof AsVariableDeclaration>>,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  const initializer = AsCallExpression(declaration.Initializer);
  const shape = AsObjectLiteralExpression((initializer?.Arguments?.Nodes ?? [])[0]);
  if (shape === undefined) {
    return;
  }
  for (const property of shape.Properties?.Nodes ?? []) {
    if (property === undefined) {
      continue;
    }
    if (SourceKind(input.ast, property) !== KindPropertyAssignment) {
      diagnostics.push(unsupportedNodeDiagnostic(property, "Value-type members require finalized field facts from field-marker property assignments."));
      continue;
    }
    const assignment = AsPropertyAssignment(property)!;
    if (
      input.facts.getFieldFact(property) === undefined &&
      input.facts.getFieldFact(assignment.Initializer) === undefined &&
      input.facts.getFieldFact(Node_Name(property)) === undefined
    ) {
      const name = Node_Text(Node_Name(property));
      diagnostics.push(unsupportedNodeDiagnostic(property, `Value-type member '${name}' requires a finalized field fact before C# struct emission.`));
    }
  }
}
