import type { Node, SourceFile } from "@tsonic/tsts";
import {
  HasSourceKind,
  HasSyntacticModifier,
  KindBlock,
  ModifierFlagsAsync,
  ObjectLiteralProperty_SourceName,
} from "@tsonic/target-api/source";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  targetUseSiteRef,
} from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/context.js";
import {
    csharpSourceArgumentExpectedType,
    csharpTargetParameterValueType,
  getCsharpDelegateSignature,
  getCsharpArrayLiteralElementTargetType,
  getCsharpGeneratorProtocol,
  getCsharpTaskResultTargetType,
  isCsharpJsValueTargetType,
  csharpPropertySourceMemberKey,
  csharpWellKnownSymbolSourceMemberKey,
  resolveCsharpObjectShapeMemberBySourceKey,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpTargetOperationClassifications,
} from "../operations/index.js";
import type {
  CsharpSourceEvidenceIndex,
} from "../source-evidence/index.js";
import type {
  CsharpObjectShapeClassifications,
} from "../object-shapes/index.js";
import type {
  CsharpCallableContractIndex,
} from "../callables/index.js";
import type {
  CsharpExpectedTypeClassifications,
  CsharpExpectedTypeIssue,
} from "./model.js";
import {
  selectCsharpBinaryOperation,
} from "../../policy/operations/index.js";
import type {
  CsharpTargetCallSelection,
} from "../../policy/members/index.js";
import {
  csharpTargetRepresentationContractId,
} from "../../target-model/contracts/identities.js";

const expectedBinaryKey = createTargetClassificationKey<
  ReturnType<typeof selectCsharpBinaryOperation>
>(
  "csharp.expected-type.binary-operation",
  csharpBinarySelectionsEqual,
);
const maximumExpectedTargetUses = 1_048_576;

