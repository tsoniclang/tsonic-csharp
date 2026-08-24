import type { Node, SourceFile } from "@tsonic/tsts";
import {
  AsParameterDeclaration,
  HasSourceKind,
  KindIdentifier,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/context.js";
import {
  csharpNullableTargetType,
  getCsharpDelegateSignature,
  isCsharpSourceCallableArtifactDeclaration,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpProjectForwardingConstructor,
  CsharpSourceCallableArtifactIdentity,
  CsharpSourceCallableContract,
  CsharpSourceCallableParameterContract,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../policy/types/index.js";
import type { CsharpDeclarationClassifications } from "../declarations/index.js";
import type { CsharpSourceNameResolver } from "../names/index.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpCallableContractIndex } from "./model.js";

export function analyzeCsharpCallableContracts(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
): CsharpCallableContractIndex {
  const byDeclaration = new WeakMap<Node, CsharpSourceCallableContract>();
  const byProjectConstructor = new Map<string, CsharpSourceCallableContract>();
  const contracts: CsharpSourceCallableContract[] = [];
  const declarationContracts: CsharpSourceCallableContract[] = [];
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile, sourceFile);
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
  return Object.freeze({
    contracts: Object.freeze(contracts),
    declarationContracts: Object.freeze(declarationContracts),
    get(identity: CsharpSourceCallableArtifactIdentity) {
      return identity.kind === "declaration"
        ? byDeclaration.get(identity.declaration)
        : byProjectConstructor.get(identity.targetMemberId);
    },
  });

  function visit(node: Node, sourceFile: SourceFile): void {
    if (isCsharpSourceCallableArtifactDeclaration(policy.ast, node)) {
      const contract = sourceCallableContract(
        policy,
        evidence,
        declarations,
        names,
        node,
        sourceFile,
      );
      if (contract !== undefined) {
        byDeclaration.set(node, contract);
        contracts.push(contract);
        declarationContracts.push(contract);
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
): CsharpSourceCallableContract | undefined {
  const returnContract = declarations.returnContract(declaration);
  const returnType = evidence.generatorTargetType(declaration) ??
    getCsharpDelegateSignature(evidence.contextualTargetType(declaration))
      ?.returnType ??
    (returnContract?.kind === "resolved" ? returnContract.type : undefined) ??
    constructorReturnType(policy, declaration, sourceFile);
  if (returnType === undefined) {
    return undefined;
  }
  const parameters: CsharpSourceCallableParameterContract[] = [];
  for (const [index, parameterNode] of
    policy.ast.parameters(declaration).entries()) {
    const parameter = sourceParameterContract(
      policy,
      evidence,
      names,
      parameterNode,
      index,
    );
    if (parameter === undefined) {
      return undefined;
    }
    parameters.push(parameter);
  }
  const methodTypeParameterNames = policy.ast.typeParameters(declaration).map(
    (parameter) => {
      const name = policy.ast.name(parameter);
      return name === undefined ? undefined : policy.ast.text(name);
    },
  );
  if (
    methodTypeParameterNames.some((name) =>
      name === undefined || name.length === 0
    ) ||
    new Set(methodTypeParameterNames).size !== methodTypeParameterNames.length
  ) {
    return undefined;
  }
  const owner = sourceCallableReceiverTypeOwner(policy, declaration);
  return Object.freeze({
    sourceDeclaration: declaration,
    methodTypeParameterNames: Object.freeze(
      methodTypeParameterNames as string[],
    ),
    ...(owner === undefined ? {} : { receiverTypeOwner: owner }),
    parameters: Object.freeze(parameters),
    returnType,
  });
}

function sourceParameterContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  names: CsharpSourceNameResolver,
  parameterNode: Node | undefined,
  parameterIndex: number,
): CsharpSourceCallableParameterContract | undefined {
  if (parameterNode === undefined) {
    return undefined;
  }
  const parameter = AsParameterDeclaration(policy.ast, parameterNode);
  if (parameter === undefined) {
    return undefined;
  }
  const typeSubject = parameter.Type ?? parameter.name;
  const selectedType = typeSubject === undefined
    ? undefined
    : evidence.nodeTargetType(typeSubject);
  if (selectedType === undefined) {
    return undefined;
  }
  const questionToken = policy.ast.questionToken(parameterNode);
  const targetType: TargetTypeRef = questionToken === undefined
    ? selectedType
    : csharpNullableTargetType(selectedType);
  const resolvedName = HasSourceKind(
      policy.ast,
      parameter.name,
      KindIdentifier,
    )
    ? names.resolve(parameter.name)
    : undefined;
  const name = resolvedName?.kind === "resolved"
    ? resolvedName.name
    : `__tsonic_param${parameterIndex}`;
  const targetParameter: CsharpTargetParameter = Object.freeze({
    name,
    type: targetType,
    passingMode: "by-value",
    ...(questionToken !== undefined || parameter.Initializer !== undefined
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
    : policy.types.resolveNode(parent, sourceFile);
}

function sourceCallableReceiverTypeOwner(
  policy: CsharpPolicyContext,
  declaration: Node,
): Node | undefined {
  const parent = policy.ast.parent(declaration);
  return parent !== undefined &&
      (
        policy.ast.is.IsClassDeclaration(parent) ||
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
    methodTypeParameterNames: Object.freeze([]),
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
      left.methodTypeParameterNames,
      right.methodTypeParameterNames,
    ) &&
    targetTypeRefEquals(left.returnType, right.returnType) &&
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
