import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  CsharpAttributeApplication,
} from "../../../../analysis/attributes/application-index.js";
import {
  attributeFactForNodeOrSymbol,
  directAttributeFactAppliesToSubject,
  resolveAttributeApplication,
} from "./resolution.js";

export function collectAttributeFactsForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): readonly CsharpAttributeApplication[] {
  if (subject === undefined) {
    return [];
  }
  const facts: CsharpAttributeApplication[] = [];
  const direct = attributeFactForNodeOrSymbol(subject, input);
  if (directAttributeFactAppliesToSubject(direct)) {
    facts.push(direct);
  }
  for (const candidate of collectAttributeApplicationFacts(input)) {
    if (attributeApplicationTargetsSubject(candidate, subject, sourceFile, input)) {
      facts.push(candidate);
    }
  }
  return facts;
}

export function collectAttributeApplicationFacts(input: CsharpPlanningContext): readonly CsharpAttributeApplication[] {
  return input.program.attributeApplications.all;
}

export function collectAttributeApplicationFactsForSourceFile(
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): readonly CsharpAttributeApplication[] {
  return input.program.attributeApplications.forSourceFile(sourceFile);
}

function attributeApplicationTargetsSubject(
  attribute: CsharpAttributeApplication,
  subject: Node,
  contextSourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  const resolution = resolveAttributeApplication(attribute, contextSourceFile, input);
  if (attribute.applicationParameterName === undefined) {
    return resolution.declaration === subject;
  }
  return resolution.parameter === subject;
}
