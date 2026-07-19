import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCarrierResolution, TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
import {
  csharpStringTargetType,
  csharpTargetTypeFromBinding,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";
import {
  sourceLocationEvidence,
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getDirectTargetBindingForReference,
} from "./provider-reference-facts.js";

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
  if (sourceNode === undefined) {
    return undefined;
  }
  const carrier = getTargetTypeRefForNode(input, sourceNode, sourceFile);
  const targetResolution = carrier === undefined
    ? input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile })
    : undefined;
  if (targetResolution?.kind === "missing") {
    return targetResolution;
  }
  return carrier === undefined
    ? {
        kind: "missing",
        reason: "C# runtime carrier is missing; no finalized C# carrier, operation, source-profile, or provider fact owns this expression.",
        evidence: [{ message: "C# emission does not consume the canonical TSTS runtime-carrier fact as an enriched C# output fallback.", subject: sourceNode }],
      }
    : {
        kind: "resolved",
        carrier,
        evidence: [{ message: "C# runtime carrier resolved from finalized C# target-owned facts.", subject: sourceNode }],
      };
}

export function getTargetTypeRefForNode(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  const intrinsicLiteralType = getIntrinsicLiteralTargetType(input, sourceNode);
  const typeReferenceFact = getTargetTypeRefFromTypeReferenceName(input, sourceNode);
  if (input.ast.kindName(sourceNode) === "KindTypeReference") {
    return getTargetTypeRefFromTargetBindingForReference(input, sourceNode, sourceFile) ??
      getTargetTypeRefFromDirectFacts(input, sourceNode) ??
      typeReferenceFact ??
      probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile }));
  }
  const finalizedOperationResult = input.facts.getFact(sourceNode, csharpTargetOperationFactKey)?.resultType;
  return typeReferenceFact ??
    finalizedOperationResult ??
    getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    intrinsicLiteralType ??
    probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(sourceNode, { sourceFile }));
}

function getIntrinsicLiteralTargetType(
  input: TargetCompileInput,
  sourceNode: Node,
): TargetTypeRef | undefined {
  return input.ast.is.IsStringLiteral(sourceNode) ||
    input.ast.is.IsNoSubstitutionTemplateLiteral(sourceNode) ||
    input.ast.is.IsTemplateExpression(sourceNode)
    ? csharpStringTargetType()
    : undefined;
}

function getTargetTypeRefFromTargetBindingForReference(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const binding = getDirectTargetBindingForReference(input, sourceNode);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(sourceNode)
    .map((argument) => getTargetTypeRefForNode(input, argument, sourceFile));
  return typeArguments.some((argument) => argument === undefined)
    ? undefined
    : csharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[]);
}

function getTargetTypeRefFromTypeReferenceName(
  input: TargetCompileInput,
  sourceNode: Node,
): TargetTypeRef | undefined {
  if (input.ast.kindName(sourceNode) !== "KindTypeReference") {
    return undefined;
  }
  const typeName = asNodeSubject(getNodeField(sourceNode, "TypeName"));
  return typeName === undefined
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, typeName, { includeRuntimeCarrier: false });
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
    : getTargetTypeRefFromSemanticTypeFacts(input, type);
}

function getTargetTypeRefFromSemanticTypeFacts(
  input: TargetCompileInput,
  subject: Type,
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
    evidence: resolution.evidence.flatMap((entry) => [
      entry.message,
      ...sourceLocationEvidence(asNodeSubject(entry.subject)),
    ]),
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
