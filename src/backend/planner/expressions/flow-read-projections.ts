import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpFlowReadConversion,
} from "../../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  type CsharpTargetNamedTypeRef,
  combineCsharpTargetUnionMembers,
  targetTypeRefEquals,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function planFlowReadUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  selectedType: TargetTypeRef | undefined = input.types.resolveNode(node, sourceFile),
): CsharpExpression | undefined {
  const storageType = input.types.resolveReadStorage(node, sourceFile);
  if (storageType === undefined) {
    return baseExpression;
  }
  const sourceRefinement = input.source.semantics
    .selectValueTypeRefinement(node);
  if (sourceRefinement.kind === "not-project-reference") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A target storage-read projection requires an exact project source declaration.",
    ));
    return undefined;
  }
  if (sourceRefinement.kind === "unresolved") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    const missing = sourceRefinement.missing === "declared-type"
      ? "declared type"
      : "selected type";
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `A target storage-read projection requires the exact source ${missing}.`,
    ));
    return undefined;
  }
  if (sourceRefinement.refinement.kind === "exact") {
    return baseExpression;
  }
  if (sourceRefinement.refinement.kind === "ambiguous") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The checked source value refinement is ambiguous, so C# cannot select one storage-read projection.",
    ));
    return undefined;
  }
  if (
    storageType.kind === "target-named" &&
    (storageType as CsharpTargetNamedTypeRef)
        .csharpFlowRefinementRepresentation === "identity"
  ) {
    return baseExpression;
  }
  const refinedMembers = sourceRefinement.refinement.kind === "members"
    ? sourceRefinement.refinement.types.map((member) =>
        input.types.resolveType(member, sourceFile)
      )
    : undefined;
  const selectedValueType = input.types.resolveSelectedValue(
    node,
    sourceRefinement.selectedType,
    sourceFile,
  );
  const refinedSelectedType = selectedValueType !== undefined &&
      !targetTypeRefEquals(storageType, selectedValueType)
    ? selectedValueType
    : refinedMembers === undefined
      ? input.types.resolveType(sourceRefinement.selectedType, sourceFile)
      : refinedMembers.some((member) => member === undefined)
        ? undefined
        : combineCsharpTargetUnionMembers(
            refinedMembers as readonly TargetTypeRef[],
          );
  if (refinedSelectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact checked source value refinement has no closed C# representation.",
    ));
    return undefined;
  }
  if (targetTypeRefEquals(storageType, refinedSelectedType)) {
    return baseExpression;
  }
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    storageType,
    refinedSelectedType,
    selectCsharpFlowReadConversion(input, storageType, refinedSelectedType),
    baseExpression,
  );
}
