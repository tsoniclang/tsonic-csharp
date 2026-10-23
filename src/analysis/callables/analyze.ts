import type { Node, SourceFile } from "@tsonic/tsts";
import { selectCsharpSourceCallableAbi, selectCsharpProjectConstructorAbi } from "./source-callable-abi.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { isCsharpSourceCallableArtifactDeclaration, targetTypeRefEquals } from "../../policy/types/index.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../policy/types/index.js";

import type { SourceCallableSourceContract, SourceCallableContract } from "../../target-model/records/source-callable-contract.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpSourceNameResolver } from "../names/index.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { closeCsharpProjectCallableContracts } from "../project-types/callable-contracts.js";
import { selectCsharpClosedCallableContext } from "../expected-types/callable-contexts.js";
import type { CsharpClosedCallableContext } from "../expected-types/callable-contexts.js";
import { csharpCallableValueType } from "../../policy/types/callables/value-type.js";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpCallableConversionPolicy } from "./adapters.js";

export function analyzeCsharpCallableContracts(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  projections: CsharpGenericProjectionIndex,
  source: TargetSourceProgram,
  operations: CsharpTargetOperationClassifications,
  conversions: CsharpCallableConversionPolicy,
): CsharpCallableContractIndex {
  const byDeclaration = new Map<Node, SourceCallableSourceContract>();
  const closedContexts = new WeakMap<Node, CsharpClosedCallableContext>();
  const closedAliases = new Map<Node, Node>();
  const byProjectConstructor = new Map<string, SourceCallableContract>();
  const contracts: SourceCallableContract[] = [];
  const declarationContracts: SourceCallableSourceContract[] = [];
  const checkedDeclarations: { readonly declaration: Node; readonly sourceFile: SourceFile }[] = [];
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
  }
  const nativeDeclarations = closeCsharpProjectCallableContracts({
    ast: policy.ast, navigation: policy.navigation,
    typeDefinitions: conversions.typeDefinitions, projectTypes: conversions.projectTypes,
    providers: conversions.providers, target: conversions.target, objectShapes: conversions.objectShapes,
  }, declarationContracts);
  for (const [index, contract] of nativeDeclarations.entries()) {
    byDeclaration.set(contract.sourceDeclaration, contract);
    contracts[index] = contract;
  }
  for (const { declaration, sourceFile } of checkedDeclarations) {
    const contract = selectCsharpSourceCallableAbi(policy, evidence, declarations, names, declaration, sourceFile, projections, undefined);
    if (contract !== undefined) {
      byDeclaration.set(declaration, contract);
      contracts.push(contract);
    }
  }
  for (const definition of policy.projectTypes.catalog.definitions) {
    for (
      const constructor of
        policy.projectTypes.implicitConstructorsForDeclaration(
          definition.declaration,
        ) ?? []
    ) {
      const contract = selectCsharpProjectConstructorAbi(constructor);
      if (contract !== undefined) {
        byProjectConstructor.set(constructor.targetMember.id, contract);
        contracts.push(contract);
      }
    }
  }
  const closedInputs = new Map<Node, TargetTypeRef>();
  const invocationInputs = new Map<Node, TargetTypeRef>();
  for (const [declaration, contract] of byDeclaration) {
    const context = closedContexts.get(declaration);
    if (context === undefined) continue;
    const nativeType = csharpCallableValueType(contract);
    if (nativeType === undefined) continue;
    if (context.invocationType !== undefined && csharpClosedInvocationMatches(nativeType, context.invocationType)) {
      closedInputs.set(declaration, context.invocationType);
      invocationInputs.set(declaration, context.invocationType);
    } else if (context.inputTypes.some(type => type !== undefined)) closedInputs.set(declaration, nativeType);
  }
  for (const [alias, origin] of closedAliases) {
    const invocationType = invocationInputs.get(origin);
    if (invocationType !== undefined) closedInputs.set(alias, invocationType);
  }
  return sealCsharpCallableContractIndex({ contracts, declarationContracts: nativeDeclarations, byDeclaration,
    byProjectConstructor, closedInputs });

  function visit(node: Node, sourceFile: SourceFile): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    const accessor = policy.ast.is.IsGetAccessorDeclaration(node) || policy.ast.is.IsSetAccessorDeclaration(node);
    if (isCsharpSourceCallableArtifactDeclaration(policy.ast, node) || accessor) {
      const context = accessor ? undefined : selectCsharpClosedCallableContext(source, policy, operations, node);
      const contract = selectCsharpSourceCallableAbi(
        policy,
        evidence,
        declarations,
        names,
        node,
        sourceFile,
        projections,
        context?.inputTypes,
      );
      if (contract !== undefined) {
        byDeclaration.set(node, contract);
        contracts.push(contract);
        declarationContracts.push(contract);
        if (context !== undefined) {
          closedContexts.set(node, context);
          if (context.invocationType !== undefined) {
            for (const alias of source.navigation.expressionValueFlow(node).aliasDeclarations) {
              closedAliases.set(alias, node);
            }
          }
        }
      }
    } else if ((policy.ast.is.IsFunctionDeclaration(node) || policy.ast.is.IsMethodDeclaration(node) ||
        policy.ast.is.IsConstructorDeclaration(node)) && source.navigation.isProjectDeclaration(node)) {
      const implementation = source.navigation.callableImplementation(node);
      if (implementation.kind === "resolved" &&
        source.navigation.isProjectDeclaration(implementation.implementation.declaration) &&
        isCsharpSourceCallableArtifactDeclaration(policy.ast, implementation.implementation.declaration)) {
        checkedDeclarations.push({ declaration: node, sourceFile });
      }
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile);
      }
    });
  }
}


