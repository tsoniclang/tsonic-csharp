import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode, sourceCallableValueParameters } from "@tsonic/target-api/source";

import { conversionIsImplicitlyApplicable } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { getCsharpCallableValueSignature, getCsharpLambdaSignature, getCsharpNullableElementTargetType, csharpNullableReferenceTargetType, csharpNullableTargetType, csharpTargetStorageIdentityEquals, csharpDelegateSignaturesMatchNativeBinding, targetTypeRefEquals, targetTypeRefKey } from "../../policy/types/index.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications, CsharpStorageIssue } from "../../target-model/records/storage.js";
import { canConstructCsharpStorageLiteral } from "./literal-construction.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

interface MutableStorageContract {
  readonly declaration: Node;
  targetType?: TargetTypeRef;
  lambdaParameterType?: TargetTypeRef;
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
  declarations: CsharpDeclarationClassifications,
  callables: CsharpCallableContractIndex,
  previous: CsharpStorageClassifications | undefined,
  requiredRecords: CsharpRequiredRecord[],
): CsharpStorageRepresentationClassifications {
  const contracts = new Map<Node, MutableStorageContract>();
  const issues: CsharpStorageIssue[] = [];
  const nodes: Node[] = [];

  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }

  const resolvedTypes = new Map<Node, TargetTypeRef>();
  for (const contract of contracts.values()) {
    const sourceType = evidence.storageTargetType.get(contract.declaration);
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
    const sourceType = evidence.storageTargetType.get(node);
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

  const classifications: CsharpStorageRepresentationClassifications = {
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
            ...(contract.lambdaParameterType === undefined
              ? {}
              : { lambdaParameterType: contract.lambdaParameterType }),
            ...(contract.nullableWrittenType === undefined
              ? {}
              : { nullableWrittenType: contract.nullableWrittenType }),
            type,
            typedLocationIdentity: contract.typedLocationIdentity,
          })];
    })),
    storageType: Object.freeze({ get(node) {
      return effectiveTypes.get(node);
    } }),
    requiredStorageType: Object.freeze({ get(node) {
      return requiredTypes.get(node);
    } }),
    lambdaParameterType: Object.freeze({ get(node) {
      return contracts.get(node)?.lambdaParameterType;
    } }),
    typedLocationIdentity: Object.freeze({ get(declaration) {
      return contracts.get(declaration)?.typedLocationIdentity === true;
    } }),
  };
  return Object.freeze(classifications);

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node) || IsTypeSyntaxNode(policy.ast, node)) return;
    nodes.push(node);
    const declaration = policy.ast.is.IsVariableDeclaration(node) ? node
      : policy.ast.is.IsIdentifier(node) ? policy.navigation.referenceFor(node)?.declaration : undefined;
    const closedCallableType = declaration === undefined ? undefined : callables.closedInputType(declaration);
    if (declaration !== undefined && closedCallableType !== undefined) {
      requireTargetType(node, declaration, closedCallableType);
    } else {
      for (const expectedType of expectedTypes.storageExpectedType.get(node)) {
        recordPromotedRepresentation(node, expectedType);
      }
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
    const objectLiteralMethod = policy.ast.is.IsMethodDeclaration(node) &&
      policy.ast.is.IsObjectLiteralExpression(policy.ast.parent(node));
    const contextual = policy.ast.is.IsArrowFunction(node) || policy.ast.is.IsFunctionExpression(node) || objectLiteralMethod;
    if (!contextual && !policy.ast.is.IsFunctionDeclaration(node) &&
      !policy.ast.is.IsMethodDeclaration(node) && !policy.ast.is.IsConstructorDeclaration(node)) {
      return;
    }
    const parameters = sourceCallableValueParameters(policy.ast, node, policy.semanticsFor(node));
    if (parameters === undefined) return;
    const callableTarget = contextual ? expectedTypes.callableTarget.get(node) : undefined;
    const selectedSignature = callableTarget === undefined
      ? undefined
      : getCsharpLambdaSignature(callableTarget);
    const nativeContract = contextual && !objectLiteralMethod && callableTarget === undefined
      ? callables.get({ kind: "declaration", declaration: node })
      : undefined;
    const parameterTypes = selectedSignature === undefined
      ? nativeContract?.nativeParameters.map(parameter => parameter.targetParameter.type)
      : selectedSignature.parameters;
    if (parameterTypes !== undefined) {
      let nativeIndex = 0;
      for (let index = 0; index < parameters.length; index += 1) {
        const parameter = parameters[index]!;
        const declaration = policy.ast.as.AsParameterDeclaration(parameter);
        const authored = declaration?.Type === undefined
          ? undefined
          : evidence.nodeTargetType.get(declaration.Type);
        const tupleRest = declaration?.DotDotDotToken !== undefined && authored?.kind === "tuple" ? authored : undefined;
        const width = tupleRest === undefined ? 1 : tupleRest.elements.length;
        if (nativeIndex + width > parameterTypes.length) {
          issues.push(issue(parameter, "CSHARP_LAMBDA_PARAMETER_ARITY_CONFLICT",
            "The source lambda declares more parameters than its exact selected C# delegate representation."));
          return;
        }
        const targetType: TargetTypeRef = tupleRest === undefined ? parameterTypes[nativeIndex]!
          : Object.freeze({ kind: "tuple", elements: Object.freeze(parameterTypes.slice(nativeIndex, nativeIndex + width)) });
        nativeIndex += width;
        const types = policy.semanticsFor(parameter).types;
        const authoredType = declaration?.Type === undefined ? undefined : types.authoredType(declaration.Type);
        const broad = authoredType !== undefined && (types.isUnknown(authoredType) || types.isAny(authoredType));
        const effectiveAuthored = broad ? undefined : authored === undefined ||
            policy.ast.questionToken(parameter) === undefined
          ? authored
          : csharpNullableTargetType(authored);
        const runtimeDefault = declarations.runtimeDefault.get(parameter);
        if (
          effectiveAuthored !== undefined &&
          !targetTypeRefEquals(effectiveAuthored, targetType) &&
          !(runtimeDefault !== undefined && targetTypeRefEquals(runtimeDefault.parameterType, targetType))
        ) {
          const adaptation = conversions.conversion.get(
            targetType,
            effectiveAuthored,
            "implicit",
          );
          if (
            adaptation === undefined ||
            !csharpConversionIsApplicable(adaptation, "implicit")
          ) {
            issues.push(issue(
              parameter,
              "CSHARP_LAMBDA_PARAMETER_TYPE_CONFLICT",
              `The authored lambda parameter representation '${targetTypeRefKey(effectiveAuthored)}' cannot accept its exact selected C# delegate parameter representation '${targetTypeRefKey(targetType)}' through one closed implicit conversion.`,
            ));
            continue;
          }
        }
        const bodyType = runtimeDefault?.valueType ?? effectiveAuthored ?? targetType;
        requireTargetType(parameter, parameter, bodyType);
        if (runtimeDefault !== undefined && !targetTypeRefEquals(targetType, bodyType)) {
          conversions.conversion.get(targetType, bodyType, "implicit");
        }
        const contract = contracts.get(parameter);
        if (contract !== undefined) {
          requireCsharpRecord(requiredRecords, { family: "requiredStorageType", subject: parameter,
            construct: "adapted lambda parameter", producer: "analyzeCsharpStorage" });
          contract.lambdaParameterType = targetType;
        }
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
    const parameter = sourceCallableValueParameters(policy.ast, node, policy.semanticsFor(node));
    if (parameter === undefined) return;
    if (parameter.length !== 1) {
      return;
    }
    const shapes = [
      objectShapes.resolveNode(owner),
      ...expectedTypes.expectedType.get(owner).flatMap((targetType) => {
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
    const sourceType = evidence.nodeTargetType.get(expression);
    const sourceCallable = getCsharpCallableValueSignature(getCsharpNullableElementTargetType(sourceType) ?? sourceType);
    const expectedCallable = getCsharpCallableValueSignature(getCsharpNullableElementTargetType(expectedType) ?? expectedType);
    if (sourceCallable !== undefined && expectedCallable !== undefined &&
      !csharpDelegateSignaturesMatchNativeBinding(sourceCallable, expectedCallable)) return;
    const requiredStorageType = sourceType !== undefined &&
        getCsharpNullableElementTargetType(sourceType) === undefined
      ? getCsharpNullableElementTargetType(expectedType) ?? expectedType
      : expectedType;
    const conversion = conversions.expressionConversion.get(
      expression,
      sourceType,
      expectedType,
      "implicit",
    );
    if (conversion?.kind !== "rejected") {
      const priorRequirement = previous?.requiredStorageType.get(expression);
      if (
        priorRequirement !== undefined &&
        targetTypeRefEquals(priorRequirement, requiredStorageType)
      ) {
        const declaration = policy.navigation.referenceFor(expression)
          ?.declaration;
        if (
          declaration !== undefined &&
          policy.ast.is.IsVariableDeclaration(declaration)
        ) {
          const variable = policy.ast.as.AsVariableDeclaration(declaration);
          if (variable?.Initializer !== undefined && storageDeclarationCanRefine(declaration, requiredStorageType)) {
            requireTargetType(expression, declaration, requiredStorageType);
          }
        }
      }
      return;
    }
    const aliases = new Set<Node>();
    let current = expression;
    while (true) {
      const declaration = policy.navigation.referenceFor(current)?.declaration;
      if (declaration === undefined || !policy.ast.is.IsVariableDeclaration(declaration) ||
        aliases.has(declaration)) return;
      const variable = policy.ast.as.AsVariableDeclaration(declaration);
      if (variable?.Initializer === undefined || !storageDeclarationCanRefine(declaration, requiredStorageType)) return;
      aliases.add(declaration);
      if (aliases.size > maximumStorageContracts) {
        issues.push(issue(expression, "CSHARP_STORAGE_ALIAS_BUDGET_EXCEEDED",
          `Selected storage exceeds its finite ${maximumStorageContracts}-alias budget.`));
        return;
      }
      const initializer = variable.Initializer;
      if (policy.ast.is.IsObjectLiteralExpression(initializer) || policy.ast.is.IsArrayLiteralExpression(initializer)) {
        if (!canConstructCsharpStorageLiteral(initializer, requiredStorageType,
          policy, evidence, objectShapes, conversions)) return;
        break;
      }
      const initializerConversion = conversions.expressionConversion.get(initializer,
        evidence.nodeTargetType.get(initializer), requiredStorageType, "implicit");
      if (initializerConversion !== undefined && conversionIsImplicitlyApplicable(initializerConversion)) break;
      if (!policy.ast.is.IsIdentifier(initializer)) return;
      current = initializer;
    }
    for (const declaration of aliases) requireTargetType(expression, declaration, requiredStorageType);
  }

  function storageDeclarationCanRefine(declaration: Node, required: TargetTypeRef): boolean {
    const variable = policy.ast.as.AsVariableDeclaration(declaration);
    if (variable?.Initializer === undefined) return false;
    if (variable.Type === undefined) return true;
    const authored = evidence.nodeTargetType.get(variable.Type);
    const payload = getCsharpNullableElementTargetType(authored);
    const present = payload ?? authored;
    if (present?.kind !== "target-named" || payload !== undefined && getCsharpNullableElementTargetType(required) === undefined) return false;
    const native = present as CsharpTargetNamedTypeRef;
    if (native.csharpSourceDeclarationKind !== "interface" && native.csharpStructuralContract !== true) return false;
    const destination = objectShapes.resolveTarget(getCsharpNullableElementTargetType(required) ?? required);
    return destination?.implements?.some(base => targetTypeRefEquals(base, present)) === true;
  }

  function recordOperationRequirements(node: Node): void {
    const projectedWrite = operations.selectedProperty.get(node)?.sourceOwned?.projectedWrite;
    if (projectedWrite?.kind === "resolved") {
      recordTypedLocationStorageIdentities(projectedWrite.storage);
    }
    const typedLocation = operations.typedLocation.get(node);
    if (typedLocation?.kind === "location-address") {
      recordTypedLocationStorageIdentities(typedLocation.storage);
    }

    const iteration = operations.iteration.get(node);
    if (iteration?.kind === "resolved") {
      const initializer = policy.ast.as.AsForInOrOfStatement(node)?.Initializer;
      const declaration = singleVariableDeclaration(initializer);
      if (declaration !== undefined) {
        requireTargetType(declaration, declaration, iteration.elementType);
      }
    }

    const call = operations.selectedCall.get(node)?.target;
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
    storage: import("../../target-model/records/typed-location-storage.js")
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

function issue(
  node: Node,
  code: string,
  message: string,
): CsharpStorageIssue {
  return Object.freeze({ node, code, message });
}
