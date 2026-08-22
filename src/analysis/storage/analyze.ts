import type { Node } from "@tsonic/tsts";
import {
  csharpConversionIsApplicable,
} from "../../policy/conversions/index.js";
import {
  getCsharpDelegateSignature,
  csharpNullableReferenceTargetType,
  csharpNullableTargetType,
  csharpTargetStorageIdentityEquals,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpPolicyContext } from "../../policy/context.js";
import {
  selectCsharpSourceArgument,
} from "../../policy/members/selection/argument-selection.js";
import type {
  CsharpConversionClassifications,
} from "../conversions/index.js";
import type {
  CsharpExpectedTypeClassifications,
} from "../expected-types/index.js";
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
  CsharpStorageClassifications,
  CsharpStorageIssue,
} from "./model.js";

interface MutableStorageContract {
  readonly declaration: Node;
  targetType?: TargetTypeRef;
  nullableWrittenType?: TargetTypeRef;
  typedLocationIdentity: boolean;
}

const maximumStorageContracts = 131_072;

export function analyzeCsharpStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  expectedTypes: CsharpExpectedTypeClassifications,
  conversions: CsharpConversionClassifications,
  previous?: CsharpStorageClassifications,
): CsharpStorageClassifications {
  const contracts = new Map<Node, MutableStorageContract>();
  const issues: CsharpStorageIssue[] = [];
  const nodes: Node[] = [];

  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }

  const resolvedTypes = new Map<Node, TargetTypeRef>();
  for (const contract of contracts.values()) {
    const sourceType = evidence.storageTargetType(contract.declaration);
    const selected = contract.targetType ?? sourceType;
    if (selected === undefined) {
      issues.push(issue(
        contract.declaration,
        "CSHARP_STORAGE_SOURCE_TYPE_UNRESOLVED",
        "A selected C# storage contract has no closed source storage representation.",
      ));
      continue;
    }
    if (
      contract.nullableWrittenType !== undefined &&
      !csharpTargetStorageIdentityEquals(
        contract.nullableWrittenType,
        selected,
      )
    ) {
      issues.push(issue(
        contract.declaration,
        "CSHARP_STORAGE_NULLABLE_WRITE_CONFLICT",
        `Selected target output writes '${targetTypeRefKey(contract.nullableWrittenType)}', but its source storage resolves to '${targetTypeRefKey(selected)}'.`,
      ));
      continue;
    }
    resolvedTypes.set(
      contract.declaration,
      contract.nullableWrittenType === undefined
        ? selected
        : csharpNullableReferenceTargetType(selected),
    );
  }
  const effectiveTypes = new WeakMap<Node, TargetTypeRef>();
  const requiredTypes = new WeakMap<Node, TargetTypeRef>();
  for (const node of nodes) {
    const directRequirement = resolvedTypes.get(node);
    if (directRequirement !== undefined) {
      requiredTypes.set(node, directRequirement);
      effectiveTypes.set(node, directRequirement);
      continue;
    }
    const sourceType = evidence.storageTargetType(node);
    if (sourceType === undefined) {
      continue;
    }
    const declaration = policy.navigation.referenceFor(node)?.declaration;
    const required = declaration === undefined
      ? undefined
      : resolvedTypes.get(declaration);
    if (required !== undefined) {
      requiredTypes.set(node, required);
      effectiveTypes.set(node, required);
      continue;
    }
    effectiveTypes.set(node, sourceType);
  }

  const classifications: CsharpStorageClassifications = {
    issues: Object.freeze(issues),
    contracts: Object.freeze([...contracts.values()].flatMap((contract) => {
      const type = resolvedTypes.get(contract.declaration);
      return type === undefined
        ? []
        : [Object.freeze({
            declaration: contract.declaration,
            ...(contract.targetType === undefined
              ? {}
              : { targetType: contract.targetType }),
            ...(contract.nullableWrittenType === undefined
              ? {}
              : { nullableWrittenType: contract.nullableWrittenType }),
            type,
            typedLocationIdentity: contract.typedLocationIdentity,
          })];
    })),
    type(node) {
      return effectiveTypes.get(node);
    },
    requiredType(node) {
      return requiredTypes.get(node);
    },
    requiresTypedLocationIdentity(declaration) {
      return contracts.get(declaration)?.typedLocationIdentity === true;
    },
  };
  return Object.freeze(classifications);

  function visit(node: Node): void {
    nodes.push(node);
    for (const expectedType of expectedTypes.storageTypesForExpression(node)) {
      recordPromotedRepresentation(node, expectedType);
    }
    recordCallableParameterRequirements(node);
    recordObjectLiteralSetterRequirement(node);
    recordOperationRequirements(node);
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }

  function recordCallableParameterRequirements(node: Node): void {
    if (
      !policy.ast.is.IsArrowFunction(node) &&
      !policy.ast.is.IsFunctionExpression(node)
    ) {
      return;
    }
    const parameters = policy.ast.parameters(node).filter(
      (parameter): parameter is Node => parameter !== undefined,
    );
    const callableTarget = expectedTypes.callableTarget(node);
    const selectedSignature = callableTarget === undefined
      ? undefined
      : getCsharpDelegateSignature(callableTarget);
    const signatures = selectedSignature === undefined ? [] : [selectedSignature];
    if (signatures.length === 0) {
      for (const parameter of parameters) {
        const declaration = policy.ast.as.AsParameterDeclaration(parameter);
        const authored = declaration?.Type === undefined
          ? undefined
          : evidence.nodeTargetType(declaration.Type);
        if (authored !== undefined) {
          requireTargetType(
            parameter,
            parameter,
            policy.ast.questionToken(parameter) === undefined
              ? authored
              : csharpNullableTargetType(authored),
          );
        }
      }
      return;
    }
    for (const signature of signatures) {
      if (parameters.length > signature.parameters.length) {
        issues.push(issue(
          parameters[signature.parameters.length]!,
          "CSHARP_LAMBDA_PARAMETER_ARITY_CONFLICT",
          "The source lambda declares more parameters than its exact selected C# delegate representation.",
        ));
        continue;
      }
      for (let index = 0; index < parameters.length; index += 1) {
        const parameter = parameters[index]!;
        const targetType = signature.parameters[index]!;
        const declaration = policy.ast.as.AsParameterDeclaration(parameter);
        const authored = declaration?.Type === undefined
          ? undefined
          : evidence.nodeTargetType(declaration.Type);
        const effectiveAuthored = authored === undefined ||
            policy.ast.questionToken(parameter) === undefined
          ? authored
          : csharpNullableTargetType(authored);
        if (
          effectiveAuthored !== undefined &&
          !targetTypeRefEquals(effectiveAuthored, targetType)
        ) {
          issues.push(issue(
            parameter,
            "CSHARP_LAMBDA_PARAMETER_TYPE_CONFLICT",
            `The authored lambda parameter representation '${targetTypeRefKey(effectiveAuthored)}' conflicts with its exact selected C# delegate parameter representation '${targetTypeRefKey(targetType)}'.`,
          ));
          continue;
        }
        requireTargetType(parameter, parameter, targetType);
      }
    }
  }

  function recordObjectLiteralSetterRequirement(node: Node): void {
    if (!policy.ast.is.IsSetAccessorDeclaration(node)) {
      return;
    }
    const owner = policy.ast.parent(node);
    if (owner === undefined || !policy.ast.is.IsObjectLiteralExpression(owner)) {
      return;
    }
    const parameter = policy.ast.parameters(node).filter(
      (candidate): candidate is Node => candidate !== undefined,
    );
    if (parameter.length !== 1) {
      return;
    }
    const shapes = [
      objectShapes.resolveNode(owner),
      ...expectedTypes.forExpression(owner).flatMap((targetType) => {
        const expectedShape = objectShapes.resolveTarget(targetType);
        const resolution = objectShapes.resolveObjectLiteralTargetShape(
          expectedShape,
          owner,
        );
        return resolution?.kind === "resolved" ? [resolution.shape] : [];
      }),
    ].filter((shape): shape is NonNullable<typeof shape> => shape !== undefined);
    for (const shape of shapes) {
      const matches = shape.members.filter((member) =>
        member.sourceDeclarations?.includes(node) === true
      );
      if (matches.length > 1) {
        issues.push(issue(
          node,
          "CSHARP_OBJECT_SETTER_MEMBER_AMBIGUOUS",
          "One object-literal setter belongs to multiple members in the same sealed C# object-shape classification.",
        ));
        continue;
      }
      if (matches.length === 1) {
        requireTargetType(parameter[0]!, parameter[0]!, matches[0]!.type);
      }
    }
  }

  function recordPromotedRepresentation(
    expression: Node,
    expectedType: TargetTypeRef,
  ): void {
    if (!policy.ast.is.IsIdentifier(expression)) {
      return;
    }
    const sourceType = evidence.nodeTargetType(expression);
    const conversion = conversions.selectExpression(
      expression,
      sourceType,
      expectedType,
      "implicit",
    );
    if (conversion?.kind !== "rejected") {
      const priorRequirement = previous?.requiredType(expression);
      if (
        priorRequirement !== undefined &&
        targetTypeRefEquals(priorRequirement, expectedType)
      ) {
        const declaration = policy.navigation.referenceFor(expression)
          ?.declaration;
        if (
          declaration !== undefined &&
          policy.ast.is.IsVariableDeclaration(declaration)
        ) {
          const variable = policy.ast.as.AsVariableDeclaration(declaration);
          if (variable?.Type === undefined && variable?.Initializer !== undefined) {
            requireTargetType(expression, declaration, expectedType);
          }
        }
      }
      return;
    }
    const reference = policy.navigation.referenceFor(expression);
    const declaration = reference?.declaration;
    if (
      declaration === undefined ||
      !policy.ast.is.IsVariableDeclaration(declaration)
    ) {
      return;
    }
    const variable = policy.ast.as.AsVariableDeclaration(declaration);
    if (variable?.Type !== undefined || variable?.Initializer === undefined) {
      return;
    }
    const initializerType = evidence.nodeTargetType(variable.Initializer);
    const initializerConversion = conversions.selectExpression(
      variable.Initializer,
      initializerType,
      expectedType,
      "implicit",
    );
    if (
      initializerConversion === undefined ||
      !csharpConversionIsApplicable(initializerConversion, "implicit")
    ) {
      return;
    }
    requireTargetType(expression, declaration, expectedType);
  }

  function recordOperationRequirements(node: Node): void {
    const typedLocation = operations.typedLocation(node);
    if (typedLocation?.kind === "location-address") {
      recordTypedLocationStorageIdentities(typedLocation.storage);
    }

    const iteration = operations.iteration(node);
    if (iteration?.kind === "resolved") {
      const initializer = policy.ast.as.AsForInOrOfStatement(node)?.Initializer;
      const declaration = singleVariableDeclaration(initializer);
      if (declaration !== undefined) {
        requireTargetType(declaration, declaration, iteration.elementType);
      }
    }

    const call = operations.call(node)?.target;
    if (call?.kind !== "resolved") {
      return;
    }
    for (const argument of call.call.arguments) {
      if (argument.targetParameter.csharpOutputMayBeNull !== true) {
        continue;
      }
      const expression = call.source.sourceArguments[
        argument.sourceArgumentIndex
      ]?.expression;
      if (expression === undefined) {
        continue;
      }
      const selected = selectCsharpSourceArgument(
        policy.sourceFacts,
        expression,
      );
      if (selected.kind === "rejected") {
        issues.push(issue(
          expression,
          "CSHARP_STORAGE_ARGUMENT_FACT_INVALID",
          selected.reason,
        ));
        continue;
      }
      const storageExpression = selected.argument.storageExpression;
      const declaration = policy.navigation.referenceFor(storageExpression)
        ?.declaration;
      if (declaration === undefined) {
        issues.push(issue(
          expression,
          "CSHARP_STORAGE_DECLARATION_MISSING",
          "A selected nullable target output has no exact source storage declaration.",
        ));
        continue;
      }
      requireNullableWrite(
        storageExpression,
        declaration,
        argument.targetParameter.type,
      );
    }
  }

  function recordTypedLocationStorageIdentities(
    storage: import("../../policy/operations/index.js")
      .CsharpTypedLocationStorage,
  ): void {
    if (
      storage.kind === "direct-storage" &&
      storage.identity.kind === "local-storage"
    ) {
      requireTypedLocationIdentity(
        storage.expression,
        storage.identity.declaration,
      );
      return;
    }
    if (storage.kind === "value-property-storage") {
      recordTypedLocationStorageIdentities(storage.receiverStorage);
    }
  }

  function singleVariableDeclaration(
    initializer: Node | undefined,
  ): Node | undefined {
    if (
      initializer === undefined ||
      !policy.ast.is.IsVariableDeclarationList(initializer)
    ) {
      return undefined;
    }
    const declarations = policy.ast.children(initializer).filter(
      (candidate): candidate is Node =>
        candidate !== undefined &&
        policy.ast.is.IsVariableDeclaration(candidate),
    );
    return declarations.length === 1 ? declarations[0] : undefined;
  }

  function requireTargetType(
    expression: Node,
    declaration: Node,
    targetType: TargetTypeRef,
  ): void {
    const contract = contractFor(expression, declaration);
    if (contract === undefined) {
      return;
    }
    if (
      contract.targetType !== undefined &&
      !targetTypeRefEquals(contract.targetType, targetType)
    ) {
      issues.push(issue(
        expression,
        "CSHARP_STORAGE_TARGET_TYPE_CONFLICT",
        `One source storage declaration requires incompatible target representations '${targetTypeRefKey(contract.targetType)}' and '${targetTypeRefKey(targetType)}'.`,
      ));
      return;
    }
    contract.targetType = targetType;
  }

  function requireNullableWrite(
    expression: Node,
    declaration: Node,
    writtenType: TargetTypeRef,
  ): void {
    const nullableType = csharpNullableReferenceTargetType(writtenType);
    if (targetTypeRefEquals(nullableType, writtenType)) {
      return;
    }
    const contract = contractFor(expression, declaration);
    if (contract === undefined) {
      return;
    }
    if (
      contract.nullableWrittenType !== undefined &&
      !csharpTargetStorageIdentityEquals(
        contract.nullableWrittenType,
        writtenType,
      )
    ) {
      issues.push(issue(
        expression,
        "CSHARP_STORAGE_NULLABLE_TYPE_CONFLICT",
        `One source storage declaration receives incompatible nullable target output types '${targetTypeRefKey(contract.nullableWrittenType)}' and '${targetTypeRefKey(writtenType)}'.`,
      ));
      return;
    }
    contract.nullableWrittenType = writtenType;
  }

  function requireTypedLocationIdentity(
    expression: Node,
    declaration: Node,
  ): void {
    const contract = contractFor(expression, declaration);
    if (contract !== undefined) {
      contract.typedLocationIdentity = true;
    }
  }

  function contractFor(
    expression: Node,
    declaration: Node,
  ): MutableStorageContract | undefined {
    let contract = contracts.get(declaration);
    if (contract !== undefined) {
      return contract;
    }
    if (contracts.size >= maximumStorageContracts) {
      issues.push(issue(
        expression,
        "CSHARP_STORAGE_CONTRACT_BUDGET_EXCEEDED",
        `C# target storage contracts exceed their finite ${maximumStorageContracts}-declaration budget.`,
      ));
      return undefined;
    }
    contract = {
      declaration,
      typedLocationIdentity: false,
    };
    contracts.set(declaration, contract);
    return contract;
  }
}

export function csharpStorageClassificationsEqual(
  left: CsharpStorageClassifications,
  right: CsharpStorageClassifications,
): boolean {
  return left.issues.length === right.issues.length &&
    left.contracts.length === right.contracts.length &&
    left.issues.every((candidate, index) => {
      const other = right.issues[index];
      return other !== undefined &&
        candidate.node === other.node &&
        candidate.code === other.code &&
        candidate.message === other.message;
    }) &&
    left.contracts.every((candidate, index) => {
      const other = right.contracts[index];
      return other !== undefined &&
        candidate.declaration === other.declaration &&
        optionalTargetTypeEquals(candidate.targetType, other.targetType) &&
        optionalTargetTypeEquals(
          candidate.nullableWrittenType,
          other.nullableWrittenType,
        ) &&
        targetTypeRefEquals(candidate.type, other.type) &&
        candidate.typedLocationIdentity === other.typedLocationIdentity;
    });
}

function optionalTargetTypeEquals(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : targetTypeRefEquals(left, right);
}

function issue(
  node: Node,
  code: string,
  message: string,
): CsharpStorageIssue {
  return Object.freeze({ node, code, message });
}