export function csharpCallableContractIndexesEqual(
  left: CsharpCallableContractIndex,
  right: CsharpCallableContractIndex,
): boolean {
  return left.contracts.length === right.contracts.length &&
    left.contracts.every((candidate, index) => {
      const other = right.contracts[index];
      return other !== undefined && callableContractEquals(candidate, other);
    });
}

function callableContractEquals(
  left: SourceCallableContract,
  right: SourceCallableContract,
): boolean {
  return left.kind === right.kind && left.sourceDeclaration === right.sourceDeclaration &&
    (left.kind === "native" || right.kind === "source" && left.parameters.length === right.parameters.length &&
      left.parameters.every((parameter, index) => parameter === right.parameters[index])) &&
    left.nativeSignature.receiverTypeOwner === right.nativeSignature.receiverTypeOwner &&
    stringArraysEqual(
      left.nativeSignature.methodTypeParameterIdentities,
      right.nativeSignature.methodTypeParameterIdentities,
    ) &&
    left.nativeSignature.methodAllowsRefLikeTypeArguments.length === right.nativeSignature.methodAllowsRefLikeTypeArguments.length &&
    left.nativeSignature.methodAllowsRefLikeTypeArguments.every((allowed, index) => allowed === right.nativeSignature.methodAllowsRefLikeTypeArguments[index]) &&
    targetTypeRefEquals(left.returnType, right.returnType) &&
    (left.nativeSignature.sourceReturnType === undefined ? right.nativeSignature.sourceReturnType === undefined
      : right.nativeSignature.sourceReturnType !== undefined && targetTypeRefEquals(left.nativeSignature.sourceReturnType, right.nativeSignature.sourceReturnType)) &&
    left.nativeParameters.length === right.nativeParameters.length &&
    left.nativeParameters.every((parameter, index) => {
      const other = right.nativeParameters[index];
      return other !== undefined &&
        parameter.sourceParameter === other.sourceParameter &&
        targetParameterEquals(
          parameter.targetParameter,
          other.targetParameter,
        );
    });
}

function targetParameterEquals(
  left: CsharpTargetParameter,
  right: CsharpTargetParameter,
): boolean {
  return left.name === right.name &&
    targetTypeRefEquals(left.type, right.type) &&
    left.passingMode === right.passingMode &&
    left.optional === right.optional &&
    left.paramsArray === right.paramsArray &&
    left.csharpOutputMayBeNull === right.csharpOutputMayBeNull &&
    left.csharpAcceptsCheckedSourceArgument ===
      right.csharpAcceptsCheckedSourceArgument &&
    left.csharpAcceptsClosedSourceArgument ===
      right.csharpAcceptsClosedSourceArgument &&
    left.csharpValueProjection === right.csharpValueProjection &&
    left.csharpOmittableOptionalArgument ===
      right.csharpOmittableOptionalArgument &&
    sourceArgumentAdaptersEqual(
      left.csharpSourceArgumentAdapter,
      right.csharpSourceArgumentAdapter,
    ) &&
    closedValueEquals(left.defaultValue, right.defaultValue) &&
    closedValueEquals(
      left.unsupportedDefaultValue,
      right.unsupportedDefaultValue,
    ) &&
    closedValueEquals(left.attributes, right.attributes) &&
    closedValueEquals(
      left.unsupportedAttributes,
      right.unsupportedAttributes,
    );
}

function sourceArgumentAdaptersEqual(
  left: CsharpTargetParameter["csharpSourceArgumentAdapter"],
  right: CsharpTargetParameter["csharpSourceArgumentAdapter"],
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : left.kind === right.kind &&
      targetTypeRefEquals(left.sourceCallableType, right.sourceCallableType);
}

function closedValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) =>
        closedValueEquals(value, right[index]));
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return stringArraysEqual(leftKeys, rightKeys) &&
    leftKeys.every((key) =>
      closedValueEquals(leftRecord[key], rightRecord[key]));
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

import { csharpClosedInvocationMatches } from "../../policy/types/callables/value-type.js";
import { sealCsharpCallableContractIndex } from "../program/records/callable-values.js";
