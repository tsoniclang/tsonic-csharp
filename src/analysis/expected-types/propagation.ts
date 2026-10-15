import type { Node } from "@tsonic/tsts";
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
  CsharpExpectedUseDemand,
} from "./model.js";

export type CsharpExpectedBinarySelection = ReturnType<typeof selectCsharpBinaryOperation>;

export interface CsharpExpectedTypePropagation {
  readonly propagate: (pending: CsharpExpectedTypePending) => void;
  readonly recordIntrinsicArrayLiteralElements: (node: Node) => void;
  readonly recordIntrinsicObjectLiteralMembers: (node: Node) => void;
  readonly seal: () => {
    readonly arrayLiteralCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
    readonly intrinsicTarget: (expression: Node, targetType: TargetTypeRef) => boolean;
  };
}

export function createCsharpExpectedTypePropagation(
  input: CsharpExpectedTypeAnalysisInput,
  collection: CsharpExpectedUseCollection,
  expectedBinary: (expression: Node, targetType: TargetTypeRef) => CsharpExpectedBinarySelection,
): CsharpExpectedTypePropagation {
  const { policy, evidence, operations, objectShapes, valueReadStages } = input;
  const record = collection.record;
  const arrayCarriers = new WeakMap<Node, Map<string, TargetTypeRef>>();
  const intrinsicTargets = new WeakMap<Node, Set<string>>();

  return Object.freeze({
    propagate,
    recordIntrinsicArrayLiteralElements,
    recordIntrinsicObjectLiteralMembers,
    seal: () => Object.freeze({
      arrayLiteralCarrier: (expression: Node, targetType: TargetTypeRef) =>
        arrayCarriers.get(expression)?.get(targetTypeRefKey(targetType)),
      intrinsicTarget: (expression: Node, targetType: TargetTypeRef) =>
        intrinsicTargets.get(expression)?.has(targetTypeRefKey(targetType)) === true,
    }),
  });

  function forwarded(owner: Node, targetType: TargetTypeRef, slot: CsharpNativeUseSlot): CsharpExpectedUseDemand {
    return { owner, slot, forwardedFrom: targetType };
  }

  function childPositions(owner: Node): ReadonlyMap<Node, number> {
    const positions = new Map<Node, number>();
    for (const [index, child] of policy.ast.children(owner).entries()) {
      if (child !== undefined) positions.set(child, index);
    }
    return positions;
  }

  function positioned(
    positions: ReadonlyMap<Node, number>,
    child: Node,
    demand: (index: number) => CsharpExpectedUseDemand,
  ): CsharpExpectedUseDemand | undefined {
    const index = positions.get(child);
    return index === undefined ? undefined : demand(index);
  }

  function propagate(pending: CsharpExpectedTypePending): void {
    const { expression, targetType, strength, exactInteger } = pending;
    if (policy.ast.isConstAssertion(expression)) {
      const assertion = policy.ast.is.IsAsExpression(expression)
        ? policy.ast.as.AsAsExpression(expression) : policy.ast.as.AsTypeAssertion(expression);
      record(assertion?.Expression, targetType, strength,
        forwarded(expression, targetType, { kind: "operand", position: "only" }), exactInteger);
      return;
    }
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      record(
        policy.ast.as.AsParenthesizedExpression(expression)?.Expression,
        targetType,
        strength,
        forwarded(expression, targetType, { kind: "operand", position: "only" }),
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsSatisfiesExpression(expression)) {
      record(
        policy.ast.as.AsSatisfiesExpression(expression)?.Expression,
        targetType,
        strength,
        forwarded(expression, targetType, { kind: "operand", position: "only" }),
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsConditionalExpression(expression)) {
      const conditional = policy.ast.as.AsConditionalExpression(expression);
      record(conditional?.WhenTrue, targetType, strength,
        forwarded(expression, targetType, { kind: "branch", branch: "true" }), exactInteger);
      record(conditional?.WhenFalse, targetType, strength,
        forwarded(expression, targetType, { kind: "branch", branch: "false" }), exactInteger);
      return;
    }
    if (policy.ast.is.IsBinaryExpression(expression)) {
      const expectedSelection = expectedBinary(expression, targetType);
      const selection = expectedSelection ?? operations.binaryOperation.get(expression)?.target;
      if (selection?.kind === "resolved") {
        record(selection.left, selection.leftInputType, strength, undefined);
        if (selection.targetOperation.kind === "conditional-value" && selection.targetOperation.branch !== "right") {
          record(selection.left, selection.resultType, strength, undefined);
        }
        if (selection.targetOperation.kind !== "conditional-value" || selection.targetOperation.branch !== "left") {
          record(selection.right, selection.rightInputType, strength, undefined);
        }
        if (selection.sourceOperator === "??") {
          record(selection.right, targetType, strength, undefined);
        }
      }
      return;
    }
    if (policy.ast.is.IsArrayLiteralExpression(expression)) {
      recordArrayLiteralElements(expression, targetType, strength);
      return;
    }
    if (policy.ast.is.IsObjectLiteralExpression(expression)) {
      recordObjectLiteralMembers(expression, targetType, strength);
    }
  }

  function recordObjectLiteralMembers(
    expression: Node,
    targetType: TargetTypeRef,
    strength: CsharpExpectedTypeStrength,
  ): void {
    const construction = objectShapes.resolveObjectLiteralUnionCarrier(expression, targetType) ?? targetType;
    const carrier = getCsharpNullableElementTargetType(construction) ?? construction;
    const indexedValueType = isCsharpJsValueTargetType(carrier) ? carrier
      : isCsharpRecordDictionaryTargetType(carrier) && carrier.kind === "target-named"
      ? carrier.typeArguments?.[1] : undefined;
    const positions = childPositions(expression);
    const member = (property: Node) => positioned(positions, property, index => forwarded(expression, targetType, { kind: "member", index }));
    if (indexedValueType !== undefined) {
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
    for (const property of policy.ast.properties(expression)) {
      if (property === undefined) {
        continue;
      }
      const propertyName = policy.ast.name(property);
      const selected = propertyName !== undefined &&
          policy.ast.is.IsComputedPropertyName(propertyName)
        ? (() => {
            const symbol = evidence.wellKnownSymbol.get(propertyName);
            return symbol === undefined
              ? undefined
              : resolveCsharpObjectShapeMemberBySourceKey(
                  resolution.shape,
                  csharpWellKnownSymbolSourceMemberKey(symbol.kind),
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
    const element = (node: Node) => positioned(positions, node, index => forwarded(expression, targetType, { kind: "element", index }));
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
