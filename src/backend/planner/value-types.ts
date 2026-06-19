import { AsVariableDeclaration } from "@tsonic/tsts";
import type { Node, SourceFile, ValueTypeFact } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpFieldDeclaration, CsharpStructDeclaration, CsharpTypeNode } from "../ast/csharp-ast.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";

export function planValueTypeDeclaration(
  declarationNode: Node,
  valueType: ValueTypeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpStructDeclaration {
  const declaration = AsVariableDeclaration(declarationNode)!;
  return {
    kind: "struct",
    name: planIdentifierName(declaration.name, "AnonymousValueType", diagnostics, "Value type name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(declarationNode, sourceFile, input, diagnostics),
    members: (valueType.fields ?? []).map((field): CsharpFieldDeclaration => ({
      kind: "field",
      name: field.name,
      modifiers: field.readonly === true ? ["public", "readonly"] : ["public"],
      type: isNode(field.type)
        ? getCsharpTypeForNode(field.type, sourceFile, input, undefined, diagnostics)
        : unsupportedFieldType(field.type, declarationNode, diagnostics),
    })),
  };
}

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly Kind?: unknown }).Kind === "number";
}

function unsupportedFieldType(
  _value: unknown,
  declarationNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  diagnostics.push(unsupportedNodeDiagnostic(declarationNode, "Value-type fields must carry AST type subjects from finalized TSTS source facts."));
  return invalidCsharpType("value-type field fact type subject");
}
