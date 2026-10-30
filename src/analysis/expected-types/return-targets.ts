import type { Node } from "@tsonic/tsts";
import {
  HasSourceKind,
  isSourceCallableBodyBoundary,
  KindBlock,
} from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpReturnContext } from "../../target-model/records/calls/return-contexts.js";
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
  readonly recordReturnDemands: () => void;
  readonly seal: () => {
    readonly returnContext: (callable: Node) => CsharpReturnContext | undefined;
  };
}

export function createCsharpExpectedReturnTargets(
  input: CsharpExpectedTypeAnalysisInput,
  collection: CsharpExpectedUseCollection,
): CsharpExpectedReturnTargets {
  const { policy, evidence, callables, declarations } = input;
  const returnContexts = new WeakMap<Node, CsharpReturnContext>();
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
    recordReturnDemands,
    seal: () => Object.freeze({
      returnContext: (callable: Node) => returnContexts.get(callable),
    }),
  });

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