export function analyzeCsharpExpectedTypes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  callables: CsharpCallableContractIndex,
): CsharpExpectedTypeClassifications {
  type ExpectedTypeStrength = "contextual" | "required";
  interface ExpectedTypeUse {
    readonly targetType: TargetTypeRef;
    readonly strength: ExpectedTypeStrength;
  }
  const byExpression = new WeakMap<Node, Map<string, ExpectedTypeUse>>();
  const targetTypes = new Map<string, TargetTypeRef>();
  const pending: {
    readonly expression: Node;
    readonly targetType: TargetTypeRef;
    readonly strength: ExpectedTypeStrength;
  }[] = [];
  const issues: CsharpExpectedTypeIssue[] = [];
  const binaryUses = createTargetUseClassificationBuilder();
  let expectedTargetUseCount = 0;
  const callableReturnTargets = new WeakMap<Node, TargetTypeRef>();
  const contextualCallables = new Set<Node>();

  for (const callable of callables.declarationContracts) {
    const targetType = returnExpressionTarget(callable);
    if (targetType !== undefined) {
      callableReturnTargets.set(callable.sourceDeclaration, targetType);
    }
  }

  const record = (
    expression: Node | undefined,
    targetType: TargetTypeRef | undefined,
    strength: ExpectedTypeStrength,
  ): void => {
    if (expression === undefined || targetType === undefined) {
      return;
    }
    if (
      isCallableBoundary(expression) &&
      getCsharpDelegateSignature(targetType) !== undefined
    ) {
      contextualCallables.add(expression);
    }
    const key = targetTypeRefKey(targetType);
    let types = byExpression.get(expression);
    if (types === undefined) {
      types = new Map();
      byExpression.set(expression, types);
    }
    const previous = types.get(key);
    if (previous?.strength === "required" || previous?.strength === strength) {
      return;
    }
    if (previous === undefined) {
      expectedTargetUseCount += 1;
    }
    if (previous === undefined && expectedTargetUseCount > maximumExpectedTargetUses) {
      if (issues.length === 0) {
        issues.push(Object.freeze({
          node: expression,
          code: "CSHARP_EXPECTED_TARGET_USE_LIMIT_EXCEEDED",
          message:
            `C# expected-target analysis exceeds the ${maximumExpectedTargetUses}-use limit.`,
        }));
      }
      return;
    }
    targetTypes.set(key, targetType);
    types.set(key, Object.freeze({ targetType, strength }));
    pending.push(Object.freeze({ expression, targetType, strength }));
  };

  const callableTargets = new WeakMap<Node, TargetTypeRef>();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
  }
  let processedPending = 0;
  let callableStateChanged = true;
  while (processedPending < pending.length || callableStateChanged) {
    while (processedPending < pending.length) {
      const classification = pending[processedPending++]!;
      propagateExpectedType(
        classification.expression,
        classification.targetType,
        classification.strength,
      );
    }
    callableStateChanged = refreshCallableTargets();
    if (callableStateChanged) {
      for (const sourceFile of policy.sourceFiles) {
        visit(sourceFile, sourceFile);
      }
    }
  }
  const binaryFacts = binaryUses.seal();

  const classifications: CsharpExpectedTypeClassifications = {
    issues: Object.freeze(issues),
    targetTypes: Object.freeze([...targetTypes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, type]) => type)),
    forExpression(expression) {
      return Object.freeze([...(byExpression.get(expression)?.entries() ?? [])]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, use]) => use.targetType));
    },
    storageTypesForExpression(expression) {
      const uses = [...(byExpression.get(expression)?.entries() ?? [])]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, use]) => use);
      const required = uses.filter((use) => use.strength === "required");
      return Object.freeze((required.length > 0 ? required : uses).map((use) =>
        use.targetType));
    },
    callableTarget(expression) {
      return callableTargets.get(expression);
    },
    binaryExpected(expression, targetType) {
      return binaryFacts.get(
        expectedBinaryUse(expression, targetType),
        expectedBinaryKey,
      );
    },
  };
  return Object.freeze(classifications);

  function returnExpressionTarget(
    callable: CsharpCallableContractIndex["contracts"][number],
    callableTarget?: TargetTypeRef,
  ): TargetTypeRef | undefined {
    const selectedReturnType = getCsharpDelegateSignature(callableTarget)
      ?.returnType;
    if (selectedReturnType !== undefined) {
      return HasSyntacticModifier(
          policy.ast,
          callable.sourceDeclaration,
          ModifierFlagsAsync,
        )
        ? getCsharpTaskResultTargetType(selectedReturnType)
        : selectedReturnType;
    }
    if (evidence.generator(callable.sourceDeclaration) !== undefined) {
      return getCsharpGeneratorProtocol(callable.returnType)?.returnType;
    }
    return HasSyntacticModifier(
        policy.ast,
        callable.sourceDeclaration,
        ModifierFlagsAsync,
      )
      ? getCsharpTaskResultTargetType(callable.returnType)
      : callable.returnType;
  }

  function refreshCallableTargets(): boolean {
    let changed = false;
    for (const declaration of contextualCallables) {
      const contextualTargets = [
        ...(byExpression.get(declaration)?.values() ?? []),
      ].filter((use) =>
        getCsharpDelegateSignature(use.targetType) !== undefined);
      const requiredTargets = contextualTargets.filter((use) =>
        use.strength === "required");
      const effectiveTargets = requiredTargets.length > 0
        ? requiredTargets
        : contextualTargets;
      const targetType = effectiveTargets.length === 1
        ? effectiveTargets[0]!.targetType
        : undefined;
      const previousTarget = callableTargets.get(declaration);
      if (
        previousTarget === undefined
          ? targetType !== undefined
          : targetType === undefined ||
            !targetTypeRefEquals(previousTarget, targetType)
      ) {
        changed = true;
        if (targetType === undefined) {
          callableTargets.delete(declaration);
        } else {
          callableTargets.set(declaration, targetType);
          targetTypes.set(targetTypeRefKey(targetType), targetType);
        }
      }
    }
    for (const callable of callables.declarationContracts) {
      const declaration = callable.sourceDeclaration;
      const targetType = callableTargets.get(declaration);
      const returnTarget = returnExpressionTarget(callable, targetType);
      const previousReturnTarget = callableReturnTargets.get(declaration);
      if (
        previousReturnTarget === undefined
          ? returnTarget !== undefined
          : returnTarget === undefined ||
            !targetTypeRefEquals(previousReturnTarget, returnTarget)
      ) {
        changed = true;
        if (returnTarget === undefined) {
          callableReturnTargets.delete(declaration);
        } else {
          callableReturnTargets.set(declaration, returnTarget);
          targetTypes.set(targetTypeRefKey(returnTarget), returnTarget);
        }
      }
    }
    return changed;
  }

  function visit(node: Node, sourceFile: SourceFile): void {
    recordInitializer(node);
    recordReturnExpression(node);
    recordExpressionBodyReturn(node);
    const contextualType = evidence.contextualType(node);
    record(
      node,
      contextualType === undefined
        ? undefined
        : evidence.targetType(contextualType, sourceFile),
      "contextual",
    );
    recordIntrinsicArrayLiteralElements(node);

    const call = operations.call(node);
    if (call?.target?.kind === "resolved") {
      recordSelectedCallReceiver(call.target, "required");
      recordSelectedCallArguments(
        call.target.source.sourceArguments,
        call.target.call.arguments,
        "required",
      );
    } else if (call?.source !== undefined) {
      for (let index = 0; index < call.source.sourceArgumentBindings.length; index += 1) {
        const binding = call.source.sourceArgumentBindings[index]!;
        record(
          call.source.sourceArguments[binding.sourceArgumentIndex]?.expression,
          call.sourceArgumentParameterTypes?.[index],
          "required",
        );
      }
    }

    const construction = operations.construction(node);
    if (construction?.target?.kind === "resolved") {
      recordSelectedCallReceiver(construction.target, "required");
      recordSelectedCallArguments(
        construction.target.source.sourceArguments,
        construction.target.call.arguments,
        "required",
      );
    } else if (construction?.target?.kind === "source-owned") {
      for (
        let index = 0;
        index < construction.target.source.sourceArgumentBindings.length;
        index += 1
      ) {
        const binding = construction.target.source.sourceArgumentBindings[index]!;
        record(
          construction.target.source.sourceArguments[
            binding.sourceArgumentIndex
          ]?.expression,
          construction.sourceArgumentParameterTypes?.[index],
          "required",
        );
      }
    }

    const binary = operations.binary(node)?.target;
    if (binary?.kind === "resolved") {
      record(binary.left, binary.leftInputType, "required");
      record(binary.right, binary.rightInputType, "required");
    }
    const unary = operations.unary(node)?.target;
    if (unary?.kind === "resolved") {
      record(unary.operand, unary.operandType, "required");
    }

    const element = operations.element(node)?.target;
    if (element?.kind === "resolved") {
      const argument = policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression;
      record(
        argument,
        element.targetMember.parameters[element.targetParameterIndex]?.type,
        "required",
      );
    } else if (element?.kind === "project-indexer") {
      record(
        policy.ast.as.AsElementAccessExpression(node)?.ArgumentExpression,
        element.keyType,
        "required",
      );
    }

    const typedLocation = operations.typedLocation(node);
    if (typedLocation?.kind === "location-allocate") {
      record(typedLocation.initialExpression, typedLocation.pointeeType, "required");
    } else if (typedLocation?.kind === "location-store") {
      record(typedLocation.valueExpression, typedLocation.pointeeType, "required");
    }

    const nativePointer = operations.nativePointer(node);
    if (nativePointer?.kind === "store") {
      record(nativePointer.valueExpression, nativePointer.pointeeType, "required");
    } else if (nativePointer?.kind === "offset") {
      record(nativePointer.offsetExpression, nativePointer.offsetType, "required");
    }

    const iteration = operations.iteration(node);
    if (iteration?.kind === "resolved") {
      record(
        policy.ast.as.AsForInOrOfStatement(node)?.Expression,
        iteration.iterableType,
        "required",
      );
    }

    const yieldSelection = evidence.yield(node);
    if (yieldSelection?.operand !== undefined) {
      const expectedYieldType = yieldSelection.yieldKind === "delegate"
        ? evidence.yieldTargetType(node)
        : getCsharpGeneratorProtocol(
            evidence.generatorTargetType(yieldSelection.generator.declaration),
          )?.yieldType;
      record(
        yieldSelection.operand.expression,
        expectedYieldType,
        "required",
      );
    }

    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile);
      }
    });
  }

  function recordReturnExpression(node: Node): void {
    if (!policy.ast.is.IsReturnStatement(node)) {
      return;
    }
    const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
    if (expression === undefined) {
      return;
    }
    for (
      let owner = policy.ast.parent(node);
      owner !== undefined;
      owner = policy.ast.parent(owner)
    ) {
      const targetType = callableReturnTargets.get(owner);
      if (targetType !== undefined) {
        record(expression, targetType, "required");
        return;
      }
      if (isCallableBoundary(owner)) {
        return;
      }
    }
  }

  function recordExpressionBodyReturn(node: Node): void {
    if (!policy.ast.is.IsArrowFunction(node)) {
      return;
    }
    const body = policy.ast.as.AsArrowFunction(node)?.Body;
    const targetType = callableReturnTargets.get(node);
    if (
      body !== undefined &&
      targetType !== undefined &&
      !HasSourceKind(policy.ast, body, KindBlock)
    ) {
      record(body, targetType, "required");
    }
  }

  function isCallableBoundary(node: Node): boolean {
    return policy.ast.is.IsFunctionDeclaration(node) ||
      policy.ast.is.IsFunctionExpression(node) ||
      policy.ast.is.IsArrowFunction(node) ||
      policy.ast.is.IsMethodDeclaration(node) ||
      policy.ast.is.IsGetAccessorDeclaration(node) ||
      policy.ast.is.IsSetAccessorDeclaration(node) ||
      policy.ast.is.IsConstructorDeclaration(node);
  }

  function recordInitializer(node: Node): void {
    const typeNode = policy.ast.typeNode(node);
    const initializer = policy.ast.is.IsVariableDeclaration(node)
      ? policy.ast.as.AsVariableDeclaration(node)?.Initializer
      : policy.ast.is.IsParameterDeclaration(node)
        ? policy.ast.as.AsParameterDeclaration(node)?.Initializer
        : policy.ast.is.IsPropertyDeclaration(node)
          ? policy.ast.as.AsPropertyDeclaration(node)?.Initializer
          : policy.ast.is.IsBindingElement(node)
            ? policy.ast.as.AsBindingElement(node)?.Initializer
            : policy.ast.is.IsEnumMember(node)
              ? policy.ast.as.AsEnumMember(node)?.Initializer
              : undefined;
    record(
      initializer,
      typeNode === undefined
        ? evidence.storageTargetType(node)
        : evidence.nodeTargetType(typeNode),
      typeNode === undefined ? "contextual" : "required",
    );
  }

  function propagateExpectedType(
    expression: Node,
    targetType: TargetTypeRef,
    strength: ExpectedTypeStrength,
  ): void {
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      record(
        policy.ast.as.AsParenthesizedExpression(expression)?.Expression,
        targetType,
        strength,
      );
      return;
    }
    if (policy.ast.is.IsSatisfiesExpression(expression)) {
      record(
        policy.ast.as.AsSatisfiesExpression(expression)?.Expression,
        targetType,
        strength,
      );
      return;
    }
    if (policy.ast.is.IsConditionalExpression(expression)) {
      const conditional = policy.ast.as.AsConditionalExpression(expression);
      record(conditional?.WhenTrue, targetType, strength);
      record(conditional?.WhenFalse, targetType, strength);
      return;
    }
    if (policy.ast.is.IsBinaryExpression(expression)) {
      const expectedSelection = selectCsharpBinaryOperation(
        policy,
        expression,
        evidence.nodeTargetType,
        targetType,
      );
      if (expectedSelection !== undefined) {
        const result = binaryUses.set(
          expectedBinaryUse(expression, targetType),
          expectedBinaryKey,
          expectedSelection,
        );
        if (result.kind === "conflict") {
          throw new Error(
            `Conflicting target-use classification '${expectedBinaryKey.id}'.`,
          );
        }
      }
      const selection = expectedSelection ?? operations.binary(expression)?.target;
      if (selection?.kind === "resolved") {
        record(selection.left, selection.leftInputType, strength);
        record(selection.right, selection.rightInputType, strength);
        if (selection.sourceOperator === "??") {
          record(selection.right, targetType, strength);
        }
      }
      return;
    }
    if (policy.ast.is.IsArrayLiteralExpression(expression)) {
      recordArrayLiteralElements(expression, targetType, strength);
      return;
    }
    if (policy.ast.is.IsObjectLiteralExpression(expression)) {
      if (isCsharpJsValueTargetType(targetType)) {
        for (const property of policy.ast.properties(expression)) {
          if (property === undefined) {
            continue;
          }
          if (policy.ast.is.IsPropertyAssignment(property)) {
            record(
              policy.ast.as.AsPropertyAssignment(property)?.Initializer,
              targetType,
              strength,
            );
          } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
            record(policy.ast.name(property), targetType, strength);
          }
        }
        return;
      }
      const expectedShape = objectShapes.resolveTarget(targetType);
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
              const symbol = evidence.wellKnownSymbol(propertyName);
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
          );
        } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
          record(policy.ast.name(property), selected.member.type, strength);
        }
      }
    }
  }

  function recordIntrinsicArrayLiteralElements(node: Node): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    const targetType = operations.resultType(node) ??
      evidence.storageTargetType(node) ??
      evidence.nodeTargetType(node);
    if (targetType !== undefined) {
      recordArrayLiteralElements(node, targetType, "contextual");
    }
  }

  function recordArrayLiteralElements(
    expression: Node,
    targetType: TargetTypeRef,
    strength: ExpectedTypeStrength,
  ): void {
    const elements = policy.ast.elements(expression);
    if (targetType.kind === "tuple") {
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        if (
          element !== undefined &&
          !policy.ast.is.IsSpreadElement(element)
        ) {
          record(element, targetType.elements[index], strength);
        }
      }
      return;
    }
    const elementTarget = getCsharpArrayLiteralElementTargetType(targetType);
    if (elementTarget === undefined) {
      return;
    }
    for (const element of elements) {
      if (
        element !== undefined &&
        !policy.ast.is.IsSpreadElement(element)
      ) {
        record(element, elementTarget, strength);
      }
    }
  }

  function expectedBinaryUse(
    expression: Node,
    targetType: TargetTypeRef,
  ) {
    return targetUseSiteRef(
      expression,
      "binary-expected-result",
      csharpTargetRepresentationContractId,
      targetTypeRefKey(targetType),
    );
  }

  function recordSelectedCallArguments(
    sourceArguments: readonly { readonly expression: Node }[],
    arguments_: readonly {
      readonly sourceArgumentIndex: number;
      readonly targetParameter: Parameters<
        typeof csharpTargetParameterValueType
      >[0];
      readonly sourceForm: Parameters<
        typeof csharpTargetParameterValueType
      >[1];
    }[],
    strength: ExpectedTypeStrength,
  ): void {
    for (const argument of arguments_) {
      record(
        sourceArguments[argument.sourceArgumentIndex]?.expression,
        csharpSourceArgumentExpectedType(
          argument.targetParameter,
          argument.sourceForm,
        ),
        strength,
      );
    }
  }

  function recordSelectedCallReceiver(
    selection: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>,
    strength: ExpectedTypeStrength,
  ): void {
    if (selection.call.receiver.kind !== "target-parameter") {
      return;
    }
    const parameter = selection.call.targetMember.parameters[
      selection.call.receiver.targetParameterIndex
    ];
    record(
      selection.source.sourceReceiver?.expression,
      parameter === undefined
        ? undefined
        : csharpTargetParameterValueType(parameter, "value"),
      strength,
    );
  }
}

