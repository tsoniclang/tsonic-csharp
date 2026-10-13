import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypePolicy } from "../resolution/model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import type { CsharpObjectShapePolicy } from "./object-shape-policy/model.js";

export interface CsharpValueDomainCarrierHost {
  readonly sourceStorage?: SourceStorageQueries;
  readonly objectShapes?: Pick<CsharpObjectShapePolicy, "resolveTarget">;
  readonly types: Pick<CsharpTypePolicy, "resolveNode">;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}

export function csharpValueDomainHasTargetType(
  host: CsharpValueDomainCarrierHost,
  node: Node,
  expected: TargetTypeRef,
): boolean {
  const storage = host.sourceStorage;
  if (storage === undefined || storage.failureReason() !== undefined) return false;
  const selected = storage.subjectFor(node);
  if (selected.kind !== "resolved") return false;
  const origins = storage.closedOriginsFor(selected.subject);
  if (origins.kind !== "complete" || origins.origins.length === 0) return false;
  const sourceFile = storage.source.ast.getSourceFile(node);
  if (sourceFile === undefined || !storage.source.semantics.includes(sourceFile)) return false;
  const queries = host.semantics(sourceFile);
  const selectedType = queries.types.expressionType(node);
  if (selectedType === undefined) return false;
  const selectedMembers = queries.types.isUnion(selectedType)
    ? queries.types.unionOrIntersectionTypes(selectedType) : [selectedType];
  const admitsAbsence = selectedMembers.some(type => queries.types.isNullish(type));
  let present = false;
  for (const origin of origins.origins) {
    if (host.semantics(origin.sourceFile).types.isNullish(origin.type)) {
      if (admitsAbsence) return false;
      continue;
    }
    if (origin.subject.kind !== "value") return false;
    let carrier = host.types.resolveNode(origin.subject.node, origin.sourceFile);
    for (const component of origin.subject.projection) {
      carrier = component.kind === "array-element" ? getCsharpCollectionElementTargetType(carrier)
        : component.kind === "tuple-element"
          ? carrier?.kind === "tuple" ? carrier.elements[component.index] : undefined
          : carrier === undefined ? undefined : projectedMemberCarrier(host, component.declaration, carrier);
    }
    if (carrier === undefined || !targetTypeRefEquals(carrier, expected)) return false;
    present = true;
  }
  return present && storage.failureReason() === undefined;
}

function projectedMemberCarrier(
  host: CsharpValueDomainCarrierHost,
  declaration: Node,
  owner: TargetTypeRef,
): TargetTypeRef | undefined {
  const shape = host.objectShapes?.resolveTarget(owner);
  if (shape === undefined) return undefined;
  const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [declaration]);
  return selected.kind === "resolved" && selected.member.memberKind !== "method" &&
    selected.member.accessor === undefined ? selected.member.type : undefined;
}
