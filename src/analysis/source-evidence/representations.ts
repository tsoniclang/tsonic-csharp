import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  SourceApplication,
  SourceArgumentPlace,
  SourceDeclaredSlot,
  SourceProgramFacts,
  SourceRefusal,
  SourceSignatureIdentity,
  SourceTypeDescriptorSignature,
  SourceTypeEvidence,
} from "@tsonic/target-api/source";
import type {
  CsharpRepresentationOutcome,
  CsharpRepresentationPosition,
  CsharpRepresentationView,
  CsharpRepresentedType,
} from "../../target-model/types/representation.js";

export interface CsharpSourceRepresentationQueries {
  readonly facts: SourceProgramFacts;
  readonly representation: CsharpRepresentationView;
}

export interface CsharpRepresentedArgument {
  readonly source: SourceArgumentPlace;
  readonly value: CsharpRepresentedType;
  readonly destination: CsharpRepresentedType;
}

export interface CsharpRepresentedApplication {
  readonly source: SourceApplication;
  readonly callee: { readonly occurrence: Node; readonly value: CsharpRepresentedType };
  readonly sourceArguments: readonly {
    readonly source: SourceApplication["sourceArguments"][number];
    readonly value: CsharpRepresentedType;
  }[];
  readonly classBindings: readonly { readonly declaration: Node; readonly value: CsharpRepresentedType }[];
  readonly signatureBindings: readonly { readonly declaration: Node; readonly value: CsharpRepresentedType }[];
  readonly receiver:
    | Extract<SourceApplication["receiver"], { readonly kind: "none" | "type" }>
    | { readonly kind: "value"; readonly occurrence: Node; readonly value: CsharpRepresentedType };
  readonly arguments: readonly CsharpRepresentedArgument[];
  readonly result: CsharpRepresentedType;
}

export function forwardSourceRefusal(refusal: SourceRefusal): TargetDiagnostic {
  return Object.freeze({
    code: refusal.code,
    category: "error",
    source: refusal.source,
    sourceNode: refusal.site,
    message: refusal.message,
  });
}

export function csharpRepresentationDiagnostic(
  outcome: Exclude<CsharpRepresentationOutcome<unknown>, { readonly kind: "represented" }>,
): TargetDiagnostic {
  return outcome.kind === "source-refused" ? forwardSourceRefusal(outcome.refusal) : Object.freeze({
    code: outcome.code,
    category: "error",
    source: outcome.source,
    sourceNode: outcome.site,
    message: outcome.message,
  });
}

export function representCsharpValue(
  host: CsharpSourceRepresentationQueries,
  occurrence: Node,
): CsharpRepresentationOutcome<CsharpRepresentedType> {
  const value = host.facts.values.type(occurrence);
  return value.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: value })
    : host.representation.represent(value.value, "value", occurrence);
}

export function representCsharpDeclaredSlot(
  host: CsharpSourceRepresentationQueries,
  declaration: Node,
): CsharpRepresentationOutcome<{ readonly source: SourceDeclaredSlot; readonly value: CsharpRepresentedType }> {
  const slot = host.facts.values.declaredSlot(declaration);
  if (slot.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: slot });
  const value = host.representation.represent(slot.value.type, "storage", declaration);
  return value.kind === "represented" ? Object.freeze({ kind: "represented",
    value: Object.freeze({ source: slot.value, value: value.value }) }) : value;
}

export function representCsharpCallableReturn(
  host: CsharpSourceRepresentationQueries,
  signature: SourceSignatureIdentity,
  site: Node,
): CsharpRepresentationOutcome<CsharpRepresentedType> {
  const returned = host.facts.values.callableReturn(signature);
  return returned.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: returned })
    : host.representation.represent(returned.value, "return", site);
}

