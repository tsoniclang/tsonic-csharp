import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceApplication, SourceConstruction, SourcePresence, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpExpectedTypeAnalysis } from "../expected-types/model.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpNativeConstructionReceipt, CsharpNativeWriteAdmission } from "../../target-model/types/native-obligations.js";
import type { CsharpConversionClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpRepresentedTypeParameter, TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { TargetConstraint } from "../../target-model/types/model.js";
import { checkCsharpNativeTypeObligation, type CsharpNativeTypeObligationHost } from "../../policy/types/source-type-flow/obligations.js";
import { nativeRepresentationFailure, represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { getCsharpArrayLiteralElementTargetType, getCsharpReadOnlyIndexableCollectionElementTargetType,
  getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { csharpTargetTypeFailsConstraint } from "../operations/members/calls/constraint-satisfaction.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { csharpNativeTypeArgumentSatisfiesConstraints } from "../../policy/conversions/generic-callable.js";

export interface CsharpNativeTypeObligationInput {
  readonly policy: CsharpPolicyContext;
  readonly expected: CsharpExpectedTypeAnalysis;
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly compileTimeMetadata: CsharpSourceEvidenceIndex["compileTimeMetadata"];
  readonly conversions: Pick<CsharpConversionClassifications, "expressionConversion" | "delegateAdapter">;
}

export function analyzeCsharpNativeTypeObligations(input: CsharpNativeTypeObligationInput): readonly TargetDiagnostic[] {
  const { policy } = input;
  const issues: TargetDiagnostic[] = [];
  const issueKeys = new Map<Node | undefined, Set<string>>();
  const completed = new Map<Node, Set<string>>();
  const applications = new Set<Node>();
  const host: CsharpNativeTypeObligationHost = Object.freeze({
    representation: policy.representation, providers: policy.providers, projectTypes: policy.projectTypes,
    typeDefinitions: policy.typeDefinitions, objectShapes: policy.objectShapes, target: policy.target,
    nativeConstraintFailure(carrier: TargetTypeRef, constraint: TargetConstraint): SourcePresence<string> {
      const reason = csharpTargetTypeFailsConstraint(policy, { kind: "target-derived", targetType: carrier }, constraint);
      return reason === undefined ? { kind: "none" } : { kind: "present", value: reason };
    },
  });

  for (const request of input.expected.nativeUseSites.requests) {
    if (request.kind !== "requested" || request.mode !== "implicit") continue;
    const use = input.nativeDemand.nativeUse.get(request.site);
    if (use === undefined || use.kind === "erased") continue;
    if (use.expression !== request.expression) failTargetAnalysisInvariant("tsonic-csharp",
      "A Native write obligation requires the identical admitted expression use.", request.expression);
    let owner: Node | undefined = request.expression;
    while (owner !== undefined && !input.compileTimeMetadata.get(owner)) owner = policy.ast.parent(owner);
    if (owner !== undefined) continue;
    if (!applications.has(request.expression) && (policy.ast.is.IsCallExpression(request.expression) ||
      policy.ast.is.IsNewExpression(request.expression))) {
      const publication = sourceOutcome(policy.facts.applications.application(request.expression));
      const constraints = publication.kind !== "represented" ? publication : applicationConstraints(publication.value);
      if (constraints.kind !== "represented") reject(constraints);
      else applications.add(request.expression);
    }
    const carrier = use.kind === "converted" ? use.input.kind === "value" ? use.input.type : undefined : use.carrier;
    if (carrier === undefined) continue;
    const identity = `${targetTypeRefKey(carrier)}:${targetTypeRefKey(request.targetType)}`;
    const previous = completed.get(request.expression);
    if (use.kind === "converted" && (use.mode !== "implicit" || !targetTypeRefEquals(use.target, request.targetType))) {
      failTargetAnalysisInvariant("tsonic-csharp", "A converted write obligation requires the exact admitted conversion use.", request.expression);
    }
    const admission = admittedConversion(request.expression, carrier, request.targetType, use.kind === "converted");
    if (previous?.has(identity)) continue;
    const outcome = admit(request.expression, carrier, request.targetType, admission);
    if (outcome.kind !== "represented") {
      reject(outcome);
      continue;
    }
    const keys = previous ?? new Set<string>();
    keys.add(identity);
    completed.set(request.expression, keys);
  }
  return Object.freeze(issues);

  function reject(outcome: Exclude<CsharpRepresentationOutcome<unknown>, { readonly kind: "represented" }>): void {
    const diagnostic = csharpRepresentationDiagnostic(outcome);
    const key = JSON.stringify([diagnostic.source, diagnostic.code, diagnostic.message]);
    const previous = issueKeys.get(diagnostic.sourceNode);
    if (previous?.has(key)) return;
    const keys = previous ?? new Set<string>();
    keys.add(key);
    issueKeys.set(diagnostic.sourceNode, keys);
    issues.push(diagnostic);
  }

  function applicationConstraints(application: SourceApplication): CsharpRepresentationOutcome<true> {
    const originals = [...application.identity.classBindings, ...application.identity.signatureBindings];
    const parameters: { readonly native: CsharpRepresentedTypeParameter; readonly carrier: TargetTypeRef }[] = [];
    const substitutions = new Map<string, TargetTypeRef>();
    const declarations = new Set<Node>();
    for (const binding of originals) {
      if (declarations.has(binding.declaration)) throw new TypeError("An applied Native constraint retains each original Source binder exactly once.");
      declarations.add(binding.declaration);
      const original = policy.representation.source.typeParameter(binding.declaration);
      const parameter = policy.representation.parameter(original, application.identity.invocation);
      if (parameter.kind !== "represented") return parameter;
      const value = policy.representation.represent(binding.value, "type-argument", application.identity.invocation);
      if (value.kind !== "represented") return value;
      substitutions.set(parameter.value.identity, value.value.carrier);
      parameters.push({ native: parameter.value, carrier: value.value.carrier });
    }
    for (const parameter of parameters) {
      const constraints = parameter.native.csharpConstraints.constraints.map(constraint => constraint.kind === "type"
        ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, substitutions) } : constraint);
      if (!csharpNativeTypeArgumentSatisfiesConstraints(policy, parameter.carrier, constraints)) return nativeRepresentationFailure(
        application.identity.invocation, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED",
        `The actual Native argument does not satisfy the completed constraints of '${parameter.native.name}'.`);
    }
    return represented(true);
  }

  function admittedConversion(site: Node, source: TargetTypeRef, target: TargetTypeRef,
    required: boolean): CsharpNativeWriteAdmission | undefined {
    const conversion = input.conversions.expressionConversion.get(site, source, target, "implicit");
    if (conversion === undefined) {
      if (required) failTargetAnalysisInvariant("tsonic-csharp",
        "A converted Native write requires its same already-admitted expression conversion.", site);
      return undefined;
    }
    const adapter = input.conversions.delegateAdapter.get(site, source, target);
    if (adapter !== undefined && (!targetTypeRefEquals(adapter.source, source) || !targetTypeRefEquals(adapter.target, target) ||
      conversion.selection.kind !== "delegate-adapter")) {
      failTargetAnalysisInvariant("tsonic-csharp", "A converted callable write requires its identical admitted Native adapter.", site);
    }
    return Object.freeze({ site, source, target, selection: adapter?.selection ?? conversion.selection });
  }

  function admit(occurrence: Node, carrier: TargetTypeRef, target: TargetTypeRef,
    admission: CsharpNativeWriteAdmission | undefined): CsharpRepresentationOutcome<true> {
    const evidence = sourceOutcome(policy.facts.values.type(occurrence));
    if (evidence.kind !== "represented") return evidence;
    const destination = sourceOutcome(policy.facts.values.destination(occurrence));
    if (destination.kind !== "represented") return destination;
    const construction = sourceOutcome(policy.facts.values.construction(occurrence));
    if (construction.kind !== "represented") return construction;
    const endpoints = { ...(admission === undefined ? {} : { admission }), source: { evidence: construction.value.kind === "present" ? construction.value.value.value : evidence.value, carrier }, destination: {
      evidence: destination.value.kind === "present" ? destination.value.value.applied : evidence.value, carrier: target } };
    if (construction.value.kind === "none") {
      return checkCsharpNativeTypeObligation(host, { kind: "write-fit", site: occurrence, ...endpoints });
    }
    const original = construction.value.value;
    const receipt = original.kind === "array" ? arrayReceipt(original, carrier)
      : represented<CsharpNativeConstructionReceipt>({ kind: "aggregate", carrier });
    if (receipt.kind !== "represented") return receipt;
    return checkCsharpNativeTypeObligation(host, { kind: "literal-admission", site: occurrence, ...endpoints,
      construction: { kind: "present", value: receipt.value } });
  }

  function arrayReceipt(construction: SourceConstruction, carrier: TargetTypeRef): CsharpRepresentationOutcome<CsharpNativeConstructionReceipt> {
    const selected = construction.destination;
    const destination = selected.kind === "none" ? construction.value : selected.value.kind === "sum"
      ? selected.value.arm : selected.value.destination.applied;
    const definition = sourceOutcome(policy.representation.source.definition(destination));
    if (definition.kind !== "represented") return definition;
    const element = getCsharpArrayLiteralElementTargetType(carrier);
    if (carrier.kind !== "tuple" && element === undefined) return missing(construction.occurrence,
      "The admitted array construction has no exact Native element storage.");
    const contributions: Extract<CsharpNativeConstructionReceipt, { readonly kind: "array" }>["contributions"][number][] = [];
    let position = 0;
    for (const original of construction.evaluation) {
      if (original.form === "key") throw new TypeError("A Source array construction cannot publish a key contribution.");
      const physical = policy.nativeValue(original.occurrence);
      if (physical.kind !== "represented") return physical;
      const elements: Extract<CsharpNativeConstructionReceipt, { readonly kind: "array" }>["contributions"][number]["elements"][number][] = [];
      const sources: { readonly evidence: SourceTypeEvidence; readonly carrier: TargetTypeRef }[] = [];
      if (original.form === "value") sources.push({ evidence: original.value, carrier: physical.value });
      else if (physical.value.kind === "tuple") {
        for (const [index, value] of physical.value.elements.entries()) {
          const evidence = sourceOutcome(policy.representation.source.component(original.value, { kind: "tuple-element", index }));
          if (evidence.kind !== "represented") return evidence;
          sources.push({ evidence: evidence.value, carrier: value });
        }
      } else {
        if (carrier.kind === "tuple") return missing(original.occurrence,
          "A fixed Native tuple cannot receive an unbounded spread without its exact physical contribution vector.");
        const value = getCsharpReadOnlyIndexableCollectionElementTargetType(physical.value)
          ?? getCsharpCollectionElementTargetType(physical.value);
        if (value === undefined) return missing(original.occurrence,
          "An array spread requires the actual Native sequence element ABI.");
        const evidence = sourceOutcome(policy.representation.source.component(original.value, { kind: "array-element" }));
        if (evidence.kind !== "represented") return evidence;
        sources.push({ evidence: evidence.value, carrier: value });
      }
      for (const source of sources) {
        const target = carrier.kind === "tuple" ? carrier.elements[position] : element;
        if (target === undefined) return missing(original.occurrence,
          "Every original array contribution requires its existing Native storage slot.");
        const evidence = sourceOutcome(policy.representation.source.component(definition.value,
          definition.value.type.kind === "tuple" ? { kind: "tuple-element", index: position } : { kind: "array-element" }));
        if (evidence.kind !== "represented") return evidence;
        const admission = admittedConversion(original.occurrence, source.carrier, target, false);
        elements.push({ site: original.occurrence, source, destination: { evidence: evidence.value, carrier: target },
          ...(admission === undefined ? {} : { admission }) });
        position += 1;
      }
      contributions.push({ original, elements: Object.freeze(elements) });
    }
    if (carrier.kind === "tuple" && position !== carrier.elements.length) return missing(construction.occurrence,
      "The complete original contribution vector must cover every physical Native tuple storage slot.");
    return represented({ kind: "array", carrier, construction, contributions: Object.freeze(contributions) });
  }
}

function missing(site: Node, reason: string): CsharpRepresentationOutcome<never> {
  return nativeRepresentationFailure(site, "CSHARP_NATIVE_LITERAL_RECEIPT_MISSING", reason);
}
