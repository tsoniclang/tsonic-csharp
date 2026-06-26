import {
  AsClassDeclaration,
  AsExpressionStatement,
  HasSourceKind,
  KindConstructor,
  KindExpressionStatement,
  KindFunctionDeclaration,
  KindGetAccessor,
  KindMethodDeclaration,
  KindMethodSignature,
  KindParameter,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindSetAccessor,
  Node_Symbol,
  SourceKind,
  isAstNode,
} from "./source-ast.js";
import type { AttributeFact, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpAttribute, CsharpAttributeTargetSpecifier } from "../roslyn/syntax.js";
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
  return attributeFacts.flatMap((attributeFact) => {
    const attribute = planAttribute(attributeFact, sourceFile, input, diagnostics);
    return attribute === undefined ? [] : [attribute];
  });
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

export function diagnoseUnresolvedAttributeApplications(
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  const reported = new Set<AttributeFact>();
  for (const attribute of collectAttributeApplicationFactsForSourceFile(sourceFile, input)) {
    if (reported.has(attribute)) {
      continue;
    }
    reported.add(attribute);
    const resolution = resolveAttributeApplication(attribute, sourceFile, input);
    if (resolution.applicationTarget === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "must carry an AST application target from finalized TSTS facts before C# emission."));
      continue;
    }
    if (resolution.selectedDeclaration === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "target must resolve to a project source declaration from finalized TSTS facts before C# emission."));
      continue;
    }
    if (attribute.applicationPlacement === "constructor" && resolution.declaration === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "requires an explicit source constructor declaration; implicit default constructors have no finalized source declaration to attach attributes to."));
      continue;
    }
    if (attribute.applicationParameterName !== undefined && resolution.parameter === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, `could not find parameter '${attribute.applicationParameterName}' on the finalized source declaration target.`));
    }
  }
}

