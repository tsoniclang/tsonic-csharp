import type { Node, SourceFile } from "@tsonic/tsts";
import { csharpCallableValueType } from "../callables/value-type.js";
import { selectCsharpArrayLiteralCarrier } from "../../policy/types/collections/literal-construction.js";
import {
  HasSourceKind,
  HasSyntacticModifier,
  isSourceCallableBodyBoundary,
  KindBlock,
  ModifierFlagsAsync,
  ObjectLiteralProperty_SourceName,
} from "@tsonic/target-api/source";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  targetUseSiteRef,
} from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  csharpSourceArgumentExpectedType,
  csharpTargetParameterValueType,
  getCsharpLambdaSignature,
  getCsharpDelegateSignature,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpArrayLiteralElementTargetType,
  getCsharpGeneratorProtocol,
  getCsharpTaskResultTargetType,
  isCsharpJsValueTargetType,
  isCsharpRecordDictionaryTargetType,
  csharpPropertySourceMemberKey,
  csharpWellKnownSymbolSourceMemberKey,
  resolveCsharpObjectShapeMemberBySourceKey,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type {
  CsharpObjectShapeClassifications,
} from "../objects/index.js";
import type {
  CsharpCallableContractIndex,
} from "../callables/index.js";
import type { CsharpExpectedTypeClassifications, CsharpExpectedTypeIssue } from "../../target-model/records/expected-types.js";
import {
  selectCsharpBinaryOperation,
} from "../../policy/operations/index.js";
import { csharpBinarySelectionsEqual } from "./binary-equality.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import {
  csharpTargetRepresentationContractId,
} from "../../target-model/identities/identities.js";
import { getCsharpMethodValue, rebindCsharpMethodValueTypeParameters } from "../../target-model/types/method-values.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpReturnContext } from "../../target-model/records/return-contexts.js";
import { selectCsharpAccessorReturnContext, selectCsharpCallableReturnContext } from "../callables/return-contexts.js";

const expectedBinaryKey = createTargetClassificationKey<
  ReturnType<typeof selectCsharpBinaryOperation>
>(
  "csharp.expected-type.binary-operation",
  csharpBinarySelectionsEqual,
);
const maximumExpectedTargetUses = 1_048_576;
const noExpectedTypes: readonly TargetTypeRef[] = Object.freeze([]);

