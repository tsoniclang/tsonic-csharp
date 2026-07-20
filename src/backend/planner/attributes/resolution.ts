import {
  AsClassDeclaration,
  KindConstructor,
  SourceKind,
  isAstNode,
} from "../source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  csharpAttributeApplicationFactKey,
} from "../../../source/csharp-facts.js";
import type {
  CsharpAttributeApplicationFact,
} from "../../../source/csharp-facts.js";

export interface AttributeApplicationResolution {
  readonly applicationTarget?: Node;
  readonly selectedDeclaration?: Node;
  readonly declaration?: Node;
  readonly parameter?: Node;
}

export function resolveAttributeApplication(
  attribute: CsharpAttributeApplicationFact,
  contextSourceFile: SourceFile,
  input: TargetCompileInput,
): AttributeApplicationResolution {
  const applicationTarget = isAstNode(attribute.applicationTarget) ? attribute.applicationTarget : undefined;
  if (applicationTarget === undefined) {
    return {};
  }
  const applicationSourceFile = input.ast.getSourceFile(applicationTarget) ?? contextSourceFile;
  const selectedDeclaration = isAstNode(attribute.selectedMember)
    ? attribute.selectedMember
    : input.analysis.getProjectSourceReferenceForNode(applicationTarget, { sourceFile: applicationSourceFile })?.declaration ??
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

export function attributeSubjectDescription(
  subject: Node | undefined,
  input: TargetCompileInput,
): string {
  return subject === undefined ? "an unresolved source declaration" : input.ast.kindName(subject);
}

export function directAttributeFactAppliesToSubject(
  attribute: CsharpAttributeApplicationFact | undefined,
): attribute is CsharpAttributeApplicationFact {
  return attribute !== undefined;
}

export function attributeFactForNodeOrSymbol(
  subject: Node,
  input: TargetCompileInput,
): CsharpAttributeApplicationFact | undefined {
  return input.facts.getFact(subject, csharpAttributeApplicationFactKey);
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
