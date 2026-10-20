import type { Node } from "@tsonic/tsts";
import {
  HasSourceKind,
  HasSyntacticModifier,
  isSourceCallableBodyBoundary,
  KindBlock,
  ModifierFlagsAsync,
} from "@tsonic/target-api/source";
import { csharpCallableValueType } from "../../policy/types/callables/value-type.js";
import {
  getCsharpLambdaSignature,
  getCsharpDelegateSignature,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpTaskResultTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpMethodValue, rebindCsharpMethodValueTypeParameters } from "../../target-model/types/method-values.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import type { CsharpReturnContext } from "../../target-model/records/return-contexts.js";
import { selectCsharpAccessorReturnContext, selectCsharpCallableReturnContext } from "../../policy/types/callables/return-contexts.js";
import type { CsharpExpectedUseCollection } from "./collection.js";
import type { CsharpExpectedTypeAnalysisInput } from "./model.js";

interface ReturnTarget {
  readonly expression: Node;
  readonly targetType: TargetTypeRef;
  readonly callable: Node;
}

export interface CsharpExpectedReturnTargets {
  readonly recordAccessorReturnContext: (node: Node) => void;
  readonly recordReturnExpression: (node: Node) => void;
  readonly recordExpressionBodyReturn: (node: Node) => void;
  readonly refreshCallableTargets: () => boolean;
  readonly recordReturnDemands: () => void;
  readonly seal: () => {
    readonly returnContext: (callable: Node) => CsharpReturnContext | undefined;
    readonly callableTarget: (expression: Node) => TargetTypeRef | undefined;
  };
}

export function createCsharpExpectedReturnTargets(
  input: CsharpExpectedTypeAnalysisInput,
  collection: CsharpExpectedUseCollection,
): CsharpExpectedReturnTargets {
  const { policy, evidence, callables, declarations } = input;
  const returnContexts = new WeakMap<Node, CsharpReturnContext>();
  const callableTargets = new WeakMap<Node, TargetTypeRef>();
  const returnOwners = new Set<Node>();

  for (const callable of callables.declarationContracts) {
    const context = selectCsharpCallableReturnContext(policy, evidence, callable);
    if (context !== undefined) {
      returnContexts.set(callable.sourceDeclaration, context);
    }
  }

  return Object.freeze({
    recordAccessorReturnContext,
    recordReturnExpression,
    recordExpressionBodyReturn,
    refreshCallableTargets,
    recordReturnDemands,
    seal: () => Object.freeze({
      returnContext: (callable: Node) => returnContexts.get(callable),
      callableTarget: (expression: Node) => callableTargets.get(expression),
    }),
  });

  function refreshCallableTargets(): boolean {
    let changed = false;
    for (const declaration of collection.contextualCallables) {
      const contextualTargets = collection.recordedUses(declaration).flatMap((use) => {
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
          collection.addTargetType(targetType);
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
          collection.addTargetType(returnContext.target);
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

  function recordAccessorReturnContext(node: Node): void {
    if (returnContexts.has(node)) return;
    const context = selectCsharpAccessorReturnContext(policy, node, declarations.returnContract.get(node));
    if (context === undefined) return;
    returnContexts.set(node, context);
    collection.addTargetType(context.target);
  }

  function recordReturnExpression(node: Node): void {
    const expression = returnExpressionTarget(node);
    if (expression !== undefined) {
      returnOwners.add(node);
      collection.record(expression.expression, expression.targetType, "required", undefined);
    }
  }

  function recordExpressionBodyReturn(node: Node): void {
    const body = expressionBodyTarget(node);
    if (body !== undefined) {
      returnOwners.add(node);
      collection.record(body.expression, body.targetType, "required", undefined);
    }
  }

  function recordReturnDemands(): void {
    for (const owner of returnOwners) {
      const selected = returnExpressionTarget(owner) ?? expressionBodyTarget(owner);
      if (selected !== undefined) {
        collection.record(selected.expression, selected.targetType, "required", { owner, slot: { kind: "return" } });
      }
    }
  }

  function returnExpressionTarget(node: Node): ReturnTarget | undefined {
    if (!policy.ast.is.IsReturnStatement(node)) {
      return undefined;
    }
    const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
    if (expression === undefined) {
      return undefined;
    }
    for (
      let owner = policy.ast.parent(node);
      owner !== undefined;
      owner = policy.ast.parent(owner)
    ) {
      const targetType = returnContexts.get(owner)?.target;
      if (targetType !== undefined) {
        return { expression, targetType, callable: owner };
      }
      if (isSourceCallableBodyBoundary(policy.ast, owner)) {
        return undefined;
      }
    }
    return undefined;
  }

  function expressionBodyTarget(node: Node): ReturnTarget | undefined {
    if (!policy.ast.is.IsArrowFunction(node)) {
      return undefined;
    }
    const body = policy.ast.as.AsArrowFunction(node)?.Body;
    const targetType = returnContexts.get(node)?.target;
    return body !== undefined && targetType !== undefined && !HasSourceKind(policy.ast, body, KindBlock)
      ? { expression: body, targetType, callable: node } : undefined;
  }
}
