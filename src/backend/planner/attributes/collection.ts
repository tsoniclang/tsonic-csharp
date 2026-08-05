import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import {
  type TsonicAttributeApplicationFact,
} from "@tsonic/source-core";
import {
  attributeFactForNodeOrSymbol,
  directAttributeFactAppliesToSubject,
  resolveAttributeApplication,
} from "./resolution.js";

export function collectAttributeFactsForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): readonly TsonicAttributeApplicationFact[] {
  if (subject === undefined) {
    return [];
  }
  const facts: TsonicAttributeApplicationFact[] = [];
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

export function collectAttributeApplicationFacts(input: CsharpTranslationContext): readonly TsonicAttributeApplicationFact[] {
  return input.attributeApplications.all;
}

export function collectAttributeApplicationFactsForSourceFile(
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): readonly TsonicAttributeApplicationFact[] {
  return input.attributeApplications.forSourceFile(sourceFile);
}

function attributeApplicationTargetsSubject(
  attribute: TsonicAttributeApplicationFact,
  subject: Node,
  contextSourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const resolution = resolveAttributeApplication(attribute, contextSourceFile, input);
  if (attribute.applicationParameterName === undefined) {
    return resolution.declaration === subject;
  }
  return resolution.parameter === subject;
}
