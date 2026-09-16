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
  getCsharpDelegateSignature,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpReferenceDefaultNeedsNullableParameter } from "../../target-model/types/reference-default.js";
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
  const referenceDefaults = new WeakMap<Node, TargetTypeRef>();
  const methodWrites = new WeakMap<Node, { readonly type: TargetTypeRef; readonly storageName: string; readonly implementationName: string }>();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }
  return Object.freeze({
    referenceDefault(node: Node) { return referenceDefaults.get(node); },
    methodWrite(node: Node) { return methodWrites.get(node); },
    returnContract(node: Node) {
      return returnContracts.get(node);
    },
  });

  function visit(node: Node): void {
    if (evidence.isCompileTimeMetadata(node)) return;
    const property = operations.property(node);
    if (property?.selection.kind === "source-owned" && property.selection.source.accessMode !== "read") {
      const declaration = property.selection.source.selectedDeclaration;
      const selectedType = property.sourceOwned?.rawReadType;
      if (declaration !== undefined && policy.ast.is.IsMethodDeclaration(declaration) &&
        selectedType !== undefined && getCsharpDelegateSignature(selectedType) !== undefined && !methodWrites.has(declaration)) {
        const owner = policy.ast.parent(declaration);
        if (owner !== undefined && policy.ast.is.IsClassDeclaration(owner)) {
          const reserved = new Set(policy.ast.members(owner).map(member => {
            const name = policy.ast.name(member);
            return name === undefined ? undefined : policy.ast.text(name);
          }));
          const allocate = (prefix: string): string => {
            let name = `${prefix}${policy.ast.text(policy.ast.name(declaration))}`;
            while (reserved.has(name)) name = `_${name}`;
            reserved.add(name);
            return name;
          };
          methodWrites.set(declaration, { type: selectedType,
            storageName: allocate("__tsonic_method_slot_"), implementationName: allocate("__tsonic_method_body_") });
        }
      }
    }
    if (policy.ast.is.IsParameterDeclaration(node)) {
      const parameter = policy.ast.as.AsParameterDeclaration(node);
      const selected = parameter === undefined ? undefined
        : evidence.nodeTargetType(parameter.Type ?? parameter.name!);
      if (parameter?.Initializer !== undefined && selected !== undefined &&
        csharpReferenceDefaultNeedsNullableParameter(selected)) {
        referenceDefaults.set(node, selected);
      }
    }
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
  const pointer = evidence.pointerReturn(declaration);
  if (authoredReturnNode !== undefined) {
    return authoredReturnType === undefined
      ? {
          kind: "rejected",
          reason:
            "The authored source callable return type has no closed C# representation.",
        }
      : { kind: "resolved", type: authoredReturnType,
          ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
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
  const contract = reconcileInferredReturnTargetContract(
    policy,
    baseline,
    observed,
    incomplete,
  );
  return contract.kind !== "resolved" || pointer === undefined ? contract
    : Object.freeze({ ...contract, undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined });
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
