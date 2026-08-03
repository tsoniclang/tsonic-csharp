import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import {
  AsClassDeclaration,
  KindConstructor,
  SourceKind,
  isAstNode,
} from "../source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TsonicAttributeApplicationFact,
} from "@tsonic/source-core";
import {
  tsonicAttributeBuilderFactKey,
} from "@tsonic/source-core";

export interface AttributeApplicationResolution {
  readonly applicationTarget?: Node;
  readonly selectedDeclaration?: Node;
  readonly declaration?: Node;
  readonly parameter?: Node;
}

export function resolveAttributeApplication(
  attribute: TsonicAttributeApplicationFact,
  _contextSourceFile: SourceFile,
  input: CsharpTranslationContext,
): AttributeApplicationResolution {
  const applicationTarget = isAstNode(input.ast, attribute.applicationTarget) ? attribute.applicationTarget : undefined;
  if (applicationTarget === undefined) {
    return {};
  }
  const selectedDeclaration = isAstNode(input.ast, attribute.selectedMember)
    ? attribute.selectedMember
    : input.navigation.referenceFor(applicationTarget)?.declaration ??
      input.navigation.declarationFor(applicationTarget);
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

export function attributeSubjectDescription(
  subject: Node | undefined,
  input: CsharpTranslationContext,
): string {
  return subject === undefined ? "an unresolved source declaration" : input.ast.kindName(subject);
}

export function directAttributeFactAppliesToSubject(
  attribute: TsonicAttributeApplicationFact | undefined,
): attribute is TsonicAttributeApplicationFact {
  return attribute?.kind === "application";
}

export function attributeFactForNodeOrSymbol(
  subject: Node,
  input: CsharpTranslationContext,
): TsonicAttributeApplicationFact | undefined {
  const fact = input.sourceFacts?.getFact(subject, tsonicAttributeBuilderFactKey);
  return fact?.kind === "application" ? fact : undefined;
}

function findConstructorDeclaration(
  declaration: Node | undefined,
  input: CsharpTranslationContext,
): Node | undefined {
  const classDeclaration = AsClassDeclaration(declaration);
  return classDeclaration?.Members?.Nodes
    ?.find((candidate): candidate is Node => candidate !== undefined && SourceKind(input.ast, candidate) === KindConstructor);
}

function findParameter(
  declaration: Node | undefined,
  parameterName: string,
  input: CsharpTranslationContext,
): Node | undefined {
  return input.ast.parameters(declaration)
    .find((candidate): candidate is Node =>
      candidate !== undefined && input.ast.text(input.ast.name(candidate)) === parameterName);
}
