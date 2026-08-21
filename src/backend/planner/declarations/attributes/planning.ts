import type { CsharpPlanningContext } from "../../context.js";
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
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpAttribute, CsharpAttributeTargetSpecifier } from "../../../target-ast/roslyn/index.js";
import type {
  CsharpAttributeApplication,
} from "../../../../analysis/attributes/application-index.js";
import { expressionToCsharpType } from "../../types/index.js";
import { planExpression } from "../../expressions/index.js";
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
  input: CsharpPlanningContext,
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
  input: CsharpPlanningContext,
): boolean {
  if (!HasSourceKind(input.program.source.ast, statement, KindExpressionStatement)) {
    return false;
  }
  const expression = AsExpressionStatement(input.program.source.ast, statement)?.Expression;
  return expression !== undefined &&
    input.program.attributeApplications.forSubject(expression) !== undefined;
}

function planAttribute(
  attribute: CsharpAttributeApplication,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute | undefined {
  if (!attributeApplicationMemberKindIsValid(attribute, sourceFile, input, diagnostics)) {
    return undefined;
  }
  const targetSpecifier = planAttributeTargetSpecifier(attribute, sourceFile, input, diagnostics);
  const arguments_ = planAttributeArguments(attribute, sourceFile, input, diagnostics);
  if (arguments_ === undefined) {
    return undefined;
  }
  return {
    ...(targetSpecifier === undefined ? {} : { targetSpecifier }),
    type: isAstNode(input.program.source.ast, attribute.attributeType)
      ? expressionToCsharpType(attribute.attributeType, sourceFile, input, diagnostics)
      : unsupportedAttributeTarget(attribute, diagnostics),
    arguments: arguments_,
  };
}

function attributeApplicationMemberKindIsValid(
  attribute: CsharpAttributeApplication,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): boolean {
  const memberKind = attribute.applicationMemberKind;
  if (memberKind === undefined) {
    return true;
  }
  const declaration = resolveAttributeApplication(attribute, sourceFile, input).selectedDeclaration;
  const kind = SourceKind(input.program.source.ast, declaration);
  const valid = memberKind === "property"
    ? kind === KindPropertyDeclaration || kind === KindPropertySignature || kind === KindGetAccessor || kind === KindSetAccessor
    : kind === KindMethodDeclaration || kind === KindMethodSignature || kind === KindFunctionDeclaration;
  if (!valid) {
    diagnostics.push(attributeApplicationDiagnostic(
      attribute,
      `uses a ${memberKind} selector whose exact selected declaration is ${attributeSubjectDescription(declaration, input)}.`,
    ));
  }
  return valid;
}

function planAttributeArguments(
  attribute: CsharpAttributeApplication,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpArgument[] | undefined {
  const arguments_: CsharpArgument[] = [];
  for (const argument of attribute.arguments ?? []) {
    if (!isAstNode(input.program.source.ast, argument)) {
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
  attribute: CsharpAttributeApplication,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  input: CsharpPlanningContext,
): boolean {
  const kind = SourceKind(input.program.source.ast, subject);
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
