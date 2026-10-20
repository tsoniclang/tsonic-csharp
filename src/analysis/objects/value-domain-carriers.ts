import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceStorageQueries, SourceStorageSubject } from "@tsonic/target-api/analysis";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypePolicy } from "../types/resolution/model.js";
import type { CsharpObjectShapePolicy } from "./shapes/model.js";
import type { CsharpValueDomainCarrierAnalysis, CsharpValueDomainCarrierIssue } from "../../target-model/records/value-domains.js";
import { createCsharpValueDomainCarrierRecords } from "../program/records/value-domains.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";

export interface CsharpValueDomainAnalysisHost {
  readonly sourceStorage: SourceStorageQueries;
  readonly objectShapes?: Pick<CsharpObjectShapePolicy, "resolveTarget">;
  readonly types: Pick<CsharpTypePolicy, "resolveNode">;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}

export function analyzeCsharpValueDomainCarriers(
  host: CsharpValueDomainAnalysisHost,
  expressions: Iterable<Node>,
  budget = createCsharpMetadataBudget(),
): CsharpValueDomainCarrierAnalysis {
  const storage = host.sourceStorage;
  const carriers = new Map<Node, TargetTypeRef>();
  const originCarriers = new Map<SourceStorageSubject, TargetTypeRef | undefined>();
  const issues: CsharpValueDomainCarrierIssue[] = [];
  let complete = storage.failureReason() === undefined;
  let current: Node | undefined;
  if (complete) {
    try {
      const seen = new Set<Node>();
      for (const node of expressions) {
        current = node;
        budget.reserve(1);
        if (seen.has(node)) continue;
        seen.add(node);
        const carrier = selectDomain(node);
        if (carrier !== undefined) carriers.set(node, carrier);
      }
      complete = storage.failureReason() === undefined;
    } catch (error) {
      if (!(error instanceof TypeError) || error.message !== "C# immutable metadata exceeds its finite resource budget." ||
        current === undefined) throw error;
      issues.push(Object.freeze({ node: current, code: "CSHARP_VALUE_DOMAIN_METADATA_BUDGET_EXHAUSTED",
        message: "C# value-domain carrier analysis exceeds its finite target metadata budget." }));
      complete = false;
    }
  }
  return createCsharpValueDomainCarrierRecords(carriers, issues, complete);

  function selectDomain(node: Node): TargetTypeRef | undefined {
    const selected = storage.subjectFor(node);
    if (selected.kind !== "resolved") return undefined;
    const origins = storage.closedOriginsFor(selected.subject);
    if (origins.kind !== "complete" || origins.origins.length === 0) return undefined;
    const sourceFile = storage.source.ast.getSourceFile(node);
    if (sourceFile === undefined || !storage.source.semantics.includes(sourceFile)) return undefined;
    const queries = host.semantics(sourceFile);
    const selectedType = queries.types.expressionType(node);
    if (selectedType === undefined) return undefined;
    const members = queries.types.isUnion(selectedType) ? queries.types.unionOrIntersectionTypes(selectedType) : [selectedType];
    const admitsAbsence = members.some(type => queries.types.isNullish(type));
    let carrier: TargetTypeRef | undefined;
    for (const origin of origins.origins) {
      budget.reserve(1);
      if (host.semantics(origin.sourceFile).types.isNullish(origin.type)) {
        if (admitsAbsence) return undefined;
        continue;
      }
      if (origin.subject.kind !== "value") return undefined;
      let selectedCarrier = originCarriers.get(origin.subject);
      if (!originCarriers.has(origin.subject)) {
        selectedCarrier = host.types.resolveNode(origin.subject.node, origin.sourceFile);
        for (const component of origin.subject.projection) {
          budget.reserve(1);
          selectedCarrier = component.kind === "array-element" ? getCsharpCollectionElementTargetType(selectedCarrier)
            : component.kind === "tuple-element"
              ? selectedCarrier?.kind === "tuple" ? selectedCarrier.elements[component.index] : undefined
              : selectedCarrier === undefined ? undefined : projectedMemberCarrier(component.declaration, selectedCarrier);
        }
        originCarriers.set(origin.subject, selectedCarrier);
      }
      if (selectedCarrier === undefined || carrier !== undefined && !targetTypeRefEquals(carrier, selectedCarrier)) return undefined;
      carrier = selectedCarrier;
    }
    return carrier;
  }

  function projectedMemberCarrier(declaration: Node, owner: TargetTypeRef): TargetTypeRef | undefined {
    const shape = host.objectShapes?.resolveTarget(owner);
    if (shape === undefined) return undefined;
    const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [declaration]);
    return selected.kind === "resolved" && selected.member.memberKind !== "method" &&
      selected.member.accessor === undefined ? selected.member.type : undefined;
  }
}