function csharpBinarySelectionsEqual(
  left: ReturnType<typeof selectCsharpBinaryOperation>,
  right: ReturnType<typeof selectCsharpBinaryOperation>,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "rejected" || right.kind === "rejected") {
    return left.kind === "rejected" &&
      right.kind === "rejected" &&
      left.reason === right.reason;
  }
  return left.sourceOperator === right.sourceOperator &&
    left.left === right.left &&
    left.right === right.right &&
    left.targetOperation.kind === right.targetOperation.kind &&
    (
      left.targetOperation.kind === "operator" &&
        right.targetOperation.kind === "operator"
        ? left.targetOperation.operator === right.targetOperation.operator
        : left.targetOperation.kind === "nullish-test" &&
            right.targetOperation.kind === "nullish-test" &&
            left.targetOperation.operand === right.targetOperation.operand &&
            left.targetOperation.negated === right.targetOperation.negated
    ) &&
    targetTypeRefEquals(left.leftType, right.leftType) &&
    targetTypeRefEquals(left.rightType, right.rightType) &&
    targetTypeRefEquals(left.leftInputType, right.leftInputType) &&
    targetTypeRefEquals(left.rightInputType, right.rightInputType) &&
    targetTypeRefEquals(left.resultType, right.resultType) &&
    left.expectedResultCompatible === right.expectedResultCompatible;
}
