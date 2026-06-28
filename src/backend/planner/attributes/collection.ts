import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  csharpAttributeApplicationFactKey,
} from "../../../source/csharp-facts.js";
import type {
  CsharpAttributeApplicationFact,
} from "../../../source/csharp-facts.js";
import {
  attributeFactForNodeOrSymbol,
  directAttributeFactAppliesToSubject,
  resolveAttributeApplication,
} from "./resolution.js";

export function collectAttributeFactsForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly CsharpAttributeApplicationFact[] {
  if (subject === undefined) {
    return [];
  }
  const facts: CsharpAttributeApplicationFact[] = [];
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

export function collectAttributeApplicationFacts(input: TargetCompileInput): readonly CsharpAttributeApplicationFact[] {
  const facts: CsharpAttributeApplicationFact[] = [];
  for (const sourceFile of input.sourceFiles) {
    facts.push(...collectAttributeApplicationFactsForSourceFile(sourceFile, input));
  }
  return facts;
}

export function collectAttributeApplicationFactsForSourceFile(
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly CsharpAttributeApplicationFact[] {
  const facts: CsharpAttributeApplicationFact[] = [];
  visitSourceNode(input, sourceFile, (node) => {
    const fact = input.facts.getFact(node, csharpAttributeApplicationFactKey);
    if (fact !== undefined) {
      facts.push(fact);
    }
  });
  return facts;
}

function attributeApplicationTargetsSubject(
  attribute: CsharpAttributeApplicationFact,
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
