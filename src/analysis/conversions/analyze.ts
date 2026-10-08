import type { Node, SourceFile } from "@tsonic/tsts";
import { Node_Initializer } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  selectCsharpConversion,
  selectCsharpExpressionConversion,
} from "../../policy/conversions/index.js";
import type {
  CsharpConversionMode,
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import {
  csharpAbsenceTargetType,
  csharpNullableTargetType,
  csharpTsValueTargetType,
  getCsharpNullableElementTargetType,
  isCsharpJsValueTargetType,
  isCsharpJsValueObjectShapeTargetType,
  isCsharpRecordDictionaryTargetType,
  projectCsharpJsValueObjectLiteralShape,
  getCsharpGeneratorProtocol,
  getCsharpJsArrayElementTargetType,
  getCsharpArrayLiteralElementTargetType,
  getCsharpCollectionElementTargetType,
  isSourceOwnedCallableRuntimeCarrierSubject,
  isSourceOwnedProjectReference,
  targetTypeRefKey,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import {
  directCsharpSourceYieldExpression,
} from "../../target-model/syntax/yield-expression.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "../../target-model/types/index.js";
import type { CsharpExpectedTypeClassifications } from "../expected-types/index.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpStructuralInterfaceRegistration } from "../objects/structural-interfaces.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { CsharpBorrowedSequenceInput } from "../operations/borrowed-sequences.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpStorageRepresentationClassifications } from "../storage/index.js";
import type {
  CsharpConversionAnalysis,
  CsharpConversionClassifications,
  CsharpConversionIssue,
  CsharpExpressionConversionClassification,
} from "./model.js";
import { sealCsharpDelegateAdapterIdentities } from "./delegate-identities.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { selectCsharpIntegerTruncationConversion } from "../../policy/conversions/selection/integer-truncation.js";
import { selectCsharpExactIntegerConversion } from "../../policy/conversions/selection/exact-integer.js";
import { csharpRuntimeUnionMappingMatches, csharpRuntimeUnionProjectionMatches } from "./validation.js";
import { csharpPropertyProjectionValueTypes } from "./property-projections.js";

const unavailableConversion: CsharpConversionSelection = Object.freeze({
  kind: "rejected",
  reason: "C# conversion requires closed source and target representations.",
});
const maximumConversionClassifications = 1_048_576;

export function analyzeCsharpConversions(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  objectShapes: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration,
): CsharpConversionAnalysis {
  const pairSelections = new Map<string, CsharpConversionSelection>();
  const expressionSelections = new Map<
    Node,
    Map<string, CsharpExpressionConversionClassification>
  >();
  let delegateAdapters: ReturnType<typeof sealCsharpDelegateAdapterIdentities> = new Map();
  const issues: CsharpConversionIssue[] = [];
  const directCallables = new WeakMap<Node, NonNullable<ReturnType<CsharpPolicyContext["navigation"]["referenceFor"]>>>();
  let classificationCount = 0;
  let closed = false;
  let sealedClassifications: CsharpConversionClassifications | undefined;

  const openClassifications: CsharpConversionClassifications = {
    issues,
    delegateAdapters: scope => delegateAdapters.get(scope) ?? [],
    delegateAdapter: (expression, source, target) => expressionSelections.get(expression)?.get(pairKey(source, target, "implicit"))?.delegateIdentity,
    directCallableReference: expression => directCallables.get(expression),
    matchesUnionMapping: (source, target, selection) => csharpRuntimeUnionMappingMatches(policy, source, target, selection),
    matchesUnionProjection: (source, target, selection) => csharpRuntimeUnionProjectionMatches(policy, source, target, selection),
    select(source, target, mode) {
      if (source === undefined || target === undefined) {
        return unavailableConversion;
      }
      const key = pairKey(source, target, mode);
      const selected = pairSelections.get(key);
      return selected ?? (
          closed
            ? undefined
            : classifyPair(source, target, mode, policy.sourceFiles[0])
        );
    },
    selectExpression(expression, source, target, mode) {
      if (source === undefined || target === undefined) {
        return unavailableConversion;
      }
      const key = pairKey(source, target, mode);
      const selected = expressionSelections.get(expression)?.get(key)?.selection;
      return selected ?? (
          closed
            ? undefined
            : classifyExpression(expression, source, target, mode)
        );
    },
  };
  const classifications = Object.freeze(openClassifications);

  const analysis: CsharpConversionAnalysis = {
    classifications,
    seal({ operations, expectedTypes, storage }) {
      if (sealedClassifications !== undefined) {
        return sealedClassifications;
      }
      for (const sourceFile of policy.sourceFiles) {
        visit(sourceFile, sourceFile, operations, expectedTypes, storage);
      }
      delegateAdapters = sealCsharpDelegateAdapterIdentities(policy, expressionSelections, issues);
      closed = true;
      const sealedIssues = Object.freeze([...issues]);
      const sealed: CsharpConversionClassifications = {
        issues: sealedIssues,
        delegateAdapters: openClassifications.delegateAdapters,
        delegateAdapter: openClassifications.delegateAdapter,
        directCallableReference: openClassifications.directCallableReference,
        matchesUnionMapping: openClassifications.matchesUnionMapping,
        matchesUnionProjection: openClassifications.matchesUnionProjection,
        select(source, target, mode) {
          if (source === undefined || target === undefined) {
            return unavailableConversion;
          }
          return pairSelections.get(pairKey(source, target, mode));
        },
        selectExpression(expression, source, target, mode) {
          if (source === undefined || target === undefined) {
            return unavailableConversion;
          }
          const key = pairKey(source, target, mode);
          return expressionSelections.get(expression)?.get(key)?.selection ??
            pairSelections.get(key);
        },
      };
      sealedClassifications = Object.freeze(sealed);
      return sealedClassifications;
    },
  };
  return Object.freeze(analysis);

  function visit(
    node: Node,
    sourceFile: SourceFile,
    operations: CsharpTargetOperationClassifications,
    expectedTypes: CsharpExpectedTypeClassifications,
    storage: CsharpStorageRepresentationClassifications,
  ): void {
    if (evidence.isCompileTimeMetadata(node)) return;
    if (operations.nativeUnreachable(node)) return;
    const sourceTypes = exactSourceTypes(node, operations, storage, expectedTypes.callableTarget(node));
    const sourceType = sourceTypes[0];
    const borrowedSequence = operations.borrowedSequence(node);
    if (borrowedSequence !== undefined) {
      const element = getCsharpCollectionElementTargetType(borrowedSequence.sourceCarrier);
      if (element !== undefined) classifyBorrowedSequencePairs(borrowedSequence, element);
    }
    for (const candidate of sourceTypes) {
      classifyPair(candidate, candidate, "implicit", node);
      const element = getCsharpGenericOptionalParts(candidate)?.element ?? getCsharpNullableElementTargetType(candidate);
      if (element !== undefined) classifyPair(element, candidate, "implicit", node);
      const parent = policy.ast.parent(node);
      if (candidate.kind === "type-parameter" && getCsharpGenericOptionalParts(candidate) === undefined &&
        parent !== undefined && policy.ast.is.IsBindingElement(parent) && Node_Initializer(policy.ast, parent) === node) {
        classifyPair(candidate, csharpNullableTargetType(candidate), "implicit", node);
      }
    }
    const requiredTypes = expectedTypes.requiredTypesForExpression(node);
    for (const targetType of expectedTypes.forExpression(node)) {
      if (!policy.ast.is.IsObjectLiteralExpression(node)) {
        for (const candidate of sourceTypes) {
          classifyExpression(node, candidate, targetType, "implicit",
            expectedTypes.requiresExactIntegerConversion(node, targetType),
            requiredTypes.some(required => targetTypeRefEquals(required, targetType)));
        }
      }
      classifyArrayCarrier(node, targetType, expectedTypes, operations, storage);
      if (policy.ast.is.IsObjectLiteralExpression(node)) {
        const unionCarrier = objectShapes.resolveObjectLiteralUnionCarrier(node, targetType);
        const constructionTarget = unionCarrier ?? getCsharpNullableElementTargetType(targetType) ?? targetType;
        const dictionary = isCsharpRecordDictionaryTargetType(constructionTarget) ? constructionTarget
          : sourceTypes.find(isCsharpRecordDictionaryTargetType);
        if (dictionary !== undefined) {
          classifyExpression(node, dictionary, targetType, "implicit");
        } else {
          const shape = objectShapes.resolveTarget(constructionTarget) ?? objectShapes.resolveNode(node);
          const construction = objectShapes.resolveObjectLiteralTargetShape(shape, node, sourceFile);
          if (construction?.kind === "resolved") {
            const projection = isCsharpJsValueTargetType(targetType) &&
              !isCsharpJsValueObjectShapeTargetType(construction.shape.targetType)
              ? projectCsharpJsValueObjectLiteralShape(construction.shape) : undefined;
            const constructed = projection?.kind === "resolved" ? projection.shape.targetType
              : construction.shape.targetType;
            classifyExpression(node, constructed, targetType, "implicit");
          }
        }
        classifyPair(unionCarrier, targetType, "implicit", node);
      }
    }
    if (
      sourceType !== undefined &&
      expressionMayHaveSpecificConversion(node, sourceFile)
    ) {
      for (const candidate of sourceTypes) {
        classifyExpression(node, candidate, candidate, "implicit");
      }
    }
    classifyAssertion(node, operations, storage);
    classifyUndefinedInitializer(node);
    classifyYieldResume(node);
    classifyCallUses(node, operations, storage);
    policy.ast.forEachChild(
      node,
      (child) => {
        if (child !== undefined) {
          visit(child, sourceFile, operations, expectedTypes, storage);
        }
      },
    );
  }

  function classifyAssertion(
    node: Node,
    operations: CsharpTargetOperationClassifications,
    storage: CsharpStorageRepresentationClassifications,
  ): void {
    if (policy.ast.is.IsNonNullExpression(node)) {
      const expression = policy.ast.as.AsNonNullExpression(node)?.Expression;
      const targetType = operations.resultType(node) ??
        evidence.valueRefinement(node)?.flowReadTargetType ??
        evidence.nodeTargetType(node);
      if (expression !== undefined) {
        for (const sourceType of exactSourceTypes(
          expression,
          operations,
          storage,
        )) {
          classifyExpression(expression, sourceType, targetType, "explicit");
        }
      }
      return;
    }
    if (
      !policy.ast.is.IsAsExpression(node) &&
      !policy.ast.is.IsTypeAssertion(node)
    ) {
      return;
    }
    const assertion = policy.ast.is.IsAsExpression(node)
      ? policy.ast.as.AsAsExpression(node)
      : policy.ast.as.AsTypeAssertion(node);
    const expression = assertion?.Expression;
    const targetNode = assertion?.Type;
    if (expression === undefined || targetNode === undefined) {
      return;
    }
    const targetType = evidence.nodeTargetType(targetNode);
    for (const sourceType of exactSourceTypes(expression, operations, storage)) {
      classifyExpression(expression, sourceType, targetType, "explicit");
      classifyExpression(expression, sourceType, targetType, "implicit");
    }
  }

  function exactSourceTypes(
    node: Node,
    operations: CsharpTargetOperationClassifications,
    storage: CsharpStorageRepresentationClassifications,
    callableTarget?: TargetTypeRef,
  ): readonly TargetTypeRef[] {
    const candidates = [
      callableTarget,
      operations.resultType(node),
      evidence.valueRefinement(node)?.flowReadTargetType,
      storage.type(node),
      evidence.nodeTargetType(node),
    ];
    const byIdentity = new Map<string, TargetTypeRef>();
    for (const candidate of candidates) {
      if (candidate !== undefined) {
        byIdentity.set(targetTypeRefKey(candidate), candidate);
      }
    }
    return Object.freeze([...byIdentity.values()]);
  }

  function classifyArrayCarrier(
    node: Node,
    targetType: TargetTypeRef,
    expectedTypes: CsharpExpectedTypeClassifications,
    operations: CsharpTargetOperationClassifications,
    storage: CsharpStorageRepresentationClassifications,
  ): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    classifyPair(
      expectedTypes.arrayLiteralCarrier(node, targetType),
      targetType,
      "implicit",
      node,
    );
    const elementTarget = getCsharpArrayLiteralElementTargetType(targetType);
    if (elementTarget === undefined) return;
    for (const contribution of policy.ast.elements(node)) {
      if (contribution === undefined || !policy.ast.is.IsSpreadElement(contribution)) continue;
      const operand = policy.ast.as.AsSpreadElement(contribution)?.Expression;
      if (operand === undefined) continue;
      classifyBorrowedSequencePairs(operations.borrowedSequence(operand), elementTarget);
      for (const carrier of exactSourceTypes(operand, operations, storage)) {
        const element = getCsharpCollectionElementTargetType(carrier);
        for (const source of carrier.kind === "tuple" ? carrier.elements : element === undefined ? [] : [element]) {
          classifyPair(source, elementTarget, "implicit", contribution);
        }
      }
    }
  }

  function classifyBorrowedSequencePairs(
    sequence: CsharpBorrowedSequenceInput | undefined,
    elementTarget: TargetTypeRef,
  ): void {
    if (sequence === undefined) return;
    for (const input of sequence.inputs) {
      if (input.kind !== "sequence") continue;
      for (const element of input.elements) {
        classifyPair(element, elementTarget, "implicit", input.expression);
      }
    }
  }

  function classifyUndefinedInitializer(node: Node): void {
    if (!policy.ast.is.IsVariableDeclaration(node)) {
      return;
    }
    const declaration = policy.ast.as.AsVariableDeclaration(node);
    if (declaration?.Initializer !== undefined) {
      return;
    }
    classifyPair(
      csharpAbsenceTargetType(),
      evidence.storageTargetType(node),
      "implicit",
      node,
    );
  }

  function classifyYieldResume(node: Node): void {
    if (policy.ast.is.IsVariableDeclaration(node)) {
      const initializer = policy.ast.as.AsVariableDeclaration(node)?.Initializer;
      const yieldExpression = directCsharpSourceYieldExpression(
        policy.ast,
        initializer,
      );
      classifyYieldResumePair(
        yieldExpression,
        evidence.storageTargetType(node),
      );
      return;
    }
    if (!policy.ast.is.IsReturnStatement(node)) {
      return;
    }
    const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
    const yieldExpression = directCsharpSourceYieldExpression(
      policy.ast,
      expression,
    );
    const source = yieldExpression === undefined
      ? undefined
      : evidence.yield(yieldExpression);
    const targetProtocol = source === undefined
      ? undefined
      : getCsharpGeneratorProtocol(
          evidence.generatorTargetType(source.generator.declaration),
        );
    classifyYieldResumePair(yieldExpression, targetProtocol?.returnType);
  }

  function classifyYieldResumePair(
    yieldExpression: Node | undefined,
    targetType: TargetTypeRef | undefined,
  ): void {
    if (yieldExpression === undefined || targetType === undefined) {
      return;
    }
    const source = evidence.yield(yieldExpression);
    if (source === undefined) {
      return;
    }
    const sourceProtocol = source.yieldKind === "delegate"
      ? getCsharpGeneratorProtocol(
          evidence.yieldTargetType(yieldExpression),
        )
      : getCsharpGeneratorProtocol(
          evidence.generatorTargetType(source.generator.declaration),
        );
    classifyPair(
      source.yieldKind === "delegate"
        ? sourceProtocol?.returnType
        : sourceProtocol?.nextType,
      targetType,
      "implicit",
      yieldExpression,
    );
  }

  function classifyCallUses(
    node: Node,
    operations: CsharpTargetOperationClassifications,
    storage: CsharpStorageRepresentationClassifications,
  ): void {
    const classification = operations.call(node);
    if (classification === undefined) {
      return;
    }
    if (classification.sourceResult !== undefined) {
      classifyPair(classification.sourceResult.nativeType, classification.sourceResult.selectedType, "explicit", node);
    }
    const source = classification.source ?? (
      classification.target?.kind === "resolved"
        ? classification.target.source
        : undefined
    );
    if (source !== undefined) {
      const queries = policy.semanticsFor(node);
      const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
      const parameters = selectedArguments.map(argument => {
        const symbol = queries.declarations.typeSymbol(argument.typeParameter);
        const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
          .filter(declaration => policy.ast.is.IsTypeParameterDeclaration(declaration));
        return declarations.length === 1 ? declarations[0] : undefined;
      });
      const substitutions = new Map(parameters.flatMap((parameter, index) => {
        const type = classification.sourceTypeArguments?.[index];
        const identity = parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast)?.identity;
        return identity === undefined || type === undefined ? [] : [[identity, type] as const];
      }));
      for (const [index, argument] of selectedArguments.entries()) {
        const parameter = parameters[index];
        const type = classification.sourceTypeArguments?.[index];
        const requirements = parameter === undefined ? undefined : evidence.typeParameterConstraints(parameter);
        if (type === undefined || requirements?.kind !== "resolved") continue;
        for (const constraint of requirements.constraints) {
          if (constraint.kind === "type") objectShapes.registerStructuralInterface(node, type,
            substituteTargetTypeParameters(constraint.type, substitutions), argument.selectedType);
        }
      }
      const boundParameterIndexes = new Set(
        source.sourceArgumentBindings.map((binding) =>
          binding.sourceParameterIndex),
      );
      for (
        let parameterIndex = 0;
        parameterIndex < source.sourceSelectedSignatureParameters.length;
        parameterIndex += 1
      ) {
        const parameter = source.sourceSelectedSignatureParameters[
          parameterIndex
        ];
        if (
          boundParameterIndexes.has(parameterIndex) ||
          parameter === undefined ||
          parameter.rest ||
          !parameter.acceptsOmission
        ) {
          continue;
        }
        classifyPair(
          csharpAbsenceTargetType(),
          classification.sourceParameterTypes?.[parameterIndex],
          "implicit",
          node,
        );
      }
    }
    if (classification.target?.kind !== "resolved") {
      return;
    }
    if (classification.target.call.origin === "provider") {
      const argumentsByIndex = new Map(classification.target.call.arguments.map(argument =>
        [argument.effectiveArgumentIndex, argument]));
      for (const mapping of classification.target.call.argumentMappings) {
        if (mapping.kind !== "by-value") continue;
        const argument = argumentsByIndex.get(mapping.effectiveArgumentIndex);
        const expression = argument === undefined ? undefined
          : classification.target.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
        if (expression !== undefined) {
          classifyExpression(expression, mapping.sourceType, mapping.targetType, "implicit", false, true);
          let source = mapping.sourceType;
          let target = mapping.targetType;
          let conversion = mapping.conversion;
          while (conversion.kind === "nullable-map") {
            source = conversion.sourceElement;
            target = conversion.targetElement;
            conversion = conversion.conversion;
          }
          if (conversion.kind === "delegate-adapter") {
            classifyExpression(expression, source, target, "implicit", false, true);
            const key = pairKey(source, target, "implicit");
            const selections = expressionSelections.get(expression);
            const previous = selections?.get(key);
            if (previous !== undefined) selections!.set(key, Object.freeze({ ...previous, selection: conversion,
              ...(classification.target.call.targetMember.csharpInvocation?.kind === "native-event-remove" &&
                conversion.strategy === "adaptation" ? { identityRequired: true } : {}),
            }));
          }
        }
      }
    }
    const member = classification.target.call.targetMember;
    for (const argument of classification.target.call.arguments) {
      if (argument.targetParameter.csharpValueProjection !== "properties") continue;
      const subject = classification.target.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      if (subject === undefined) continue;
      const type = storage.type(subject) ?? evidence.nodeTargetType(subject);
      for (const memberType of csharpPropertyProjectionValueTypes(type, objectShapes, policy.typeDefinitions)) {
        classifyPair(memberType, csharpTsValueTargetType(), "implicit", subject);
      }
    }
    if (member.returnType === undefined) {
      return;
    }
    for (const requirement of member.csharpArtifactRequirements ?? []) {
      if (requirement.kind !== "object-shape-projection") {
        continue;
      }
      const subject = requirement.source.kind === "receiver"
        ? classification.target.source.sourceReceiver?.expression
        : classification.target.source.sourceArguments[
            requirement.source.index
          ]?.expression;
      if (subject === undefined) {
        continue;
      }
      const subjectType = requirement.projection === "assign"
        ? member.returnType
        : storage.type(subject) ?? evidence.nodeTargetType(subject);
      const shape = requirement.projection === "assign"
        ? objectShapes.resolveTarget(subjectType) ?? objectShapes.resolveNode(subject)
        : objectShapes.resolveNode(subject) ?? objectShapes.resolveTarget(subjectType);
      if (requirement.projection === "assign") {
        const assignmentSubject = classification.target.source.sourceArguments[
          requirement.assignmentSource.index
        ]?.expression;
        const assignmentType = assignmentSubject === undefined
          ? undefined
          : storage.type(assignmentSubject) ??
            evidence.nodeTargetType(assignmentSubject);
        const assignmentShape = assignmentSubject === undefined
          ? undefined
          : objectShapes.resolveNode(assignmentSubject) ??
            objectShapes.resolveTarget(assignmentType);
        if (shape === undefined || assignmentShape === undefined) {
          continue;
        }
        for (const sourceMember of assignmentShape.members) {
          if (sourceMember.sourceKey.kind !== "property" ||
            sourceMember.memberKind !== "property") {
            continue;
          }
          const targetMember = resolveCsharpObjectShapeMemberBySourceContract(
            shape,
            sourceMember.sourceName,
            "finalized-object-spread-member",
          );
          if (targetMember.kind === "resolved") {
            classifyPair(
              sourceMember.type,
              targetMember.member.type,
              "implicit",
              assignmentSubject,
            );
          }
        }
        continue;
      }
      const projectionValueType = objectProjectionValueType(
        requirement.projection,
        member.returnType,
      );
      if (shape === undefined || projectionValueType === undefined) {
        continue;
      }
      for (const shapeMember of shape.members) {
        classifyPair(
          shapeMember.type,
          projectionValueType,
          "implicit",
          subject,
        );
      }
    }
  }

  function objectProjectionValueType(
    projection: "keys" | "values" | "entries" | "has-own" | "properties",
    resultType: TargetTypeRef,
  ): TargetTypeRef | undefined {
    if (projection === "properties") return isCsharpJsValueTargetType(resultType) ? resultType : undefined;
    if (projection === "values") {
      return getCsharpJsArrayElementTargetType(resultType);
    }
    if (projection !== "entries") {
      return undefined;
    }
    const elementType = getCsharpJsArrayElementTargetType(resultType);
    return elementType?.kind === "tuple" && elementType.elements.length === 2
      ? elementType.elements[1]
      : undefined;
  }

  function classifyPair(
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
    node: Node | undefined,
  ): CsharpConversionSelection | undefined {
    if (source === undefined || target === undefined) {
      return unavailableConversion;
    }
    const key = pairKey(source, target, mode);
    const previous = pairSelections.get(key);
    if (previous !== undefined) {
      return previous;
    }
    if (!reserveClassification(node)) {
      return undefined;
    }
    const selected = selectCsharpConversion(policy, source, target, mode);
    pairSelections.set(key, selected);
    return selected;
  }

  function classifyExpression(
    expression: Node,
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
    exactInteger = false,
    runtimeDemand = mode === "explicit",
  ): CsharpConversionSelection | undefined {
    if (source === undefined || target === undefined) {
      return unavailableConversion;
    }
    const key = pairKey(source, target, mode);
    let selections = expressionSelections.get(expression);
    const previousClassification = selections?.get(key);
    const previous = previousClassification?.selection;
    if (previous !== undefined && (!exactInteger || previous.kind !== "rejected")) {
      if (runtimeDemand && previousClassification?.runtimeDemand !== true) {
        selections!.set(key, Object.freeze({ ...previousClassification!, runtimeDemand: true }));
      }
      return previous;
    }
    if (!reserveClassification(expression)) {
      return undefined;
    }
    const sourceFile = policy.ast.getSourceFile(expression);
    const reference = policy.navigation.referenceFor(expression);
    if (reference !== undefined && isSourceOwnedProjectReference(reference, policy) &&
      policy.ast.is.IsFunctionDeclaration(reference.declaration) &&
      policy.ast.is.IsSourceFile(policy.ast.parent(reference.declaration)) &&
      !policy.navigation.declarationUseSummary(reference.declaration).bindingWritten) {
      directCallables.set(expression, Object.freeze({ ...reference }));
    }
    let candidate = selectCsharpIntegerTruncationConversion(policy, expression, sourceFile, source, target) ?? selectCsharpExpressionConversion(
      { ...policy, objectShapes },
      expression,
      source,
      target,
      mode,
    );
    if (exactInteger && mode === "implicit" && candidate.kind === "rejected") {
      candidate = selectCsharpExactIntegerConversion(source, target) ?? candidate;
    }
    if ((candidate.kind === "rejected" || candidate.kind === "implicit") &&
      objectShapes.registerStructuralInterface(expression, source, target)) {
      candidate = { kind: "implicit", proof: "object-shape-interface" };
    }
    const selected = candidate.kind === "delegate-adapter" && candidate.strategy === "adaptation" &&
        (
          sourceFile === undefined ||
          !isSourceOwnedCallableRuntimeCarrierSubject(
            expression,
            sourceFile,
            policy,
          )
        )
      ? Object.freeze({
          kind: "rejected" as const,
          reason:
            "C# delegate adaptation requires a source-owned callable; provider-owned delegate conversion requires provider conversion metadata.",
        })
      : candidate;
    if (selections === undefined) {
      selections = new Map();
      expressionSelections.set(expression, selections);
    }
    selections.set(key, Object.freeze({ source, target, selection: selected,
      runtimeDemand: runtimeDemand || previousClassification?.runtimeDemand === true }));
    return selected;
  }

  function expressionMayHaveSpecificConversion(
    node: Node,
    sourceFile: SourceFile,
  ): boolean {
    return objectShapes.resolveNode(node) !== undefined ||
      isSourceOwnedCallableRuntimeCarrierSubject(node, sourceFile, policy) ||
      policy.ast.is.IsArrayLiteralExpression(node) ||
      policy.ast.is.IsStringLiteral(node) ||
      policy.ast.is.IsNoSubstitutionTemplateLiteral(node) ||
      policy.ast.is.IsNumericLiteral(node) ||
      policy.ast.is.IsBigIntLiteral(node) ||
      policy.ast.is.IsPrefixUnaryExpression(node) ||
      policy.ast.is.IsCallExpression(node) ||
      policy.ast.kindName(node) === "KindTrueKeyword" ||
      policy.ast.kindName(node) === "KindFalseKeyword";
  }

  function reserveClassification(node: Node | undefined): boolean {
    classificationCount += 1;
    if (classificationCount <= maximumConversionClassifications) {
      return true;
    }
    if (issues.length === 0) {
      const issueNode = node ?? policy.sourceFiles[0];
      if (issueNode !== undefined) {
        issues.push(Object.freeze({
          node: issueNode,
          code: "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED",
          message:
            "C# conversion analysis exceeds the finite " +
            maximumConversionClassifications +
            "-classification limit.",
        }));
      }
    }
    return false;
  }
}

function pairKey(
  source: TargetTypeRef,
  target: TargetTypeRef,
  mode: CsharpConversionMode,
): string {
  const sourceKey = targetTypeRefKey(source);
  const targetKey = targetTypeRefKey(target);
  return mode + ":" + sourceKey.length + ":" + sourceKey +
    targetKey.length + ":" + targetKey;
}
