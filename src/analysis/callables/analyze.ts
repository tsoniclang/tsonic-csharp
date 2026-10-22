import type { Node, SourceFile } from "@tsonic/tsts";
import { AsParameterDeclaration, HasSourceKind, KindIdentifier } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpNullableTargetType, getCsharpCallableValueSignature, isCsharpSourceCallableArtifactDeclaration, targetTypeRefEquals } from "../../policy/types/index.js";
import type { CsharpProjectForwardingConstructor } from "../../target-model/records/project-types.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../policy/types/index.js";

import type { CsharpSourceCallableContract, CsharpSourceCallableParameterContract } from "../../target-model/records/source-callable-contract.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpSourceNameResolver } from "../names/index.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
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
  const byDeclaration = new Map<Node, CsharpSourceCallableContract>();
  const closedContexts = new WeakMap<Node, CsharpClosedCallableContext>();
  const closedAliases = new Map<Node, Node>();
  const byProjectConstructor = new Map<string, CsharpSourceCallableContract>();
  const contracts: CsharpSourceCallableContract[] = [];
  const declarationContracts: CsharpSourceCallableContract[] = [];
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
    const contract = sourceCallableContract(policy, evidence, declarations, names, declaration, sourceFile, projections, undefined);
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
      const contract = projectConstructorContract(constructor);
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
    if (isCsharpSourceCallableArtifactDeclaration(policy.ast, node)) {
      const context = selectCsharpClosedCallableContext(source, policy, operations, node);
      const contract = sourceCallableContract(
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

function sourceCallableContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  declaration: Node,
  sourceFile: SourceFile,
  projections: CsharpGenericProjectionIndex,
  contextualInputs: readonly (TargetTypeRef | undefined)[] | undefined,
): CsharpSourceCallableContract | undefined {
  const returnContract = declarations.returnContract.get(declaration);
  const returnType = evidence.generatorTargetType.get(declaration) ??
    (returnContract?.kind === "resolved" ? returnContract.type : undefined) ??
    getCsharpCallableValueSignature(evidence.contextualTargetType.get(declaration))
      ?.returnType ??
    constructorReturnType(policy, declaration, sourceFile);
  if (returnType === undefined) {
    return undefined;
  }
  const parameters: CsharpSourceCallableParameterContract[] = [];
  const checked = policy.semantics(sourceFile).types.declarationSignatureInfo(declaration);
  if (checked === undefined) return undefined;
  for (const [index, parameterNode] of
    policy.ast.parameters(declaration).entries()) {
    const parameter = sourceParameterContract(
      policy,
      evidence,
      declarations,
      names,
      parameterNode,
      index,
      contextualInputs?.[index],
      checked.parameters.find(parameter => parameter.declaration === parameterNode)?.acceptsOmission,
    );
    if (parameter === undefined) {
      return undefined;
    }
    parameters.push(parameter);
  }
  const methodTypeParameterIdentities = policy.ast.typeParameters(declaration).map(
    (parameter) => parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast)?.identity,
  );
  if (
    methodTypeParameterIdentities.some((name) =>
      name === undefined || name.length === 0
    ) ||
    new Set(methodTypeParameterIdentities).size !== methodTypeParameterIdentities.length
  ) {
    return undefined;
  }
  const owner = sourceCallableReceiverTypeOwner(policy, declaration);
  return Object.freeze({
    sourceDeclaration: declaration,
    methodTypeParameterIdentities: Object.freeze(
      [...methodTypeParameterIdentities as string[], ...projections.genericProjection.get(declaration).map(parameter => parameter.identity)],
    ),
    methodAllowsRefLikeTypeArguments: Object.freeze([
      ...methodTypeParameterIdentities.map(() => false), ...projections.genericProjection.get(declaration).map(() => false),
    ]),
    ...(owner === undefined ? {} : { receiverTypeOwner: owner }),
    parameters: Object.freeze(parameters),
    returnType,
  });
}

function sourceParameterContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  parameterNode: Node | undefined,
  parameterIndex: number,
  contextualInput: TargetTypeRef | undefined,
  acceptsOmission: boolean | undefined,
): CsharpSourceCallableParameterContract | undefined {
  if (parameterNode === undefined) {
    return undefined;
  }
  const parameter = AsParameterDeclaration(policy.ast, parameterNode);
  if (parameter === undefined) {
    return undefined;
  }
  if (parameter.DotDotDotToken === undefined && acceptsOmission === undefined) return undefined;
  const typeSubject = parameter.Type ?? parameter.name;
  const selectedType = contextualInput ?? (typeSubject === undefined
    ? undefined
    : evidence.nodeTargetType.get(typeSubject));
  if (selectedType === undefined) {
    return undefined;
  }
  const questionToken = policy.ast.questionToken(parameterNode);
  const targetType: TargetTypeRef = declarations.runtimeDefault.get(parameterNode)?.parameterType ??
    (questionToken === undefined ? selectedType : csharpNullableTargetType(selectedType));
  const resolvedName = HasSourceKind(
      policy.ast,
      parameter.name,
      KindIdentifier,
    )
    ? names.resolve(parameter.name)
    : undefined;
  if (HasSourceKind(policy.ast, parameter.name, KindIdentifier) && resolvedName?.kind !== "resolved") return undefined;
  const name = resolvedName?.kind === "resolved"
    ? resolvedName.name
    : `__tsonic_param${parameterIndex}`;
  const targetParameter: CsharpTargetParameter = Object.freeze({
    name,
    type: targetType,
    passingMode: "by-value",
    ...(parameter.DotDotDotToken === undefined && acceptsOmission === true
      ? { optional: true }
      : {}),
    ...(parameter.DotDotDotToken === undefined
      ? {}
      : { paramsArray: true }),
  });
  return Object.freeze({ sourceParameter: parameterNode, targetParameter });
}

function constructorReturnType(
  policy: CsharpPolicyContext,
  declaration: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (!policy.ast.is.IsConstructorDeclaration(declaration)) {
    return undefined;
  }
  const parent = policy.ast.parent(declaration);
  return parent === undefined
    ? undefined
    : policy.types.resolveType(policy.semantics(sourceFile).declarations.declaredType(parent), sourceFile);
}

function sourceCallableReceiverTypeOwner(
  policy: CsharpPolicyContext,
  declaration: Node,
): Node | undefined {
  if (policy.ast.hasModifierKind(declaration, "static")) return undefined;
  const parent = policy.ast.parent(declaration);
  return parent !== undefined &&
      (
        policy.ast.is.IsClassDeclaration(parent) ||
        policy.ast.is.IsClassExpression(parent) ||
        policy.ast.is.IsInterfaceDeclaration(parent)
      )
    ? parent
    : undefined;
}

function projectConstructorContract(
  constructor: CsharpProjectForwardingConstructor,
): CsharpSourceCallableContract | undefined {
  const declaringType = constructor.targetMember.declaringType;
  if (
    declaringType === undefined ||
    constructor.source.parameters.length !==
      constructor.targetMember.parameters.length
  ) {
    return undefined;
  }
  return Object.freeze({
    sourceDeclaration:
      constructor.source.declaration ?? constructor.definition.declaration,
    methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]),
    receiverTypeOwner: constructor.definition.declaration,
    parameters: Object.freeze(constructor.source.parameters.map(
      (parameter, index) => Object.freeze({
        sourceParameter: parameter.parameterDeclaration,
        targetParameter: constructor.targetMember.parameters[index]!,
      }),
    )),
    returnType: declaringType,
  });
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
  left: CsharpSourceCallableContract,
  right: CsharpSourceCallableContract,
): boolean {
  return left.sourceDeclaration === right.sourceDeclaration &&
    left.receiverTypeOwner === right.receiverTypeOwner &&
    stringArraysEqual(
      left.methodTypeParameterIdentities,
      right.methodTypeParameterIdentities,
    ) &&
    left.methodAllowsRefLikeTypeArguments.length === right.methodAllowsRefLikeTypeArguments.length &&
    left.methodAllowsRefLikeTypeArguments.every((allowed, index) => allowed === right.methodAllowsRefLikeTypeArguments[index]) &&
    targetTypeRefEquals(left.returnType, right.returnType) &&
    (left.sourceReturnType === undefined ? right.sourceReturnType === undefined
      : right.sourceReturnType !== undefined && targetTypeRefEquals(left.sourceReturnType, right.sourceReturnType)) &&
    left.parameters.length === right.parameters.length &&
    left.parameters.every((parameter, index) => {
      const other = right.parameters[index];
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
