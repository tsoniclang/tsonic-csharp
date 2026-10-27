import type { CsharpArrayLiteralSelection } from "../../../../target-model/records/operations/array-literals.js";
import type { Node, Type } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceExpressionCallArgument, sourceSequenceInputChoice, sourceSequenceInputIsEmpty,
  type SourceClosedCallableArgument, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { getCsharpCollectionElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers, isCsharpJsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { selectCsharpInferredNumericArrayElement } from "../../../../policy/types/collections/array-elements.js";
import { csharpSourceStorageContext } from "./source-storage-projection.js";
import { getCsharpCallableValueSignature, getCsharpTaskResultTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";

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
  state = csharpSourceStorageContext(host, state, node);
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
  const destination = selectArrayElementDestination(scope, node, queries, state, contributions.length === 0);
  if (destination.kind === "rejected") return destination;
  if (elements.length === 0) {
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
  empty: boolean,
): { readonly kind: "resolved"; readonly carrier: TargetTypeRef } | { readonly kind: "unavailable" } |
  { readonly kind: "rejected"; readonly reason: string } {
  const { host, resolveNodeWithState, resolveSourceTypeComponentEvidence } = scope;
  const flow = host.navigation.expressionValueFlow(expression);
  const uses = flow.uses.filter(use => !use.throughMember && (use.role === "argument" || use.role === "return")).map(use => {
    const owner = use.role === "return" ? sourceEnclosingCallable(use.reference, host.ast) : undefined;
    const argument = use.role === "argument" ? sourceExpressionCallArgument(use.reference,
      { ast: host.ast, semantics: { forNode: host.semanticsFor } }) : owner === undefined ? undefined
      : sourceExpressionCallArgument(owner, { ast: host.ast, semantics: { forNode: host.semanticsFor } });
    return { use, owner, argument };
  });
  const destinations: TargetTypeRef[] = [];
  let directContext = true;
  const elementOf = (carrier: TargetTypeRef | undefined): TargetTypeRef | undefined =>
    getCsharpCollectionElementTargetType(getCsharpNullableElementTargetType(carrier) ?? carrier);
  const destinationElement = (carrier: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    const element = elementOf(carrier);
    if (element === undefined || csharpFreeTypeParameterIdentities([element]).size !== 0) return undefined;
    if (empty) return element;
    const present = getCsharpNullableElementTargetType(element) ?? element;
    const numeric = (type: TargetTypeRef): boolean => {
      const value = getCsharpNullableElementTargetType(type) ?? type;
      return value.kind === "source-primitive" && value.name !== "bool";
    };
    return numeric(present) || csharpUnionLeaves(present, host.typeDefinitions)?.some(arm => numeric(arm.carrier))
      ? element : undefined;
  };
  const add = (carrier: TargetTypeRef | undefined): void => {
    const element = destinationElement(carrier);
    if (element !== undefined) destinations.push(element);
  };
  const argumentDestination = (argument: SourceClosedCallableArgument, reference: Node, returning: boolean): TargetTypeRef | undefined => {
    const callQueries = host.semanticsFor(argument.call);
    const selected = callQueries.operations.call(argument.call);
    if (selected === undefined) return undefined;
    const matches = selected.sourceArgumentBindings.filter(binding =>
      binding.sourceArgumentIndex === argument.argumentIndex && binding.sourceForm === "value");
    const binding = matches.length === 1 ? matches[0] : undefined;
    if (binding === undefined) return undefined;
    const returned = (carrier: TargetTypeRef | undefined): TargetTypeRef | undefined => {
      const result = getCsharpCallableValueSignature(getCsharpNullableElementTargetType(carrier) ?? carrier)?.returnType;
      return host.ast.hasModifierKind(reference, "async") ? getCsharpTaskResultTargetType(result) : result;
    };
    const excludedArguments = empty ? undefined : new Set([argument.argumentIndex, ...uses.flatMap(entry =>
      entry.argument?.call === argument.call ? [entry.argument.argumentIndex] : [])]);
    const actual = scope.resolveSourceCallArgumentParameter(selected, binding, callQueries.sourceFile, excludedArguments);
    return returning ? returned(actual) : actual;
  };
  for (const declaration of flow.aliasDeclarations) {
    const authored = host.ast.typeNode(declaration);
    if (authored !== undefined) {
      directContext = false;
      add(resolveNodeWithState(authored, host.semanticsFor(authored).sourceFile, nextState(state)));
    }
  }
  for (const { use, owner, argument } of uses) {
    directContext = false;
    if (use.role === "argument") {
      if (argument !== undefined) add(argumentDestination(argument, use.reference, false));
      continue;
    }
    if (owner === undefined) continue;
    const authored = host.ast.typeNode(owner);
    const ownerQueries = host.semanticsFor(owner);
    let returned: TargetTypeRef | undefined;
    if (authored !== undefined) returned = resolveNodeWithState(authored, ownerQueries.sourceFile, nextState(state));
    else {
      if (argument !== undefined) {
        add(argumentDestination(argument, owner, true));
        continue;
      }
      const contextual = ownerQueries.types.contextualValueSelection(owner);
      const callable = contextual.kind === "selected" ? ownerQueries.types.callable(contextual.component.selectedType) : undefined;
      if (callable?.result.authoredTypeNode !== undefined) {
        const formal = resolveNodeWithState(callable.result.authoredTypeNode,
          ownerQueries.sourceFile, nextState(state));
        const native = host.ast.hasModifierKind(owner, "async") ? getCsharpTaskResultTargetType(formal) : formal;
        if (destinationElement(native) !== undefined) returned = resolveSourceTypeComponentEvidence(
          callable.result, ownerQueries, nextState(state));
      }
    }
    add(host.ast.hasModifierKind(owner, "async") ? getCsharpTaskResultTargetType(returned) : returned);
  }
  if (destinations.length === 0 && directContext) {
    const contextual = queries.types.contextualValueSelection(expression);
    if (contextual.kind === "selected") add(resolveSourceTypeComponentEvidence(contextual.component, queries, nextState(state)));
  }
  const selected = destinations[0];
  if (selected === undefined) return { kind: "unavailable" };
  return destinations.some(destination => !targetTypeRefEquals(destination, selected))
    ? { kind: "rejected", reason: "Array construction requires one consistent actual native element destination across its storage and uses." }
    : { kind: "resolved", carrier: selected };
}
