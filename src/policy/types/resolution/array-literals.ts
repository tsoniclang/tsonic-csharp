import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../target-model/types/carriers/js.js";
import { selectedCsharpSourceProfileOwner } from "./source-profile.js";
import { selectCsharpInferredNumericArrayElement } from "../collections/array-elements.js";
import { csharpSourceStorageContext } from "./source-storage-projection.js";

export type CsharpArrayLiteralSelection =
  | { readonly kind: "resolved"; readonly carrier: TargetTypeRef; readonly elementCarriers: readonly TargetTypeRef[] }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "unavailable" };

const unavailable: CsharpArrayLiteralSelection = Object.freeze({ kind: "unavailable" });

export function resolveCsharpArrayLiteralSelection(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpArrayLiteralSelection {
  const { host, resolveNodeWithState, resolveTypeWithState, sourceUnions } = scope;
  if (!host.ast.is.IsArrayLiteralExpression(node)) return unavailable;
  state = csharpSourceStorageContext(host, state, node);
  const sourceType = queries.types.expressionType(node);
  if (sourceType === undefined) return unavailable;
  const sourceElements = host.ast.elements(node);
  const selected = sourceElements.map(element => {
    if (element === undefined) return undefined;
    if (!host.ast.is.IsSpreadElement(element)) return resolveNodeWithState(element, queries.sourceFile, nextState(state));
    const operand = host.ast.as.AsSpreadElement(element)?.Expression;
    return getCsharpCollectionElementTargetType(resolveNodeWithState(operand, queries.sourceFile, nextState(state)));
  });
  if (selected.some(element => element === undefined)) return unavailable;
  const elements = selected.filter((element): element is TargetTypeRef => element !== undefined);
  const resolved = (carrier: TargetTypeRef, elementCarriers = elements): CsharpArrayLiteralSelection =>
    Object.freeze({ kind: "resolved", carrier, elementCarriers: Object.freeze([...elementCarriers]) });
  if (queries.types.isTuple(sourceType)) {
    if (sourceElements.some(element => element === undefined || host.ast.is.IsSpreadElement(element))) return unavailable;
    const tuple = resolveTypeWithState(sourceType, queries.sourceFile, nextState(state));
    return tuple?.kind === "tuple" && tuple.elements.length === elements.length ? resolved({ ...tuple, elements }) : unavailable;
  }
  const sourceCarrier = resolveTypeWithState(sourceType, queries.sourceFile, nextState(state));
  const sourceElement = getCsharpCollectionElementTargetType(sourceCarrier);
  if (elements.length === 0) return sourceCarrier === undefined ? unavailable : resolved(sourceCarrier);
  const members = sourceElements.map((entry, index) => {
    if (entry === undefined) return undefined;
    const spread = host.ast.is.IsSpreadElement(entry);
    const operand = spread ? host.ast.as.AsSpreadElement(entry)?.Expression : entry;
    const type = operand === undefined ? undefined : queries.types.expressionType(operand);
    const selectedType = type === undefined ? undefined : spread ? queries.types.typeArguments(type)[0] : type;
    const source = selectedType === undefined ? undefined : queries.types.literalBaseType(selectedType);
    const carrier = elements[index];
    return source === undefined || carrier === undefined ? undefined : { source, carrier,
      literal: spread ? undefined : host.literalValues.literalValue.get(entry),
      literalDefault: resolveTypeWithState(source, queries.sourceFile, nextState(state)) };
  });
  if (members.some(member => member === undefined)) return unavailable;
  const contributions = members.filter(member => member !== undefined);
  const context = queries.types.contextualValueSelection(node);
  const destination = context.kind !== "selected" ? undefined
    : getCsharpCollectionElementTargetType(resolveTypeWithState(context.type, queries.sourceFile, nextState(state)));
  const numeric = selectCsharpInferredNumericArrayElement(contributions, sourceElement, destination);
  if (numeric.kind === "rejected") return numeric;
  const contributionCarriers = numeric.kind === "unavailable" ? numeric.carriers : elements;
  const element = isCsharpJsValueTargetType(sourceElement) ? sourceElement
    : numeric.kind === "resolved" ? numeric.carrier : combineCsharpTargetUnionMembers(contributionCarriers);
  if (element === undefined) return unavailable;
  const retained = sourceUnions.retain(element, contributions.map((member, index) =>
    ({ source: member.source, carrier: contributionCarriers[index]! })), queries, state);
  if (retained === undefined) return unavailable;
  return resolved(selectedCsharpSourceProfileOwner(host.target) === "js"
    ? csharpJsArrayTargetType(retained) : { kind: "array", element: retained }, [...contributionCarriers]);
}
