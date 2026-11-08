import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../target-model/types/representation.js";
import type { CsharpObjectShapeRegistry } from "../../policy/model/type-resolution.js";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue, CsharpNativeConstructionSelection } from "../../target-model/records/native/native-construction.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";
import { createCsharpNativeConstructionRecords } from "../program/records/native/native-construction.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { createCsharpObjectShapeValueStorage } from "../../policy/types/objects/shape-carriers.js";
import { sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import { CsharpMetadataResourceLimitFailure, createCsharpMetadataBudget, maximumCsharpMetadataEntries } from "../../target-model/metadata/immutable.js";

export interface CsharpNativeConstructionHost {
  readonly source: TargetSourceProgram;
  readonly representation: CsharpRepresentationView;
  readonly objectShapes: CsharpObjectShapeRegistry;
  physicalValue(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef>;
}

export function createCsharpNativeConstructionDemandQuery(host: CsharpNativeConstructionHost): CsharpNativeConstructionDemandQueries {
  const { source, representation, objectShapes } = host;
  const { facts, ast } = source;
  const constructions = new Map<Node, CsharpNativeConstructionSelection>();
  const issues: CsharpNativeConstructionIssue[] = [];
  const budget = createCsharpMetadataBudget();

  function accept<Value>(outcome: CsharpRepresentationOutcome<Value>): Value | undefined {
    if (outcome.kind === "represented") return outcome.value;
    const diagnostic = csharpRepresentationDiagnostic(outcome);
    issues.push(Object.freeze({ node: diagnostic.sourceNode!, code: diagnostic.code,
      message: diagnostic.message, source: diagnostic.source }));
    return undefined;
  }

  function retain(node: Node, shape: CsharpObjectShapeFact): void {
    const selected = accept(objectShapes.retainConstructionSource(node, shape));
    if (selected !== undefined) constructions.set(node, Object.freeze({ targetType: selected.targetType, shape: selected }));
  }

  function localValue(declaration: Node, allocation: Node, original: CsharpObjectShapeFact): void {
    if (sourceDeclarationIsModuleScoped(declaration, ast)) return;
    const summary = facts.navigation.declarationUseSummary(declaration);
    if (summary.bindingWritten || summary.memberWritten || summary.identityCompared || summary.aliasedOrStored ||
      summary.exported || summary.hasUnclassifiedValueUse || summary.conditionallyRead ||
      summary.escapeKinds.some(kind => kind !== "capture") || summary.uses.length === 0 ||
      summary.uses.some(use => use.kind !== "type-only" && (use.role !== "receiver" || !use.throughMember))) return;
    const storage = createCsharpObjectShapeValueStorage(original);
    if (storage === undefined) return;
    retain(allocation, storage);
    retain(declaration, storage);
    for (const reference of facts.navigation.referencesToDeclaration(declaration)) {
      budget.reserve(1);
      retain(reference, storage);
    }
  }

  for (const occurrence of facts.values.occurrences()) {
    const construction = facts.values.construction(occurrence);
    if (construction.kind === "refused") {
      accept(Object.freeze({ kind: "source-refused", refusal: construction }));
      continue;
    }
    if (construction.value.kind === "none" || construction.value.value.kind !== "object") continue;
    const allocation = construction.value.value;
    facts.descriptors.assertEvidence(allocation.value);
    try {
      budget.reserve(1 + allocation.evaluation.length);
      const destination = facts.values.destination(occurrence);
      if (destination.kind === "refused") {
        accept(Object.freeze({ kind: "source-refused", refusal: destination }));
        continue;
      }
      const selectedEvidence = destination.value.kind === "present" ? destination.value.value.applied : allocation.value;
      const represented = accept(representation.represent(selectedEvidence, "storage", occurrence));
      if (represented === undefined) continue;
      const expected = objectShapes.resolveTarget(represented.carrier);
      const literal = accept(objectShapes.resolveObjectLiteralTargetShape(expected, occurrence));
      if (literal === undefined || literal.kind === "none") continue;
      const selected = literal.value;
      retain(occurrence, selected);
      if (destination.value.kind !== "present" || destination.value.value.declaration.origin.kind !== "declaration") continue;
      const declaration = destination.value.value.declaration.origin.declaration;
      const existing = accept(host.physicalValue(declaration));
      if (existing === undefined || !targetTypeRefEquals(existing, selected.targetType)) continue;
      retain(declaration, selected);
      for (const reference of facts.navigation.referencesToDeclaration(declaration)) {
        budget.reserve(1);
        retain(reference, selected);
      }
      if (destination.value.value.application === undefined) localValue(declaration, occurrence, selected);
    } catch (error) {
      if (!(error instanceof CsharpMetadataResourceLimitFailure)) throw error;
      issues.push(Object.freeze({ node: occurrence, code: "TSONIC_COMPILER_RESOURCE_LIMIT", source: "tsonic-csharp",
        message: `Native construction exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.` }));
    }
  }
  return createCsharpNativeConstructionRecords(constructions, issues);
}
