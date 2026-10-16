import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { ObjectLiteralProperty_SourceName } from "@tsonic/target-api/source";
import { selectCsharpArrayLiteralCarrier } from "../../policy/types/collections/literal-construction.js";
import {
  getCsharpNullableElementTargetType,
  getCsharpArrayLiteralElementTargetType,
  isCsharpJsValueTargetType,
  isCsharpRecordDictionaryTargetType,
  csharpPropertySourceMemberKey,
  csharpWellKnownSymbolSourceMemberKey,
  resolveCsharpObjectShapeMemberBySourceKey,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { selectCsharpBinaryOperation } from "../../policy/operations/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";
import type { CsharpExpectedUseCollection } from "./collection.js";
import type {
  CsharpExpectedTypeAnalysisInput,
  CsharpExpectedTypePending,
  CsharpExpectedTypeStrength,
  CsharpExpectedUseSiteDemand,
} from "./model.js";

export type CsharpExpectedBinarySelection = ReturnType<typeof selectCsharpBinaryOperation>;

export interface CsharpExpectedTypePropagation {
  readonly propagate: (pending: CsharpExpectedTypePending) => void;
  readonly recordIntrinsicArrayLiteralElements: (node: Node) => void;
  readonly recordIntrinsicObjectLiteralMembers: (node: Node) => void;
  readonly seal: () => {
    readonly arrayLiteralCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
    readonly constructionCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
    readonly intrinsicTarget: (expression: Node, targetType: TargetTypeRef) => boolean;
  };
}

export function createCsharpExpectedTypePropagation(
  input: CsharpExpectedTypeAnalysisInput,
  collection: CsharpExpectedUseCollection,
  expectedBinary: (expression: Node, targetType: TargetTypeRef) => CsharpExpectedBinarySelection,
): CsharpExpectedTypePropagation {
  const { policy, operations, objectShapes, valueReadStages } = input;
  const record = collection.record;
  const arrayCarriers = new WeakMap<Node, Map<string, TargetTypeRef>>();
  const objectCarriers = new WeakMap<Node, Map<string, TargetTypeRef>>();
  const intrinsicTargets = new WeakMap<Node, Set<string>>();
  const positionsByOwner = new WeakMap<Node, ReadonlyMap<Node, number>>();

  return Object.freeze({
    propagate,
    recordIntrinsicArrayLiteralElements,
    recordIntrinsicObjectLiteralMembers,
    seal: () => Object.freeze({
      arrayLiteralCarrier: (expression: Node, targetType: TargetTypeRef) =>
        arrayCarriers.get(expression)?.get(targetTypeRefKey(targetType)),
      constructionCarrier: (expression: Node, targetType: TargetTypeRef) =>
        (arrayCarriers.get(expression) ?? objectCarriers.get(expression))?.get(targetTypeRefKey(targetType)),
      intrinsicTarget: (expression: Node, targetType: TargetTypeRef) =>
        intrinsicTargets.get(expression)?.has(targetTypeRefKey(targetType)) === true,
    }),
  });

  function forwarded(owner: Node, slot: CsharpNativeUseSlot, parent?: TargetUseSiteRef): CsharpExpectedUseSiteDemand | undefined {
    return parent === undefined ? undefined : { owner, slot, forwardedFrom: parent };
  }

  function childPositions(owner: Node): ReadonlyMap<Node, number> {
    const existing = positionsByOwner.get(owner);
    if (existing !== undefined) return existing;
    const positions = new Map<Node, number>();
    for (const [index, child] of policy.ast.children(owner).entries()) {
      if (child !== undefined) positions.set(child, index);
    }
    positionsByOwner.set(owner, positions);
    return positions;
  }

  function positioned(
    positions: ReadonlyMap<Node, number>,
    child: Node,
    demand: (index: number) => CsharpExpectedUseSiteDemand | undefined,
  ): CsharpExpectedUseSiteDemand | undefined {
    const index = positions.get(child);
    return index === undefined ? undefined : demand(index);
  }

  function propagate(pending: CsharpExpectedTypePending): void {
    const { expression, targetType, strength, exactInteger } = pending;
    if (policy.ast.isConstAssertion(expression)) {
      const assertion = policy.ast.is.IsAsExpression(expression)
        ? policy.ast.as.AsAsExpression(expression) : policy.ast.as.AsTypeAssertion(expression);
      record(assertion?.Expression, targetType, strength,
        forwarded(expression, { kind: "operand", position: "only" }, pending.site), exactInteger);
      return;
    }
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      record(
        policy.ast.as.AsParenthesizedExpression(expression)?.Expression,
        targetType,
        strength,
        forwarded(expression, { kind: "operand", position: "only" }, pending.site),
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsSatisfiesExpression(expression)) {
      record(
        policy.ast.as.AsSatisfiesExpression(expression)?.Expression,
        targetType,
        strength,
        forwarded(expression, { kind: "operand", position: "only" }, pending.site),
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsConditionalExpression(expression)) {
      const conditional = policy.ast.as.AsConditionalExpression(expression);
      record(conditional?.WhenTrue, targetType, strength,
        forwarded(expression, { kind: "branch", branch: "true" }, pending.site), exactInteger);
      record(conditional?.WhenFalse, targetType, strength,
        forwarded(expression, { kind: "branch", branch: "false" }, pending.site), exactInteger);
      return;
    }
    if (policy.ast.is.IsBinaryExpression(expression)) {
      const expectedSelection = expectedBinary(expression, targetType);
      const selection = expectedSelection ?? operations.binaryOperation.get(expression)?.target;
      if (selection?.kind === "resolved") {
        record(selection.left, selection.leftInputType, strength, forwarded(expression, { kind: "operand", position: "left" }, pending.site));
        if (selection.targetOperation.kind === "conditional-value" && selection.targetOperation.branch !== "right") {
          record(selection.left, selection.resultType, strength, forwarded(expression, { kind: "present-payload" }, pending.site));
        }
        if (selection.targetOperation.kind !== "conditional-value" || selection.targetOperation.branch !== "left") {
          record(selection.right, selection.rightInputType, strength, forwarded(expression, { kind: "operand", position: "right" }, pending.site));
        }
        if (selection.sourceOperator === "??") {
          record(selection.right, targetType, strength, forwarded(expression, { kind: "operand", position: "right" }, pending.site));
        }
      }
      return;
    }
    if (policy.ast.is.IsArrayLiteralExpression(expression)) {
      recordArrayLiteralElements(expression, targetType, strength, pending.site);
      return;
    }
    if (policy.ast.is.IsObjectLiteralExpression(expression)) {
      recordObjectLiteralMembers(expression, targetType, strength, pending.site);
    }
  }

  function recordObjectLiteralMembers(
    expression: Node,
    targetType: TargetTypeRef,
    strength: CsharpExpectedTypeStrength,
    parent?: TargetUseSiteRef,
  ): void {
    const construction = objectShapes.resolveObjectLiteralUnionCarrier(expression, targetType) ?? targetType;
    const carrier = getCsharpNullableElementTargetType(construction) ?? construction;
    const indexedValueType = isCsharpJsValueTargetType(carrier) ? carrier
      : isCsharpRecordDictionaryTargetType(carrier) && carrier.kind === "target-named"
      ? carrier.typeArguments?.[1] : undefined;
    const positions = childPositions(expression);
    const member = (property: Node) => positioned(positions, property, index => forwarded(expression, { kind: "member", index }, parent));
    if (indexedValueType !== undefined) {
      if (isCsharpRecordDictionaryTargetType(carrier)) recordObjectCarrier(expression, targetType, carrier);
      for (const property of policy.ast.properties(expression)) {
        if (property === undefined) {
          continue;
        }
        if (policy.ast.is.IsPropertyAssignment(property)) {
          record(
            policy.ast.as.AsPropertyAssignment(property)?.Initializer,
            indexedValueType,
            strength,
            member(property),
          );
        } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
          record(policy.ast.name(property), indexedValueType, strength, member(property));
        }
      }
      return;
    }
    const expectedShape = objectShapes.resolveTarget(construction);
    const resolution = objectShapes.resolveObjectLiteralTargetShape(
      expectedShape,
      expression,
    );
    if (resolution?.kind !== "resolved") {
      return;
    }
    recordObjectCarrier(expression, targetType, resolution.shape.targetType);
    for (const property of policy.ast.properties(expression)) {
      if (property === undefined) {
        continue;
      }
      const propertyName = policy.ast.name(property);
      const selected = propertyName !== undefined &&
          (policy.ast.is.IsComputedPropertyName(propertyName) || policy.ast.is.IsNumericLiteral(propertyName))
        ? (() => {
            const selectedName = policy.semanticsFor(property).propertyNames.get(propertyName);
            return selectedName?.kind !== "resolved" && selectedName?.kind !== "well-known-symbol"
              ? undefined
              : resolveCsharpObjectShapeMemberBySourceKey(
                  resolution.shape,
                  selectedName.kind === "resolved" ? csharpPropertySourceMemberKey(selectedName.name)
                    : csharpWellKnownSymbolSourceMemberKey(selectedName.symbol),
                  "checked-object-literal-property",
                );
          })()
        : (() => {
            const sourceName = ObjectLiteralProperty_SourceName(
              policy.ast,
              property,
            );
            return sourceName.kind === "rejected"
              ? undefined
              : resolveCsharpObjectShapeMemberBySourceKey(
                  resolution.shape,
                  csharpPropertySourceMemberKey(sourceName.name),
                  "checked-object-literal-property",
                );
          })();
      if (selected?.kind !== "resolved") {
        continue;
      }
      if (policy.ast.is.IsPropertyAssignment(property)) {
        record(
          policy.ast.as.AsPropertyAssignment(property)?.Initializer,
          selected.member.type,
          strength,
          member(property),
          selected.member.exactNumericStorage === true,
        );
      } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
        record(policy.ast.name(property), selected.member.type, strength, member(property),
          selected.member.exactNumericStorage === true);
      }
    }
  }

  function recordObjectCarrier(expression: Node, targetType: TargetTypeRef, carrier: TargetTypeRef): void {
    const carriers = objectCarriers.get(expression) ?? new Map<string, TargetTypeRef>();
    carriers.set(targetTypeRefKey(targetType), carrier);
    objectCarriers.set(expression, carriers);
  }

  function recordIntrinsicObjectLiteralMembers(node: Node): void {
    if (!policy.ast.is.IsObjectLiteralExpression(node)) return;
    const resolution = objectShapes.resolveObjectLiteralTargetShape(objectShapes.resolveNode(node), node);
    if (resolution?.kind === "resolved") {
      markIntrinsic(node, resolution.shape.targetType);
      record(node, resolution.shape.targetType, "contextual", undefined);
    }
  }

  function recordIntrinsicArrayLiteralElements(node: Node): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    const targetType = valueReadStages.get(node)?.literalTarget;
    if (targetType !== undefined) {
      markIntrinsic(node, targetType);
      recordArrayLiteralElements(node, targetType, "contextual");
    }
  }

  function markIntrinsic(node: Node, targetType: TargetTypeRef): void {
    const targets = intrinsicTargets.get(node) ?? new Set<string>();
    targets.add(targetTypeRefKey(targetType));
    intrinsicTargets.set(node, targets);
  }

  function recordArrayLiteralElements(
    expression: Node,
    targetType: TargetTypeRef,
    strength: CsharpExpectedTypeStrength,
    parent?: TargetUseSiteRef,
  ): void {
    const carrier = selectCsharpArrayLiteralCarrier(targetType,
      valueReadStages.get(expression)?.operationValue, policy.typeDefinitions);
    if (carrier === undefined) return;
    let carriers = arrayCarriers.get(expression);
    if (carriers === undefined) {
      carriers = new Map();
      arrayCarriers.set(expression, carriers);
    }
    carriers.set(targetTypeRefKey(targetType), carrier);
    const elements = policy.ast.elements(expression);
    const positions = childPositions(expression);
    const element = (node: Node) => positioned(positions, node, index => forwarded(expression, { kind: "element", index }, parent));
    if (carrier.kind === "tuple") {
      for (let index = 0; index < elements.length; index += 1) {
        const node = elements[index];
        if (
          node !== undefined &&
          !policy.ast.is.IsSpreadElement(node)
        ) {
          record(node, carrier.elements[index], strength, element(node));
        }
      }
      return;
    }
    const elementTarget = getCsharpArrayLiteralElementTargetType(carrier);
    if (elementTarget === undefined) {
      return;
    }
    for (const node of elements) {
      if (
        node !== undefined &&
        !policy.ast.is.IsSpreadElement(node)
      ) {
        record(node, elementTarget, strength, element(node));
      }
    }
  }
}