export function analyzeCsharpExpectedTypes(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  callables: CsharpCallableContractIndex,
  valueReadStages: CsharpValueReadStageIndex,
  declarations: Pick<CsharpDeclarationClassifications, "returnContract">,
): CsharpExpectedTypeClassifications {
  type ExpectedTypeStrength = "contextual" | "required";
  interface ExpectedTypeUse {
    readonly targetType: TargetTypeRef;
    readonly strength: ExpectedTypeStrength;
    readonly exactInteger: boolean;
  }
  const byExpression = new WeakMap<Node, Map<string, ExpectedTypeUse>>();
  const expectedExpressions: Node[] = [];
  const expectedBinaryUses: { readonly expression: Node; readonly targetType: TargetTypeRef }[] = [];
  const targetTypes = new Map<string, TargetTypeRef>();
  const pending: {
    readonly expression: Node;
    readonly targetType: TargetTypeRef;
    readonly strength: ExpectedTypeStrength;
    readonly exactInteger: boolean;
  }[] = [];
  const issues: CsharpExpectedTypeIssue[] = [];
  const binaryUses = createTargetUseClassificationBuilder();
  let expectedTargetUseCount = 0;
  const returnContexts = new WeakMap<Node, CsharpReturnContext>();
  const contextualCallables = new Set<Node>();
  const arrayCarriers = new WeakMap<Node, Map<string, TargetTypeRef>>();

  for (const callable of callables.declarationContracts) {
    const context = selectCsharpCallableReturnContext(policy, evidence, callable);
    if (context !== undefined) {
      returnContexts.set(callable.sourceDeclaration, context);
    }
  }

  const record = (
    expression: Node | undefined,
    targetType: TargetTypeRef | undefined,
    strength: ExpectedTypeStrength,
    exactInteger = false,
  ): void => {
    if (expression === undefined || targetType === undefined) {
      return;
    }
    if (isSourceCallableBodyBoundary(policy.ast, expression)) {
      contextualCallables.add(expression);
    }
    const key = targetTypeRefKey(targetType);
    let types = byExpression.get(expression);
    if (types === undefined) {
      types = new Map();
      byExpression.set(expression, types);
      expectedExpressions.push(expression);
    }
    const previous = types.get(key);
    if ((previous?.strength === "required" || previous?.strength === strength) &&
      (!exactInteger || previous.exactInteger)) {
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
    const use = Object.freeze({ targetType, strength: previous?.strength === "required" ? "required" : strength,
      exactInteger: exactInteger || previous?.exactInteger === true });
    types.set(key, use);
    pending.push(Object.freeze({ expression, ...use }));
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
        classification.exactInteger,
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
  const expectedViews = new WeakMap<Node, {
    readonly all: readonly TargetTypeRef[];
    readonly required: readonly TargetTypeRef[];
    readonly storage: readonly TargetTypeRef[];
  }>();
  for (const expression of expectedExpressions) {
    const uses = [...(byExpression.get(expression)?.entries() ?? [])]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, use]) => use);
    const all = Object.freeze(uses.map(use => use.targetType));
    const required = Object.freeze(uses.filter(use => use.strength === "required").map(use => use.targetType));
    expectedViews.set(expression, Object.freeze({ all, required, storage: required.length > 0 ? required : all }));
  }
  const expectedBinaries = new WeakMap<Node, Map<string, NonNullable<ReturnType<typeof selectCsharpBinaryOperation>>>>();
  for (const { expression, targetType } of expectedBinaryUses) {
    const selection = binaryFacts.get(expectedBinaryUse(expression, targetType), expectedBinaryKey);
    if (selection === undefined) continue;
    let byTarget = expectedBinaries.get(expression);
    if (byTarget === undefined) {
      byTarget = new Map();
      expectedBinaries.set(expression, byTarget);
    }
    byTarget.set(targetTypeRefKey(targetType), selection);
  }

  const classifications: CsharpExpectedTypeClassifications = {
    issues: Object.freeze(issues),
    targetTypes: Object.freeze([...targetTypes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, type]) => type)),
    expectedType: Object.freeze({ get(expression) {
      return expectedViews.get(expression)?.all ?? noExpectedTypes;
    } }),
    requiredExpectedType: Object.freeze({ get(expression) { return expectedViews.get(expression)?.required ?? noExpectedTypes; } }),
    returnContext: Object.freeze({ get(callable) { return returnContexts.get(callable); } }),
    exactIntegerConversion: Object.freeze({ get(expression, targetType) {
      return byExpression.get(expression)?.get(targetTypeRefKey(targetType))?.exactInteger === true;
    } }),
    storageExpectedType: Object.freeze({ get(expression) {
      return expectedViews.get(expression)?.storage ?? noExpectedTypes;
    } }),
    callableTarget: Object.freeze({ get(expression) {
      return callableTargets.get(expression);
    } }),
    arrayLiteralCarrier: Object.freeze({ get(expression, targetType) {
      return arrayCarriers.get(expression)?.get(targetTypeRefKey(targetType));
    } }),
    expectedBinary: Object.freeze({ get(expression, targetType) {
      return expectedBinaries.get(expression)?.get(targetTypeRefKey(targetType));
    } }),
  };
  return Object.freeze(classifications);

  function refreshCallableTargets(): boolean {
    let changed = false;
    for (const declaration of contextualCallables) {
      const contextualTargets = [
        ...(byExpression.get(declaration)?.values() ?? []),
      ].flatMap((use) => {
        const targetType = callableContextTarget(declaration, use.targetType);
        return targetType === undefined ? [] : [{ ...use, targetType }];
      });
      const requiredTargets = contextualTargets.filter((use) =>
        use.strength === "required");
      const effectiveTargets = requiredTargets.length > 0
        ? requiredTargets
        : contextualTargets;
      const distinctTargets = new Map(effectiveTargets.map((use) =>
        [targetTypeRefKey(use.targetType), use.targetType]));
      const sourceTarget = evidence.nodeTargetType.get(declaration);
      const intrinsic = getCsharpMethodValue(sourceTarget) === undefined ? undefined : sourceTarget;
      const targetType = callables.closedInputType(declaration) ?? (distinctTargets.size === 1
        ? [...distinctTargets.values()][0]
        : distinctTargets.size === 0 ? intrinsic : undefined);
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
      const returnContext = selectCsharpCallableReturnContext(policy, evidence, callable, targetType);
      const previousReturnContext = returnContexts.get(declaration);
      if (
        previousReturnContext === undefined
          ? returnContext !== undefined
          : returnContext === undefined ||
            !targetTypeRefEquals(previousReturnContext.target, returnContext.target)
      ) {
        changed = true;
        if (returnContext === undefined) {
          returnContexts.delete(declaration);
        } else {
          returnContexts.set(declaration, returnContext);
          targetTypes.set(targetTypeRefKey(returnContext.target), returnContext.target);
        }
      }
    }
    return changed;
  }

  function callableContextTarget(declaration: Node, target: TargetTypeRef): TargetTypeRef | undefined {
    const value = getCsharpNullableElementTargetType(target) ?? target;
    if (getCsharpMethodValue(value) !== undefined) {
      const parameters = policy.ast.typeParameters(declaration).map(parameter => parameter === undefined
        ? undefined : csharpSourceTypeParameter(parameter, policy.ast));
      return parameters.some(parameter => parameter === undefined) ? undefined
        : rebindCsharpMethodValueTypeParameters(value, parameters as NonNullable<typeof parameters[number]>[]);
    }
    const signature = getCsharpLambdaSignature(value);
    if (signature !== undefined) {
      const callable = callables.get({ kind: "declaration", declaration });
      if (getCsharpDelegateSignature(value) !== undefined && callable !== undefined &&
        HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync) &&
        getCsharpTaskResultTargetType(callable.returnType) !== undefined &&
        getCsharpTaskResultTargetType(signature.returnType) === undefined) {
        return csharpCallableValueType(callable);
      }
      return value;
    }
    const arms = getCsharpRuntimeUnionArms(value, policy.typeDefinitions);
    if (arms === undefined) return undefined;
    const callable = callables.get({ kind: "declaration", declaration });
    const selected = callable === undefined ? undefined : csharpCallableValueType(callable);
    if (selected === undefined) return undefined;
    const candidates = arms.filter((arm) => targetTypeRefEquals(arm, selected));
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (operations.nativeUnreachable.get(node)) return;
    recordAccessorReturnContext(node);
    recordInitializer(node);
    recordReturnExpression(node);
    recordExpressionBodyReturn(node);
    const thrown = operations.throwValue.get(node);
    if (thrown !== undefined) record(thrown.expression, thrown.targetCarrier, "required");
    const contextualType = evidence.contextualType.get(node);
    record(
      node,
      contextualType === undefined
        ? undefined
        : evidence.semanticTargetType.get(contextualType, sourceFile),
      "contextual",
    );
    recordIntrinsicArrayLiteralElements(node);
    recordIntrinsicObjectLiteralMembers(node);

    const call = operations.selectedCall.get(node);
    const typedLocation = operations.typedLocation.get(node);
    const nativePointer = operations.nativePointer.get(node);
    if (nativePointer?.kind === "layout-query") {
      return;
    }
    if (nativePointer?.kind === "raw-location") {
      record(nativePointer.expression, nativePointer.inputType, "required");
    } else if (nativePointer?.kind === "raw-address") {
      for (const argument of nativePointer.arguments) record(argument.expression, argument.sourceType, "required");
    } else if (nativePointer?.kind === "raw-identity") {
      for (const argument of nativePointer.arguments) record(argument, nativePointer.parameterType, "required");
    } else if (typedLocation !== undefined && typedLocation.kind !== "not-typed-location" &&
      typedLocation.kind !== "rejected") {
      if (typedLocation.kind === "location-allocate") {
        record(typedLocation.initialExpression, typedLocation.pointeeType, "required");
      } else if (typedLocation.kind === "location-store") {
        record(typedLocation.valueExpression, typedLocation.pointeeType, "required");
      } else if (typedLocation.kind === "location-equal") {
        record(typedLocation.leftExpression, typedLocation.parameterType, "required");
        record(typedLocation.rightExpression, typedLocation.parameterType, "required");
      } else if (typedLocation.kind === "location-hash") {
        record(typedLocation.locationExpression, typedLocation.parameterType, "required");
      } else if (typedLocation.kind === "location-bind" || typedLocation.kind === "location-project" ||
        typedLocation.kind === "location-view") {
        for (const argument of typedLocation.arguments) {
          record(argument.expression, argument.type, "required");
        }
      }
    } else if (call?.target?.kind === "resolved") {
      recordSelectedCallReceiver(call.target, "required");
      recordSelectedCallArguments(
        call.target.source.sourceArguments,
        call.target.call.arguments,
        call.target.call.origin === "provider"
          ? call.target.call.argumentMappings
          : undefined,
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

    const construction = operations.selectedConstruction.get(node);
    if (construction?.target?.kind === "resolved") {
      recordSelectedCallReceiver(construction.target, "required");
      recordSelectedCallArguments(
        construction.target.source.sourceArguments,
        construction.target.call.arguments,
        construction.target.call.origin === "provider"
          ? construction.target.call.argumentMappings
          : undefined,
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

    const switchSelection = operations.switchStatement.get(node);
    if (switchSelection?.kind === "ordered") {
      for (const clause of switchSelection.clauses) {
        if (clause.comparison?.kind !== "resolved") continue;
        record(clause.comparison.left, clause.comparison.leftInputType, "required");
        record(clause.comparison.right, clause.comparison.rightInputType, "required");
      }
    }

    const binary = operations.binaryOperation.get(node)?.target;
    if (binary?.kind === "resolved") {
      record(binary.left, binary.leftInputType, "required");
      if (binary.targetOperation.kind === "conditional-value" && binary.targetOperation.branch !== "right") {
        record(binary.left, binary.resultType, "required");
      }
      const selected = binary.sourceOperator === "="
        ? policy.semantics(sourceFile)?.operations.propertyAccess(binary.left) ??
          policy.semantics(sourceFile)?.operations.elementAccess(binary.left)
        : undefined;
      const shape = selected === undefined ? undefined
        : objectShapes.resolveNode(selected.receiver.expression, sourceFile);
      const member = shape === undefined || selected === undefined ? undefined
        : resolveCsharpObjectShapeMemberBySelectedSubject(shape,
          [selected.selectedDeclaration, selected.selectedSymbol]);
      if (binary.targetOperation.kind !== "conditional-value" || binary.targetOperation.branch !== "left") {
        record(binary.right, binary.rightInputType, "required",
          member?.kind === "resolved" && member.member.exactNumericStorage === true);
      }
    }
    const mutation = operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-typed-element" && mutation.calculation !== undefined) {
      record(mutation.calculation.left, mutation.calculation.leftInputType, "required");
      record(mutation.calculation.right, mutation.calculation.rightInputType, "required");
    }
    const unary = operations.unaryOperation.get(node)?.target;
    if (unary?.kind === "resolved") {
      record(unary.operand, unary.operandType, "required");
    }

    const element = operations.selectedElement.get(node)?.target;
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

    if (nativePointer?.kind === "store") {
      record(nativePointer.valueExpression, nativePointer.pointeeType, "required");
    } else if (nativePointer?.kind === "offset") {
      record(nativePointer.offsetExpression, nativePointer.offsetType, "required");
    }

    const iteration = operations.iteration.get(node);
    if (iteration?.kind === "resolved") {
      record(
        policy.ast.as.AsForInOrOfStatement(node)?.Expression,
        iteration.iterableType,
        "required",
      );
    }

    const yieldSelection = evidence.yield.get(node);
    if (yieldSelection?.operand !== undefined) {
      const expectedYieldType = yieldSelection.yieldKind === "delegate"
        ? evidence.yieldTargetType.get(node)
        : getCsharpGeneratorProtocol(
            evidence.generatorTargetType.get(yieldSelection.generator.declaration),
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

  function recordAccessorReturnContext(node: Node): void {
    if (returnContexts.has(node)) return;
    const context = selectCsharpAccessorReturnContext(policy, node, declarations.returnContract.get(node));
    if (context === undefined) return;
    returnContexts.set(node, context);
    targetTypes.set(targetTypeRefKey(context.target), context.target);
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
      const targetType = returnContexts.get(owner)?.target;
      if (targetType !== undefined) {
        record(expression, targetType, "required");
        return;
      }
      if (isSourceCallableBodyBoundary(policy.ast, owner)) {
        return;
      }
    }
  }

  function recordExpressionBodyReturn(node: Node): void {
    if (!policy.ast.is.IsArrowFunction(node)) {
      return;
    }
    const body = policy.ast.as.AsArrowFunction(node)?.Body;
    const targetType = returnContexts.get(node)?.target;
    if (
      body !== undefined &&
      targetType !== undefined &&
      !HasSourceKind(policy.ast, body, KindBlock)
    ) {
      record(body, targetType, "required");
    }
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
        ? evidence.storageTargetType.get(node)
        : evidence.nodeTargetType.get(typeNode),
      typeNode === undefined ? "contextual" : "required",
    );
  }

  function propagateExpectedType(
    expression: Node,
    targetType: TargetTypeRef,
    strength: ExpectedTypeStrength,
    exactInteger: boolean,
  ): void {
    if (policy.ast.isConstAssertion(expression)) {
      const assertion = policy.ast.is.IsAsExpression(expression)
        ? policy.ast.as.AsAsExpression(expression) : policy.ast.as.AsTypeAssertion(expression);
      record(assertion?.Expression, targetType, strength, exactInteger);
      return;
    }
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      record(
        policy.ast.as.AsParenthesizedExpression(expression)?.Expression,
        targetType,
        strength,
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsSatisfiesExpression(expression)) {
      record(
        policy.ast.as.AsSatisfiesExpression(expression)?.Expression,
        targetType,
        strength,
        exactInteger,
      );
      return;
    }
    if (policy.ast.is.IsConditionalExpression(expression)) {
      const conditional = policy.ast.as.AsConditionalExpression(expression);
      record(conditional?.WhenTrue, targetType, strength, exactInteger);
      record(conditional?.WhenFalse, targetType, strength, exactInteger);
      return;
    }
    if (policy.ast.is.IsBinaryExpression(expression)) {
      const expectedSelection = selectCsharpBinaryOperation(
        policy,
        expression,
        evidence.nodeTargetType.get,
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
        if (result.kind === "added") expectedBinaryUses.push({ expression, targetType });
      }
      const selection = expectedSelection ?? operations.binaryOperation.get(expression)?.target;
      if (selection?.kind === "resolved") {
        record(selection.left, selection.leftInputType, strength);
        if (selection.targetOperation.kind === "conditional-value" && selection.targetOperation.branch !== "right") {
          record(selection.left, selection.resultType, strength);
        }
        if (selection.targetOperation.kind !== "conditional-value" || selection.targetOperation.branch !== "left") {
          record(selection.right, selection.rightInputType, strength);
        }
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
      const construction = objectShapes.resolveObjectLiteralUnionCarrier(expression, targetType) ?? targetType;
      const carrier = getCsharpNullableElementTargetType(construction) ?? construction;
      const indexedValueType = isCsharpJsValueTargetType(carrier) ? carrier
        : isCsharpRecordDictionaryTargetType(carrier) && carrier.kind === "target-named"
        ? carrier.typeArguments?.[1] : undefined;
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
            );
          } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
            record(policy.ast.name(property), indexedValueType, strength);
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
            selected.member.exactNumericStorage === true,
          );
        } else if (policy.ast.is.IsShorthandPropertyAssignment(property)) {
          record(policy.ast.name(property), selected.member.type, strength, selected.member.exactNumericStorage === true);
        }
      }
    }
  }

  function recordIntrinsicObjectLiteralMembers(node: Node): void {
    if (!policy.ast.is.IsObjectLiteralExpression(node)) return;
    const resolution = objectShapes.resolveObjectLiteralTargetShape(objectShapes.resolveNode(node), node);
    if (resolution?.kind === "resolved") record(node, resolution.shape.targetType, "contextual");
  }

  function recordIntrinsicArrayLiteralElements(node: Node): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    const targetType = valueReadStages.get(node)?.literalTarget;
    if (targetType !== undefined) {
      recordArrayLiteralElements(node, targetType, "contextual");
    }
  }

  function recordArrayLiteralElements(
    expression: Node,
    targetType: TargetTypeRef,
    strength: ExpectedTypeStrength,
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
    if (carrier.kind === "tuple") {
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        if (
          element !== undefined &&
          !policy.ast.is.IsSpreadElement(element)
        ) {
          record(element, carrier.elements[index], strength);
        }
      }
      return;
    }
    const elementTarget = getCsharpArrayLiteralElementTargetType(carrier);
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
      readonly effectiveArgumentIndex: number;
      readonly targetParameter: Parameters<
        typeof csharpTargetParameterValueType
      >[0];
      readonly sourceForm: Parameters<
        typeof csharpTargetParameterValueType
      >[1];
    }[],
    argumentMappings: readonly import("../../target-model/records/members.js").CsharpProviderArgumentMapping[] | undefined,
    strength: ExpectedTypeStrength,
  ): void {
    for (const argument of arguments_) {
      const expression = sourceArguments[argument.sourceArgumentIndex]
        ?.expression;
      const mapping = argumentMappings?.find((candidate) =>
        candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
      record(
        expression,
        mapping?.kind === "by-value" &&
            mapping.conversion.kind === "delegate-adapter" && mapping.conversion.strategy === "adaptation"
          ? mapping.sourceType
          : sourceArgumentExpectedType(
              expression,
              argument.targetParameter,
              argument.sourceForm,
            ),
        strength,
      );
    }
  }

  function sourceArgumentExpectedType(
    expression: Node | undefined,
    parameter: Parameters<typeof csharpSourceArgumentExpectedType>[0],
    sourceForm: Parameters<typeof csharpSourceArgumentExpectedType>[1],
  ): TargetTypeRef {
    const declaredExpectedType = csharpSourceArgumentExpectedType(
      parameter,
      sourceForm,
    );
    if (
      expression === undefined ||
      parameter.csharpSourceArgumentAdapter === undefined ||
      !isSourceCallableBodyBoundary(policy.ast, expression)
    ) {
      return declaredExpectedType;
    }
    const callable = callables.get({
      kind: "declaration",
      declaration: expression,
    });
    if (callable === undefined || callable.methodTypeParameterIdentities.length > 0) {
      return declaredExpectedType;
    }
    return csharpCallableValueType(callable) ?? declaredExpectedType;
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
