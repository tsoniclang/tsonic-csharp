import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectShapeInstantiationHeader } from "../../../policy/types/objects/instantiation.js";
import { requireCsharpObjectShapeHeader, type CsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";
import { formCsharpObjectShapeMergeInput, formCsharpObjectShapeSourceMerge,
  formCsharpObjectShapeProofRows, requireCsharpObjectShapeProofRows, mergeCsharpObjectShapeSubjects, type CsharpObjectShapeMergeInput,
  type CsharpObjectShapeProofRows, type CsharpObjectShapeSourceMerge } from "./construction.js";
import { formMemberInstantiationEvidence, instantiateMemberEvidence,
  type CsharpObjectShapeMemberInstantiationSource } from "./member-instantiation.js";
import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export type CsharpObjectShapePublicationHeader =
  | { readonly kind: "initial"; readonly incoming: CsharpObjectShapeHeader; readonly output: CsharpObjectShapeHeader }
  | { readonly kind: "merge"; readonly incoming: CsharpObjectShapeHeader;
      readonly previous: CsharpObjectShapeHeader; readonly merge: CsharpObjectShapeMergeInput;
      readonly output: CsharpObjectShapeHeader };

export type CsharpObjectShapePublicationSource = {
  readonly header: CsharpObjectShapePublicationHeader;
  readonly incoming: CsharpObjectShapeProofRows;
  readonly output: CsharpObjectShapeProofRows;
} & (
  | { readonly kind: "initial" }
  | { readonly kind: "merge"; readonly previous: CsharpObjectShapeProofRows;
      readonly merge: CsharpObjectShapeSourceMerge }
);

export interface CsharpObjectShapePublication {
  readonly header: CsharpObjectShapeHeader;
  readonly source: CsharpObjectShapePublicationSource;
  readonly shape: CsharpObjectShapeFact;
}

export type CsharpObjectShapeTargetSelection = {
  readonly type: TargetTypeRef;
  readonly header: CsharpObjectShapeHeader;
} & (
  | { readonly kind: "canonical"; readonly publication: CsharpObjectShapePublication }
  | { readonly kind: "template"; readonly template: CsharpObjectShapePublication;
      readonly owner: CsharpTargetNamedTypeRef; readonly instantiation: CsharpObjectShapeInstantiationHeader }
  | { readonly kind: "attached"; readonly shapes: readonly (CsharpObjectShapeFact | undefined)[]; readonly index: number }
  | { readonly kind: "nullable"; readonly selection: CsharpObjectShapeTargetSelection }
);

export interface CsharpObjectShapeTargetSource {
  readonly selection: CsharpObjectShapeTargetSelection;
  readonly type: Type | undefined;
  readonly rows: CsharpObjectShapeProofRows;
  readonly instantiation: CsharpObjectShapeMemberInstantiationSource | undefined;
}

function selectedSourceRows(selection: CsharpObjectShapeTargetSelection): CsharpObjectShapeProofRows {
  if (selection.kind === "nullable") return selectedSourceRows(selection.selection);
  if (selection.kind === "canonical") return selection.publication.source.output;
  if (selection.kind === "attached") {
    const shape = selection.shapes[selection.index];
    if (shape === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Attached shape source requires the exact header-selected slot.");
    return formCsharpObjectShapeProofRows(selection.header, shape);
  }
  const template = selection.template.source.output;
  return formCsharpObjectShapeProofRows(selection.header, { sourceType: template.sourceType,
    members: template.members, declarationTemplate: template.declarationTemplate ?? template,
  });
}

export function formCsharpObjectShapeTargetSource(
  selection: CsharpObjectShapeTargetSelection,
  type: Type | undefined,
  queries: SourceFileSemantics | undefined,
): CsharpObjectShapeTargetSource {
  const rows = selectedSourceRows(selection);
  if (rows.header !== selection.header) return failTargetAnalysisInvariant("tsonic-csharp",
    "Selected shape source requires the identical immutable header occurrence.");
  if (type !== undefined && queries === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "Selected shape proof requires its original checked query owner.");
  const instantiation = type === undefined ? undefined : formMemberInstantiationEvidence(Object.freeze({
    members: rows.members, type, queries: queries!, previousSourceType: rows.sourceType,
  }));
  return Object.freeze({ selection, type, rows, instantiation });
}

export function completeCsharpObjectShapeTargetMemberSource(
  source: CsharpObjectShapeTargetSource,
  shape: CsharpObjectShapeFact,
): CsharpObjectShapeFact | undefined {
  if (source.rows.header !== source.selection.header) return failTargetAnalysisInvariant("tsonic-csharp",
    "Selected native member completion requires its identical header occurrence.");
  requireCsharpObjectShapeProofRows(source.rows, shape);
  const instantiation = source.instantiation;
  if (instantiation === undefined) return undefined;
  if (source.type === undefined || instantiation.input.type !== source.type ||
    instantiation.input.members !== source.rows.members ||
    instantiation.input.previousSourceType !== source.rows.sourceType) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Selected native member completion requires its exact header and checked source occurrence.");
  }
  const members = instantiateMemberEvidence(shape.members, instantiation);
  return members === undefined ? undefined : Object.freeze({ ...shape, sourceType: source.type, members });
}

export function formCsharpObjectShapePublication(
  incoming: CsharpObjectShapeHeader,
  previous: CsharpObjectShapeHeader | undefined,
): CsharpObjectShapePublicationHeader {
  if (previous === undefined) return Object.freeze({ kind: "initial", incoming, output: incoming });
  const merge = formCsharpObjectShapeMergeInput(previous, incoming);
  return Object.freeze({ kind: "merge", incoming, previous, merge, output: merge.output });
}

export function formCsharpObjectShapePublicationSource(
  header: CsharpObjectShapePublicationHeader,
  incoming: CsharpObjectShapeProofRows,
  previous: CsharpObjectShapeProofRows | undefined,
): CsharpObjectShapePublicationSource {
  if (incoming.header !== header.incoming) return failTargetAnalysisInvariant("tsonic-csharp",
    "Shape source publication requires its exact incoming header.");
  if (header.kind === "initial") {
    if (previous !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Initial shape source publication requires genuine previous absence.");
    return Object.freeze({ kind: "initial", header, incoming, output: incoming });
  }
  if (previous?.header !== header.previous) return failTargetAnalysisInvariant("tsonic-csharp",
    "Shape source publication requires the same selected previous header.");
  const merge = formCsharpObjectShapeSourceMerge(header.merge, previous, incoming);
  return Object.freeze({ kind: "merge", header, incoming, previous, merge, output: merge.output });
}

export function completeCsharpObjectShapePublication(
  source: CsharpObjectShapePublicationSource,
  incoming: CsharpObjectShapeFact,
  previous: CsharpObjectShapeFact | undefined,
): CsharpObjectShapePublication {
  requireCsharpObjectShapeHeader(source.header.incoming, incoming);
  requireCsharpObjectShapeProofRows(source.incoming, incoming);
  if (source.kind === "initial") {
    if (previous !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Initial native shape publication requires genuine previous absence.");
    return Object.freeze({ header: source.header.output, source, shape: incoming });
  }
  if (previous === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "Native shape publication requires its original selected previous occurrence.");
  return Object.freeze({ header: source.header.output, source,
    shape: mergeCsharpObjectShapeSubjects(source.merge, previous, incoming) });
}