function planAttribute(
  attribute: AttributeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute | undefined {
  const targetSpecifier = planAttributeTargetSpecifier(attribute, sourceFile, input, diagnostics);
  const arguments_ = planAttributeArguments(attribute, sourceFile, input, diagnostics);
  if (arguments_ === undefined) {
    return undefined;
  }
  return {
    ...(targetSpecifier === undefined ? {} : { targetSpecifier }),
    type: isAstNode(attribute.target)
      ? expressionToCsharpType(attribute.target, sourceFile, input, diagnostics)
      : unsupportedAttributeTarget(attribute, diagnostics),
    arguments: arguments_,
  };
}

function planAttributeArguments(
  attribute: AttributeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpArgument[] | undefined {
  const arguments_: CsharpArgument[] = [];
  for (const argument of attribute.arguments ?? []) {
    if (!isAstNode(argument)) {
      unsupportedAttributeArgument(attribute, diagnostics);
      return undefined;
    }
    const expression = planExpression(argument, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    arguments_.push({ kind: "Argument", expression });
  }
  return arguments_;
}

function planAttributeTargetSpecifier(
  attribute: AttributeFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpAttributeTargetSpecifier | undefined {
  const specifier = attribute.applicationTargetSpecifier;
  if (specifier === undefined) {
    return undefined;
  }
  const csharpSpecifier = csharpAttributeTargetSpecifier(specifier);
  if (csharpSpecifier === undefined) {
    diagnostics.push(attributeApplicationDiagnostic(attribute, `uses unsupported explicit target specifier '${specifier}'. Supported C# attribute target specifiers are 'field', 'property', 'param', and 'return'.`));
    return undefined;
  }
  const resolution = resolveAttributeApplication(attribute, sourceFile, input);
  const subject = attribute.applicationParameterName === undefined ? resolution.declaration : resolution.parameter;
  if (!attributeTargetSpecifierSupportsSubject(csharpSpecifier, subject, input)) {
    diagnostics.push(attributeApplicationDiagnostic(attribute, `uses explicit target specifier '${specifier}' on ${attributeSubjectDescription(subject, input)}, which is outside the finalized C# attribute placement surface.`));
    return undefined;
  }
  return csharpSpecifier;
}

function csharpAttributeTargetSpecifier(specifier: string): CsharpAttributeTargetSpecifier | undefined {
  switch (specifier) {
    case "field":
    case "property":
    case "param":
    case "return":
      return specifier;
    default:
      return undefined;
  }
}

function attributeTargetSpecifierSupportsSubject(
  specifier: CsharpAttributeTargetSpecifier,
  subject: Node | undefined,
  input: TargetCompileInput,
): boolean {
  const kind = SourceKind(input.ast, subject);
  switch (specifier) {
    case "field":
      return kind === KindPropertyDeclaration;
    case "property":
      return kind === KindPropertyDeclaration || kind === KindGetAccessor || kind === KindSetAccessor || kind === KindPropertySignature;
    case "param":
      return kind === KindParameter;
    case "return":
      return kind === KindMethodDeclaration || kind === KindFunctionDeclaration || kind === KindMethodSignature;
  }
  return false;
}

function attributeSubjectDescription(
  subject: Node | undefined,
  input: TargetCompileInput,
): string {
  return subject === undefined ? "an unresolved source declaration" : input.ast.kindName(subject);
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
): void {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute '${attribute.attributeName}' argument must carry an AST expression subject from finalized TSTS facts.`,
  });
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
    facts.push(...collectAttributeApplicationFactsForSourceFile(sourceFile, input));
  }
  return facts;
}

function collectAttributeApplicationFactsForSourceFile(
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly AttributeFact[] {
  const facts: AttributeFact[] = [];
  visitSourceNode(input, sourceFile, (node) => {
    const fact = input.facts.getAttributeFact(node);
    if (fact?.applicationTarget !== undefined) {
      facts.push(fact);
    }
  });
  return facts;
}

function attributeApplicationTargetsSubject(
  attribute: AttributeFact,
  subject: Node,
  contextSourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const resolution = resolveAttributeApplication(attribute, contextSourceFile, input);
  if (attribute.applicationParameterName === undefined) {
    return resolution.declaration === subject;
  }
  return resolution.parameter === subject;
}

interface AttributeApplicationResolution {
  readonly applicationTarget?: Node;
  readonly selectedDeclaration?: Node;
  readonly declaration?: Node;
  readonly parameter?: Node;
}

function resolveAttributeApplication(
  attribute: AttributeFact,
  contextSourceFile: SourceFile,
  input: TargetCompileInput,
): AttributeApplicationResolution {
  const applicationTarget = isAstNode(attribute.applicationTarget) ? attribute.applicationTarget : undefined;
  if (applicationTarget === undefined) {
    return {};
  }
  const applicationSourceFile = input.ast.getSourceFile(applicationTarget) ?? contextSourceFile;
  const selectedDeclaration = input.analysis.getProjectSourceReferenceForNode(applicationTarget, { sourceFile: applicationSourceFile })?.declaration ??
    input.analysis.getProjectSourceDeclarationForNode(applicationTarget, { sourceFile: applicationSourceFile });
  if (attribute.applicationPlacement === "constructor") {
    const constructor = SourceKind(input.ast, selectedDeclaration) === KindConstructor
      ? selectedDeclaration
      : findConstructorDeclaration(selectedDeclaration, input);
    const parameter = attribute.applicationParameterName === undefined
      ? undefined
      : findParameter(constructor, attribute.applicationParameterName, input);
    return {
      applicationTarget,
      ...(selectedDeclaration === undefined ? {} : { selectedDeclaration }),
      ...(constructor === undefined ? {} : { declaration: constructor }),
      ...(parameter === undefined ? {} : { parameter }),
    };
  }
  const parameter = attribute.applicationParameterName === undefined
    ? undefined
    : findParameter(selectedDeclaration, attribute.applicationParameterName, input);
  return {
    applicationTarget,
    ...(selectedDeclaration === undefined ? {} : { selectedDeclaration, declaration: selectedDeclaration }),
    ...(parameter === undefined ? {} : { parameter }),
  };
}

function findConstructorDeclaration(
  declaration: Node | undefined,
  input: TargetCompileInput,
): Node | undefined {
  const classDeclaration = AsClassDeclaration(declaration);
  return classDeclaration?.Members?.Nodes
    ?.find((candidate): candidate is Node => candidate !== undefined && SourceKind(input.ast, candidate) === KindConstructor);
}

function findParameter(
  declaration: Node | undefined,
  parameterName: string,
  input: TargetCompileInput,
): Node | undefined {
  return input.ast.parameters(declaration)
    .find((candidate): candidate is Node =>
      candidate !== undefined && input.ast.text(input.ast.name(candidate)) === parameterName);
}

function attributeApplicationDiagnostic(
  attribute: AttributeFact,
  message: string,
): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute application '${attribute.attributeName}' ${message}`,
  };
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
