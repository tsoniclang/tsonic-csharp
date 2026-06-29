import {
  AsExpressionStatement,
  HasSourceKind,
  KindExpressionStatement,
  KindFunctionDeclaration,
  KindGetAccessor,
  KindMethodDeclaration,
  KindMethodSignature,
  KindParameter,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindSetAccessor,
  SourceKind,
  isAstNode,
} from "../source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpAttribute, CsharpAttributeTargetSpecifier } from "../../roslyn/syntax.js";
import type {
  CsharpAttributeApplicationFact,
} from "../../../source/csharp-facts.js";
import { expressionToCsharpType } from "../csharp-types.js";
import { planExpression } from "../expressions.js";
import {
  collectAttributeFactsForSubject,
} from "./collection.js";
import {
  attributeApplicationDiagnostic,
  unsupportedAttributeArgument,
  unsupportedAttributeTarget,
} from "./diagnostics.js";
import {
  attributeSubjectDescription,
  resolveAttributeApplication,
} from "./resolution.js";

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

function planAttribute(
  attribute: CsharpAttributeApplicationFact,
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
    type: isAstNode(attribute.attributeType)
      ? expressionToCsharpType(attribute.attributeType, sourceFile, input, diagnostics)
      : unsupportedAttributeTarget(attribute, diagnostics),
    arguments: arguments_,
  };
}

function planAttributeArguments(
  attribute: CsharpAttributeApplicationFact,
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
  attribute: CsharpAttributeApplicationFact,
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
