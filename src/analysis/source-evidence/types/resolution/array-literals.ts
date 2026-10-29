import type { CsharpArrayLiteralSelection } from "../../../../target-model/records/operations/array-literals.js";
import type { Node, Type } from "@tsonic/tsts";
import { sourceExpressionCallArgument, sourceSequenceInputChoice, sourceSequenceInputIsEmpty,
  type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { getCsharpCollectionElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers, isCsharpJsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { selectCsharpInferredNumericArrayElement } from "../../../../policy/types/collections/array-elements.js";
import { getCsharpCallableValueSignature, getCsharpTaskResultTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { selectCsharpLiteralDeclarationContext } from "../../../objects/native-construction-demand.js";
import { csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import { resolveTypeParameter } from "./source-evidence.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";
import { csharpSourceUnionIdentity } from "../../../../target-model/types/source-union-definitions.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

const unavailable: CsharpArrayLiteralSelection = Object.freeze({ kind: "unavailable" });
type ArrayContribution = Parameters<typeof selectCsharpInferredNumericArrayElement>[0][number] & { readonly source: Type };

export function resolveCsharpArrayLiteralSelection(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpArrayLiteralSelection {
  const { host, resolveNodeWithState, resolveTypeWithState, sourceUnions } = scope;
  if (!host.ast.is.IsArrayLiteralExpression(node)) return unavailable;
  const sourceType = queries.types.expressionType(node);
  if (sourceType === undefined) return unavailable;
  const sourceElements = host.ast.elements(node);
  const resolved = (carrier: TargetTypeRef, elementCarriers: readonly TargetTypeRef[]): CsharpArrayLiteralSelection =>
    Object.freeze({ kind: "resolved", carrier, elementCarriers: Object.freeze([...elementCarriers]) });
  if (queries.types.isTuple(sourceType)) {
    if (sourceElements.some(element => element === undefined || host.ast.is.IsSpreadElement(element))) return unavailable;
    const elements = sourceElements.map(element => resolveNodeWithState(element, queries.sourceFile, nextState(state)));
    if (elements.some(element => element === undefined)) return unavailable;
    const tuple = resolveTypeWithState(sourceType, queries.sourceFile, nextState(state));
    return tuple?.kind === "tuple" && tuple.elements.length === elements.length
      ? resolved({ ...tuple, elements: elements as readonly TargetTypeRef[] }, elements as readonly TargetTypeRef[]) : unavailable;
  }
  const sourceCarrier = resolveTypeWithState(sourceType, queries.sourceFile, nextState(state));
  const sourceElement = getCsharpCollectionElementTargetType(sourceCarrier);
  const contribution = (expression: Node, carrier: TargetTypeRef, type: Type, literal: boolean): ArrayContribution | undefined => {
    const source = queries.types.literalBaseType(type);
    return source === undefined ? undefined : { source, carrier,
      literal: literal ? host.literalValues.literalValue.get(expression) : undefined,
      literalDefault: resolveTypeWithState(source, queries.sourceFile, nextState(state)) };
  };
  const selected = sourceElements.map((entry): readonly ArrayContribution[] | undefined => {
    if (entry === undefined) return undefined;
    if (!host.ast.is.IsSpreadElement(entry)) {
      const carrier = resolveNodeWithState(entry, queries.sourceFile, nextState(state));
      const type = queries.types.expressionType(entry);
      const member = carrier === undefined || type === undefined ? undefined : contribution(entry, carrier, type, true);
      return member === undefined ? undefined : [member];
    }
    const operand = host.ast.as.AsSpreadElement(entry)?.Expression;
    const choice = operand === undefined ? undefined : sourceSequenceInputChoice(host.ast, operand);
    if (choice === undefined) return undefined;
    const members: ArrayContribution[] = [];
    for (const expression of choice.inputs) {
      if (sourceSequenceInputIsEmpty(host.ast, expression)) continue;
      const carrier = resolveNodeWithState(expression, queries.sourceFile, nextState(state));
      const checked = queries.types.expressionType(expression);
      if (carrier === undefined || checked === undefined) return undefined;
      const present = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier) ?? carrier;
      const parts = queries.types.isUnion(checked) ? queries.types.unionOrIntersectionTypes(checked).filter(type => !queries.types.isNullish(type)) : [checked];
      if (parts.length !== 1) return undefined;
      const types = queries.types.isTuple(parts[0]!) ? queries.types.tupleElementTypes(parts[0]!) : queries.types.typeArguments(parts[0]!).slice(0, 1);
      const element = getCsharpCollectionElementTargetType(present);
      const carriers = present.kind === "tuple" ? present.elements : element === undefined ? [] : [element];
      if (types.length === 0 || types.length !== carriers.length) return undefined;
      for (const [index, carrier] of carriers.entries()) {
        const member = contribution(expression, carrier, types[index]!, false);
        if (member === undefined) return undefined;
        members.push(member);
      }
    }
    return members;
  });
  if (selected.some(group => group === undefined)) return unavailable;
  const contributions = selected.flatMap(group => group ?? []);
  const elements = contributions.map(member => member.carrier);
  const context = selectCsharpLiteralDeclarationContext(node, queries, host);
  const destination = selectArrayElementDestination(scope, node, queries, state, context, sourceElements.length === 0);
  if (elements.length === 0) {
    if (sourceElements.length === 0 && destination.kind === "unavailable" &&
      context === undefined) {
      state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: node,
        code: "TSONIC_UNTYPED_ARRAY_LITERAL",
        reason: "This empty array has no element type. Declare one, e.g. 'function emptyBuffer(): number[]'." }));
      return unavailable;
    }
    const carrier = destination.kind === "resolved" ? selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(destination.carrier) : { kind: "array" as const, element: destination.carrier }
      : sourceCarrier;
    return carrier === undefined ? unavailable : resolved(carrier, []);
  }
  const numeric = selectCsharpInferredNumericArrayElement(contributions, sourceElement,
    destination.kind === "resolved" ? destination.carrier : undefined);
  if (numeric.kind === "rejected") return numeric;
  const contributionCarriers = numeric.kind === "unavailable" ? numeric.carriers : elements;
  const element = destination.kind === "resolved" ? destination.carrier
    : isCsharpJsValueTargetType(sourceElement) ? sourceElement
    : numeric.kind === "resolved" ? numeric.carrier : combineCsharpTargetUnionMembers(contributionCarriers);
  if (element === undefined) return unavailable;
  const retained = sourceUnions.retain(element, contributions.map((member, index) =>
    ({ source: member.source, carrier: contributionCarriers[index]! })), queries, state);
  if (retained === undefined) return unavailable;
  let offset = 0;
  const elementCarriers = selected.map(group => {
    const physical = group?.length === 1 ? contributionCarriers[offset] : retained;
    offset += group?.length ?? 0;
    return physical ?? retained;
  });
  return resolved(selectedCsharpSourceProfileOwner(host.target) === "js"
    ? csharpJsArrayTargetType(retained) : { kind: "array", element: retained }, elementCarriers);
}
function selectArrayElementDestination(
  scope: CsharpTypeResolutionScope,
  expression: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  context: ReturnType<typeof selectCsharpLiteralDeclarationContext>,
  empty: boolean,
): { readonly kind: "resolved"; readonly carrier: TargetTypeRef } | { readonly kind: "unavailable" } {
  const { host } = scope;
  const collectionElement = (carrier: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
    const direct = getCsharpCollectionElementTargetType(present);
    if (direct !== undefined || present === undefined) return direct;
    const collections = csharpUnionLeaves(present, host.typeDefinitions)?.flatMap(leaf => {
      const element = getCsharpCollectionElementTargetType(getCsharpNullableElementTargetType(leaf.carrier) ?? leaf.carrier);
      return element === undefined ? [] : [element];
    });
    return collections?.length === 1 ? collections[0] : undefined;
  };
  const argument = sourceExpressionCallArgument(context?.returnedFrom ?? context?.source ?? expression,
    { ast: host.ast, semantics: { forNode: host.semanticsFor } });
  if (argument !== undefined) {
    const callQueries = host.semanticsFor(argument.call);
    const call = callQueries.operations.call(argument.call);
    const bindings = call?.sourceArgumentBindings.filter(binding =>
      binding.sourceArgumentIndex === argument.argumentIndex && binding.sourceForm === "value") ?? [];
    if (call === undefined || bindings.length !== 1) return { kind: "unavailable" };
    const excluded = empty ? undefined : new Set([argument.argumentIndex, ...call.sourceArguments.flatMap((argument, index) => {
      const declaration = host.navigation.referenceFor(argument.expression)?.declaration;
      return declaration !== undefined && context?.declarations.includes(declaration) === true ? [index] : [];
    })]);
    const parameter = scope.resolveSourceCallArgumentParameter(call, bindings[0]!, callQueries.sourceFile, excluded);
    const result = context?.returnedFrom === undefined ? parameter
      : getCsharpCallableValueSignature(getCsharpNullableElementTargetType(parameter) ?? parameter)?.returnType;
    const selected = context?.returnedFrom !== undefined && host.ast.hasModifierKind(context.returnedFrom, "async")
      ? getCsharpTaskResultTargetType(result) : result;
    if (csharpSourceUnionIdentity(getCsharpNullableElementTargetType(selected) ?? selected) !== undefined) {
      const declaration = call.sourceSelectedSignatureParameters[bindings[0]!.sourceParameterIndex];
      if (declaration?.authoredTypeNode === undefined) return { kind: "unavailable" };
      const declared = scope.resolveSourceCallSelectedType(call, declaration.parameterDeclaration,
        declaration.authoredTypeNode, bindings[0]!.selectedParameterType, callQueries.sourceFile,
        nextState(state), excluded);
      if (declared === undefined || parameter === undefined || !targetTypeRefEquals(declared, parameter)) {
        return { kind: "unavailable" };
      }
    }
    const element = collectionElement(selected);
    const unbound = new Set((call.sourceSelectedMethodTypeArguments ?? []).flatMap(argument => {
      if (argument.explicitTypeNode !== undefined) return [];
      const parameter = resolveTypeParameter(argument.typeParameter, callQueries, host.ast, host.typeParameterConstraints);
      return parameter?.kind === "type-parameter" ? [parameter.identity] : [];
    }));
    if (element !== undefined && [...csharpFreeTypeParameterIdentities([element])].some(identity => unbound.has(identity))) {
      return { kind: "unavailable" };
    }
    return element === undefined ? { kind: "unavailable" } : { kind: "resolved", carrier: element };
  }
  if (context === undefined) return { kind: "unavailable" };
  const selected = scope.resolveSourceTypeComponentEvidence(context.component, queries, nextState(state));
  const returned = context.component.declaration !== undefined &&
    scope.host.ast.hasModifierKind(context.component.declaration, "async")
    ? getCsharpTaskResultTargetType(selected) : selected;
  const element = collectionElement(returned);
  return element === undefined ? { kind: "unavailable" } : { kind: "resolved", carrier: element };
}
