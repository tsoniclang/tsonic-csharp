import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { formCsharpObjectShapeMergeInput, formCsharpObjectShapeSourceMerge,
  mergeCsharpObjectShapeSubjects, type CsharpObjectShapeSourceMerge } from "./construction.js";

export type CsharpObjectShapePublicationInput =
  | { readonly kind: "initial"; readonly incoming: CsharpObjectShapeFact }
  | { readonly kind: "merge"; readonly incoming: CsharpObjectShapeFact;
      readonly previous: CsharpObjectShapeFact; readonly merge: CsharpObjectShapeSourceMerge };

export interface CsharpObjectShapePublication {
  readonly input: CsharpObjectShapePublicationInput;
  readonly shape: CsharpObjectShapeFact;
}

export type CsharpObjectShapeTargetSelection = {
  readonly type: TargetTypeRef;
  readonly shape: CsharpObjectShapeFact;
} & (
  | { readonly kind: "canonical"; readonly publication: CsharpObjectShapePublication }
  | { readonly kind: "template"; readonly template: CsharpObjectShapePublication;
      readonly owner: CsharpTargetNamedTypeRef; readonly instance: CsharpObjectShapeFact }
  | { readonly kind: "attached"; readonly shapes: readonly (CsharpObjectShapeFact | undefined)[]; readonly index: number }
  | { readonly kind: "nullable"; readonly selection: CsharpObjectShapeTargetSelection }
);

export function formCsharpObjectShapePublication(
  incoming: CsharpObjectShapeFact,
  previous: CsharpObjectShapePublication | undefined,
): CsharpObjectShapePublicationInput {
  if (previous === undefined) return Object.freeze({ kind: "initial", incoming });
  const merge = formCsharpObjectShapeSourceMerge(formCsharpObjectShapeMergeInput(previous.shape, incoming));
  return Object.freeze({ kind: "merge", incoming, previous: previous.shape, merge });
}

export function completeCsharpObjectShapePublication(input: CsharpObjectShapePublicationInput): CsharpObjectShapePublication {
  if (input.kind === "merge" && (input.merge.input.left !== input.previous || input.merge.input.right !== input.incoming)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Shape publication requires the same selected previous and incoming occurrences.");
  }
  return Object.freeze({ input, shape: input.kind === "initial" ? input.incoming : mergeCsharpObjectShapeSubjects(input.merge) });
}
