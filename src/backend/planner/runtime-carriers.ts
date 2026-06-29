import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCarrierResolution, TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export function getRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function resolveRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetCarrierResolution | undefined {
  return sourceNode === undefined
    ? undefined
    : input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile });
}

export function getTargetTypeRefForNode(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  const typeReferenceFact = getTargetTypeRefFromTypeReferenceName(input, sourceNode, sourceFile);
  if (input.ast.kindName(sourceNode) === "KindTypeReference") {
      return getTargetTypeRefFromDirectFacts(input, sourceNode) ??
      probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile })) ??
      typeReferenceFact;
  }
  return typeReferenceFact ??
    getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    getTargetTypeRefFromDirectFacts(input, input.analysis.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.analysis.getResolvedSymbol(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromSymbolDeclarations(input, sourceNode, sourceFile) ??
    probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile }));
}

function getTargetTypeRefFromSymbolDeclarations(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const symbols = [
    input.analysis.getSymbolAtLocation(sourceNode, { sourceFile }),
    input.analysis.getResolvedSymbol(sourceNode, { sourceFile }),
  ];
  for (const symbol of symbols) {
    for (const declaration of input.analysis.getSymbolDeclarations(symbol)) {
      const declarationFact = getTargetTypeRefFromDirectFacts(input, declaration);
      if (declarationFact !== undefined) {
        return declarationFact;
      }
      const declarationName = asNodeSubject(getNodeField(declaration, "name"));
      const declarationNameFact = getTargetTypeRefFromDirectFacts(input, declarationName);
      if (declarationNameFact !== undefined) {
        return declarationNameFact;
      }
    }
  }
  return undefined;
}

function getTargetTypeRefFromTypeReferenceName(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (input.ast.kindName(sourceNode) !== "KindTypeReference") {
    return undefined;
  }
  const typeName = asNodeSubject(getNodeField(sourceNode, "TypeName"));
  return typeName === undefined
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, typeName, { includeRuntimeCarrier: false }) ??
      getTargetTypeRefFromDirectFacts(input, input.analysis.getSymbolAtLocation(typeName, { sourceFile }), { includeRuntimeCarrier: false }) ??
      getTargetTypeRefFromDirectFacts(input, input.analysis.getResolvedSymbol(typeName, { sourceFile }), { includeRuntimeCarrier: false });
}

function getNodeField(node: Node, field: string): unknown {
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}

export function getTargetTypeRefForType(
  input: TargetCompileInput,
  type: Type | undefined,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type> = new Set(),
): TargetTypeRef | undefined {
  void sourceFile;
  void seen;
  return type === undefined
    ? undefined
    : getTargetTypeRefFromSemanticTypeFacts(input, type) ??
      getTargetTypeRefFromSemanticTypeFacts(input, input.analysis.getTypeSymbol(type));
}

function getTargetTypeRefFromSemanticTypeFacts(
  input: TargetCompileInput,
  subject: Type | Type["symbol"] | undefined,
): TargetTypeRef | undefined {
  const fact = getTargetTypeRefFromDirectFacts(input, subject);
  return fact === undefined || targetTypeRefContainsSourcePrimitive(fact)
    ? undefined
    : fact;
}

export function probeCarrierFromResolution(
  resolution: TargetCarrierResolution | undefined,
): TargetTypeRef | undefined {
  return resolution?.kind === "resolved" ? resolution.carrier : undefined;
}

export interface MissingCarrierDiagnosticDetail {
  readonly reason: string;
  readonly evidence: readonly string[];
}

export function missingCarrierDiagnosticDetail(
  resolution: TargetCarrierResolution | undefined,
  defaultReason: string,
): MissingCarrierDiagnosticDetail {
  if (resolution?.kind !== "missing") {
    return { reason: defaultReason, evidence: [] };
  }
  return {
    reason: resolution.reason,
    evidence: resolution.evidence.map((entry) => entry.message),
  };
}

export function pushMissingCarrierDiagnostic(
  diagnostics: TargetDiagnostic[],
  node: Node,
  message: string,
  resolution: TargetCarrierResolution | undefined,
  defaultReason: string,
): void {
  const detail = missingCarrierDiagnosticDetail(resolution, defaultReason);
  diagnostics.push(unsupportedNodeDiagnostic(node, `${message} ${detail.reason}`, detail.evidence));
}
