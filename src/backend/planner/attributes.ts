import { AsExpressionStatement, KindExpressionStatement, Node_Symbol } from "@tsonic/tsts";
import type { AttributeApplicationFact, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpAttribute } from "../ast/csharp-ast.js";
import { expressionToCsharpType } from "./csharp-types.js";
import { planExpression } from "./expressions.js";

export function planAttributesForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpAttribute[] | undefined {
  const attributeFact = input.facts.getAttributeFact(subject) ?? input.facts.getAttributeFact(Node_Symbol(subject));
  if (attributeFact === undefined || attributeFact.attributes.length === 0) {
    return undefined;
  }
  return attributeFact.attributes.map((attribute) =>
    planAttribute(attribute, sourceFile, input, diagnostics));
}

export function isErasedAttributeExpressionStatement(
  statement: Node,
  input: TargetCompileInput,
): boolean {
  if (statement.Kind !== KindExpressionStatement) {
    return false;
  }
  const expression = AsExpressionStatement(statement)?.Expression;
  const marker = input.facts.getSourceMarkerFact(expression);
  return marker?.erasedRuntimeExpression === true;
}

function planAttribute(
  attribute: AttributeApplicationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute {
  return {
    type: isNode(attribute.target)
      ? expressionToCsharpType(attribute.target, sourceFile, input, diagnostics)
      : unsupportedAttributeTarget(attribute, diagnostics),
    arguments: (attribute.arguments ?? []).map((argument): CsharpArgument => ({
      expression: isNode(argument)
        ? planExpression(argument, sourceFile, input, diagnostics)
        : unsupportedAttributeArgument(attribute, diagnostics),
    })),
  };
}

function unsupportedAttributeTarget(
  attribute: AttributeApplicationFact,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute["type"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute target '${attribute.attributeName}' must carry an AST type or value subject from finalized TSTS facts.`,
  });
  return { kind: "invalid", reason: "unsupported attribute target" };
}

function unsupportedAttributeArgument(
  attribute: AttributeApplicationFact,
  diagnostics: TargetDiagnostic[],
): CsharpArgument["expression"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute '${attribute.attributeName}' argument must carry an AST expression subject from finalized TSTS facts.`,
  });
  return { kind: "invalid", reason: "unsupported attribute argument" };
}

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly Kind?: unknown }).Kind === "number";
}
