import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import {
  csharpArrayBoundaryFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpArrayBoundaryFact,
} from "../../source/csharp-facts.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";
import {
  getSymbolDeclarations,
} from "../../source/csharp-source-semantics/symbol-utils.js";

export function getArrayBoundaryCoreCarrierForExpression(
  input: TargetCompileInput,
  node: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getArrayBoundaryFactForExpression(input, node, sourceFile)?.coreCarrierType;
}

export function getArrayBoundaryFactForExpression(
  input: TargetCompileInput,
  node: Node | undefined,
  sourceFile: SourceFile,
): CsharpArrayBoundaryFact | undefined {
  for (const subject of arrayBoundaryFactSubjects(input, node, sourceFile)) {
    const fact = input.facts.getFact(subject, csharpArrayBoundaryFactKey);
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function arrayBoundaryFactSubjects(
  input: TargetCompileInput,
  node: Node | undefined,
  sourceFile: SourceFile,
): readonly ExtensionFactSubject[] {
  if (node === undefined) {
    return [];
  }
  const subjects: ExtensionFactSubject[] = [node];
  const directSymbol = input.analysis.getSymbolAtLocation(node, { sourceFile });
  const resolvedSymbol = input.analysis.getResolvedSymbol(node, { sourceFile });
  appendSubject(subjects, directSymbol);
  appendSubject(subjects, resolvedSymbol);
  for (const symbol of [directSymbol, resolvedSymbol]) {
    for (const declaration of getSymbolDeclarations(symbol)) {
      appendDeclarationSubjects(subjects, declaration);
    }
  }
  return subjects;
}

function appendDeclarationSubjects(
  subjects: ExtensionFactSubject[],
  declaration: Node,
): void {
  appendSubject(subjects, declaration);
  appendNodeFieldSubject(subjects, declaration, "name");
  appendNodeFieldSubject(subjects, declaration, "Name");
  appendNodeFieldSubject(subjects, declaration, "type");
  appendNodeFieldSubject(subjects, declaration, "Type");
}

function appendNodeFieldSubject(
  subjects: ExtensionFactSubject[],
  node: Node,
  field: string,
): void {
  appendSubject(subjects, asNodeSubject(Object.getOwnPropertyDescriptor(node, field)?.value));
}

function appendSubject(
  subjects: ExtensionFactSubject[],
  subject: ExtensionFactSubject | undefined,
): void {
  if (subject !== undefined && !subjects.includes(subject)) {
    subjects.push(subject);
  }
}
