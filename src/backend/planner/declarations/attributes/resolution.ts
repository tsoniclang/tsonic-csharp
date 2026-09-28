import type { CsharpPlanningContext } from "../../context.js";
import {
  AsClassDeclaration,
  KindConstructor,
  SourceKind,
  isAstNode,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TsonicAttributeApplicationFact,
} from "@tsonic/source-core/facts";

export interface AttributeApplicationResolution {
  readonly applicationTarget?: Node;
  readonly selectedDeclaration?: Node;
  readonly declaration?: Node;
  readonly parameter?: Node;
}

export function resolveAttributeApplication(
  attribute: TsonicAttributeApplicationFact,
  _contextSourceFile: SourceFile,
  input: CsharpPlanningContext,
): AttributeApplicationResolution {
  const applicationTarget = isAstNode(input.program.source.ast, attribute.applicationTarget) ? attribute.applicationTarget : undefined;
  if (applicationTarget === undefined) {
    return {};
  }
  const selectedDeclaration = isAstNode(input.program.source.ast, attribute.selectedMember)
    ? attribute.selectedMember
    : input.program.sourceNavigation.referenceFor(applicationTarget)?.declaration ??
      input.program.sourceNavigation.declarationFor(applicationTarget);
  if (attribute.applicationPlacement === "constructor") {
    const constructor = SourceKind(input.program.source.ast, selectedDeclaration) === KindConstructor
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

export function attributeSubjectDescription(
  subject: Node | undefined,
  input: CsharpPlanningContext,
): string {
  return subject === undefined ? "an unresolved source declaration" : input.program.source.ast.kindName(subject);
}

export function directAttributeFactAppliesToSubject(
  attribute: TsonicAttributeApplicationFact | undefined,
): attribute is TsonicAttributeApplicationFact {
  return attribute?.kind === "application";
}

export function attributeFactForNodeOrSymbol(
  subject: Node,
  input: CsharpPlanningContext,
): TsonicAttributeApplicationFact | undefined {
  const operation = input.program.attributeApplications.forSubject(subject);
  return operation?.kind === "application"
    ? operation
    : undefined;
}

function findConstructorDeclaration(
  declaration: Node | undefined,
  input: CsharpPlanningContext,
): Node | undefined {
  const classDeclaration = AsClassDeclaration(input.program.source.ast, declaration);
  return classDeclaration?.Members?.Nodes
    ?.find((candidate): candidate is Node => candidate !== undefined && SourceKind(input.program.source.ast, candidate) === KindConstructor);
}

function findParameter(
  declaration: Node | undefined,
  parameterName: string,
  input: CsharpPlanningContext,
): Node | undefined {
  return input.program.source.ast.parameters(declaration)
    .find((candidate): candidate is Node =>
      candidate !== undefined && input.program.source.ast.text(input.program.source.ast.name(candidate)) === parameterName);
}