export function representCsharpApplication(
  host: CsharpSourceRepresentationQueries,
  occurrence: Node,
): CsharpRepresentationOutcome<CsharpRepresentedApplication> {
  const publication = host.facts.applications.application(occurrence);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const source = publication.value;
  if (source.identity.invocation !== occurrence) failTargetAnalysisInvariant("tsonic-csharp",
    "An application must retain its exact original invocation occurrence.", occurrence);
  const represent = (value: SourceTypeEvidence, position: CsharpRepresentationPosition) =>
    host.representation.represent(value, position, occurrence);
  const callee = host.representation.represent(source.callee.value, "value", source.callee.occurrence);
  if (callee.kind !== "represented") return callee;
  const classBindings: CsharpRepresentedApplication["classBindings"][number][] = [];
  const signatureBindings: CsharpRepresentedApplication["signatureBindings"][number][] = [];
  const declarations = new Set<Node>();
  for (const [bindings, destination] of [
    [source.identity.classBindings, classBindings],
    [source.identity.signatureBindings, signatureBindings],
  ] as const) {
    for (const binding of bindings) {
      if (declarations.has(binding.declaration)) failTargetAnalysisInvariant("tsonic-csharp",
        "A complete application binds each original class or signature parameter once.", occurrence);
      declarations.add(binding.declaration);
      const value = represent(binding.value, "type-argument");
      if (value.kind !== "represented") return value;
      destination.push(Object.freeze({ declaration: binding.declaration, value: value.value }));
    }
  }
  let receiver: CsharpRepresentedApplication["receiver"];
  if (source.receiver.kind === "value") {
    const value = host.representation.represent(source.receiver.value, "value", source.receiver.occurrence);
    if (value.kind !== "represented") return value;
    receiver = Object.freeze({ kind: "value", occurrence: source.receiver.occurrence, value: value.value });
  } else receiver = source.receiver;
  const sourceArguments: CsharpRepresentedApplication["sourceArguments"][number][] = [];
  const authoredOccurrences = new Set<Node>();
  for (const argument of source.sourceArguments) {
    if (authoredOccurrences.has(argument.occurrence)) failTargetAnalysisInvariant("tsonic-csharp",
      "An authored application argument has one original evaluation occurrence.", occurrence);
    authoredOccurrences.add(argument.occurrence);
    if (source.argumentDisposition === "skip") continue;
    if (argument.operand.kind === "refused") {
      return Object.freeze({ kind: "source-refused", refusal: argument.operand });
    }
    const operand = argument.operand.value;
    const value = host.representation.represent(operand.value, "value", operand.occurrence);
    if (value.kind !== "represented") return value;
    sourceArguments.push(Object.freeze({ source: argument, value: value.value }));
  }
  const arguments_: CsharpRepresentedArgument[] = [];
  if (source.argumentDisposition === "skip" && source.arguments.length !== 0) failTargetAnalysisInvariant("tsonic-csharp",
    "An invocation with skipped arguments cannot retain effective bindings.", occurrence);
  const effectiveIndexes = new Set<number>();
  for (const argument of source.arguments) {
    if (argument.parameter.signature !== source.identity.signature) failTargetAnalysisInvariant("tsonic-csharp",
      "An argument place must retain the exact original selected signature.", occurrence);
    if (!Number.isSafeInteger(argument.sourceArgumentIndex) || argument.sourceArgumentIndex < 0 ||
      sourceArguments[argument.sourceArgumentIndex]?.source.occurrence !== argument.sourceArgument ||
      !Number.isSafeInteger(argument.effectiveArgumentIndex) || argument.effectiveArgumentIndex < 0 ||
      effectiveIndexes.has(argument.effectiveArgumentIndex) ||
      argument.sourceForm === "spread-element" && (!Number.isSafeInteger(argument.spreadElementIndex) || argument.spreadElementIndex! < 0) ||
      argument.sourceForm !== "spread-element" && argument.spreadElementIndex !== undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "An effective application place requires its exact authored argument and unique extraction position.", occurrence);
    }
    effectiveIndexes.add(argument.effectiveArgumentIndex);
    const value = host.representation.represent(argument.source, "value", argument.effectiveArgument);
    if (value.kind !== "represented") return value;
    const destination = host.representation.represent(argument.destination.applied, "storage", argument.effectiveArgument);
    if (destination.kind !== "represented") return destination;
    arguments_.push(Object.freeze({ source: argument, value: value.value, destination: destination.value }));
  }
  const result = represent(source.result, "value");
  if (result.kind !== "represented") return result;
  return Object.freeze({ kind: "represented", value: Object.freeze({ source,
    callee: Object.freeze({ occurrence: source.callee.occurrence, value: callee.value }),
    classBindings: Object.freeze(classBindings), signatureBindings: Object.freeze(signatureBindings),
    receiver, sourceArguments: Object.freeze(sourceArguments), arguments: Object.freeze(arguments_), result: result.value }) });
}

export function csharpSourceApplicationSignature(
  facts: SourceProgramFacts,
  application: SourceApplication,
): CsharpRepresentationOutcome<SourceTypeDescriptorSignature> {
  let evidence = application.callee.value;
  const visited = new Set<SourceTypeEvidence>();
  while (!visited.has(evidence)) {
    visited.add(evidence);
    facts.descriptors.assertEvidence(evidence);
    const descriptor = evidence.type;
    if (descriptor.kind === "callable" || descriptor.kind === "shape") {
      const signatures = application.identity.signature.kind === "construct" ? descriptor.constructs : descriptor.calls;
      const signature = signatures.find(candidate => candidate.identity === application.identity.signature);
      if (signature !== undefined) return Object.freeze({ kind: "represented", value: signature });
      break;
    }
    if (descriptor.kind !== "declared" && descriptor.kind !== "optional") break;
    const next = descriptor.kind === "declared" ? facts.descriptors.definition(evidence)
      : facts.descriptors.component(evidence, { kind: "optional-value" });
    if (next.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: next });
    evidence = next.value;
  }
  return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_CALLABLE_SIGNATURE_NOT_PROVEN",
    site: application.identity.invocation,
    message: "The selected original Source application signature is absent from its authenticated callable-use inventory." });
}
