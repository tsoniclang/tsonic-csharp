import { AsExpressionStatement, HasSourceKind, KindExpressionStatement, Node_Symbol } from "./source-ast.js";
import type { AttributeFact, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpAttribute } from "../roslyn/syntax.js";
import { expressionToCsharpType } from "./csharp-types.js";
import { planExpression } from "./expressions.js";

export function planAttributesForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpAttribute[] | undefined {
  const attributeFacts = collectAttributeFactsForSubject(subject, sourceFile, input);
  if (attributeFacts.length === 0) {
    return undefined;
  }
  return attributeFacts.map((attributeFact) => planAttribute(attributeFact, sourceFile, input, diagnostics));
}

export function isErasedAttributeExpressionStatement(
  statement: Node,
  input: TargetCompileInput,
): boolean {
  if (!HasSourceKind(input.ast, statement, KindExpressionStatement)) {
    return false;
  }
  const expression = AsExpressionStatement(statement)?.Expression;
  return input.facts.getAttributeFact(expression) !== undefined;
}

function planAttribute(
  attribute: AttributeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute {
  return {
    type: isNode(attribute.target)
      ? expressionToCsharpType(attribute.target, sourceFile, input, diagnostics)
      : unsupportedAttributeTarget(attribute, diagnostics),
    arguments: (attribute.arguments ?? []).map((argument): CsharpArgument => ({
      kind: "Argument",
      expression: isNode(argument)
        ? planExpression(argument, sourceFile, input, diagnostics)
        : unsupportedAttributeArgument(attribute, diagnostics),
    })),
  };
}

function unsupportedAttributeTarget(
  attribute: AttributeFact,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute["type"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute target '${attribute.attributeName}' must carry an AST type or value subject from finalized TSTS facts.`,
  });
  return { kind: "InvalidType", reason: "unsupported attribute target" };
}

function unsupportedAttributeArgument(
  attribute: AttributeFact,
  diagnostics: TargetDiagnostic[],
): CsharpArgument["expression"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute '${attribute.attributeName}' argument must carry an AST expression subject from finalized TSTS facts.`,
  });
  return { kind: "InvalidExpression", reason: "unsupported attribute argument" };
}

function collectAttributeFactsForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly AttributeFact[] {
  if (subject === undefined) {
    return [];
  }
  const facts: AttributeFact[] = [];
  const direct = input.facts.getAttributeFact(subject) ?? input.facts.getAttributeFact(Node_Symbol(subject));
  if (direct !== undefined && direct.applicationTarget === undefined) {
    facts.push(direct);
  }
  for (const candidate of collectAttributeApplicationFacts(input)) {
    if (attributeApplicationTargetsSubject(candidate, subject, sourceFile, input)) {
      facts.push(candidate);
    }
  }
  return facts;
}

function collectAttributeApplicationFacts(input: TargetCompileInput): readonly AttributeFact[] {
  const facts: AttributeFact[] = [];
  for (const sourceFile of input.sourceFiles) {
    visitSourceNode(input, sourceFile, (node) => {
      const fact = input.facts.getAttributeFact(node);
      if (fact?.applicationTarget !== undefined) {
        facts.push(fact);
      }
    });
  }
  return facts;
}

function attributeApplicationTargetsSubject(
  attribute: AttributeFact,
  subject: Node,
  fallbackSourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const applicationTarget = isNode(attribute.applicationTarget) ? attribute.applicationTarget : undefined;
  if (applicationTarget === undefined) {
    return false;
  }
  const applicationSourceFile = input.ast.getSourceFile(applicationTarget) ?? fallbackSourceFile;
  const selectedDeclaration = input.semantics.getProjectSourceReferenceForNode(applicationTarget, { sourceFile: applicationSourceFile })?.declaration ??
    input.semantics.getProjectSourceDeclarationForNode(applicationTarget, { sourceFile: applicationSourceFile });
  if (attribute.applicationParameterName === undefined) {
    return selectedDeclaration === subject;
  }
  const parameter = selectedDeclaration === undefined
    ? undefined
    : input.ast.parameters(selectedDeclaration)
      .find((candidate): candidate is Node =>
        candidate !== undefined && input.ast.text(input.ast.name(candidate)) === attribute.applicationParameterName);
  return parameter === subject;
}

function visitSourceNode(
  input: TargetCompileInput,
  node: Node | undefined,
  visit: (node: Node) => void,
): void {
  if (node === undefined) {
    return;
  }
  visit(node);
  input.ast.forEachChild(node, (child) => visitSourceNode(input, child, visit));
}

function isNode(value: unknown): value is Node {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly Kind?: unknown }).Kind === "number";
}
