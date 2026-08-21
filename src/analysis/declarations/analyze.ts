import type { Node } from "@tsonic/tsts";
import {
  HasSyntacticModifier,
  ModifierFlagsAsync,
  Node_Type,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/context.js";
import {
  csharpConversionIsApplicable,
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";
import {
  csharpRuntimeUndefinedTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type {
  CsharpDeclarationClassifications,
  CsharpReturnTargetContract,
} from "./model.js";

export function analyzeCsharpDeclarations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
): CsharpDeclarationClassifications {
  const returnContracts = new WeakMap<Node, CsharpReturnTargetContract>();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }
  return Object.freeze({
    returnContract(node: Node) {
      return returnContracts.get(node);
    },
  });

  function visit(node: Node): void {
    if (isCallableDeclaration(policy, node)) {
      returnContracts.set(
        node,
        classifyReturnContract(policy, evidence, operations, node),
      );
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function classifyReturnContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  declaration: Node,
): CsharpReturnTargetContract {
  const baseline = evidence.inferredCallableReturnType(declaration);
  const authoredReturnNode = Node_Type(policy.ast, declaration);
  const authoredReturnType = authoredReturnNode === undefined
    ? undefined
    : evidence.nodeTargetType(authoredReturnNode);
  if (authoredReturnNode !== undefined) {
    return authoredReturnType === undefined
      ? {
          kind: "rejected",
          reason:
            "The authored source callable return type has no closed C# representation.",
        }
      : { kind: "resolved", type: authoredReturnType };
  }
  if (baseline === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checked source callable has no single closed C# return representation.",
    };
  }
  if (
    HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync)
  ) {
    return { kind: "resolved", type: baseline };
  }
  const observed: TargetTypeRef[] = [];
  let incomplete = false;
  collectDirectReturnExpressions(policy, declaration, (expression) => {
    const type = operations.resultType(expression) ??
      evidence.readStorageTargetType(expression) ??
      evidence.nodeTargetType(expression);
    if (type === undefined) {
      incomplete = true;
    } else {
      observed.push(type);
    }
  });
  return reconcileInferredReturnTargetContract(
    policy,
    baseline,
    observed,
    incomplete,
  );
}

export function reconcileInferredReturnTargetContract(
  policy: CsharpPolicyContext,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
  incomplete: boolean,
): CsharpReturnTargetContract {
  if (incomplete) {
    return {
      kind: "rejected",
      reason:
        "An inferred C# public return contract contains a return expression without one closed target representation.",
    };
  }
  if (observed.length === 0) {
    return { kind: "resolved", type: baseline };
  }
  const requiredSources = [
    ...observed,
    ...uncoveredBaselineReturnAlternatives(policy, baseline, observed),
  ];
  const selected = selectCsharpCommonImplicitTarget(
    policy,
    requiredSources,
    [...observed, baseline],
  );
  return selected.kind === "resolved"
    ? { kind: "resolved", type: selected.target }
    : {
        kind: "rejected",
        reason:
          `An inferred C# public return contract contains incompatible exact target representations. ${selected.reason}`,
      };
}

function uncoveredBaselineReturnAlternatives(
  policy: CsharpPolicyContext,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  const alternatives = new Map<string, TargetTypeRef>();
  collectTargetContractAlternatives(baseline, alternatives);
  return [...alternatives.values()].filter((alternative) =>
    !observed.some((source) =>
      csharpConversionIsApplicable(
        selectCsharpConversion(policy, source, alternative, "implicit"),
        "implicit",
      )
    )
  );
}

function collectTargetContractAlternatives(
  type: TargetTypeRef,
  alternatives: Map<string, TargetTypeRef>,
): void {
  const union = getCsharpRuntimeUnionArms(type);
  if (union !== undefined) {
    union.forEach((member) =>
      collectTargetContractAlternatives(member, alternatives)
    );
    return;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    collectTargetContractAlternatives(nullableElement, alternatives);
    const undefinedType = csharpRuntimeUndefinedTargetType();
    alternatives.set(targetTypeRefKey(undefinedType), undefinedType);
    return;
  }
  alternatives.set(targetTypeRefKey(type), type);
}

function collectDirectReturnExpressions(
  policy: CsharpPolicyContext,
  declaration: Node,
  consume: (expression: Node) => void,
): void {
  const body = policy.ast.body(declaration);
  if (body === undefined) {
    return;
  }
  visit(body);

  function visit(node: Node): void {
    if (node !== body && isCallableDeclaration(policy, node)) {
      return;
    }
    if (policy.ast.is.IsReturnStatement(node)) {
      const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
      if (expression !== undefined) {
        consume(expression);
      }
      return;
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function isCallableDeclaration(
  policy: CsharpPolicyContext,
  node: Node,
): boolean {
  return policy.ast.is.IsFunctionDeclaration(node) ||
    policy.ast.is.IsFunctionExpression(node) ||
    policy.ast.is.IsArrowFunction(node) ||
    policy.ast.is.IsMethodDeclaration(node) ||
    policy.ast.is.IsGetAccessorDeclaration(node) ||
    policy.ast.is.IsSetAccessorDeclaration(node);
}
