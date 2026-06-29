import type {
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type {
  CsharpTargetIterationFact,
} from "../../source/csharp-facts.js";
import {
  csharpTargetIterationFactKey,
} from "../../source/csharp-facts.js";
import {
  asTargetTypeRef,
} from "../../source/fact-subjects.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function targetTypeRefFromFactSubject(subject: CsharpTargetIterationFact["elementType"]): TargetTypeRef | undefined {
  return asTargetTypeRef(subject);
}

export function getRequiredCsharpTargetIterationFact(
  input: TargetCompileInput,
  statementNode: Node,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetIterationFact | undefined {
  const selectedIteration = input.facts.getFact(statementNode, csharpTargetIterationFactKey);
  if (selectedIteration === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${purpose} requires finalized TSTS/provider iteration facts before C# emission.`));
    return undefined;
  }
  return selectedIteration;
}

export function csharpTypeFromIterationElementFact(
  selectedIteration: CsharpTargetIterationFact,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
  purpose: string,
  elementDescription = "element",
): CsharpTypeNode | undefined {
  const targetElementType = selectedIteration.elementType === undefined
    ? undefined
    : targetTypeRefFromFactSubject(selectedIteration.elementType);
  const elementType = targetElementType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetElementType);
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `${purpose} requires a provider iteration fact with a closed target ${elementDescription} type.`));
    return undefined;
  }
  return elementType;
}
