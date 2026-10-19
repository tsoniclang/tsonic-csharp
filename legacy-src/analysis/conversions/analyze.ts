import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { Node, SourceFile } from "@tsonic/tsts";
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
  csharpTsValueTargetType,
  getCsharpGeneratorProtocol,
  getCsharpJsArrayElementTargetType,
  getCsharpArrayLiteralElementTargetType,
  getCsharpCollectionElementTargetType,
  csharpTargetBindingFact,
  isCsharpReferenceCarrier,
  isSourceOwnedCallableRuntimeCarrierSubject,
  isSourceOwnedProjectReference,
  targetTypeRefKey,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import {
  directCsharpSourceYieldExpression,
} from "../../target-model/syntax/yield-expression.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "../../target-model/types/index.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpStructuralInterfaceRegistration } from "../objects/structural-interfaces.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import type { CsharpBorrowedSequenceInput } from "../../target-model/records/borrowed-sequences.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpConversionAnalysis, CsharpPreparedConversionClassifications } from "./model.js";
import type { CsharpConversionClassifications, CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/conversions.js";
import { sealCsharpDelegateAdapterIdentities } from "./delegate-identities.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { selectCsharpIntegerTruncationConversion } from "../../policy/conversions/integer-truncation.js";
import { selectCsharpExactIntegerConversion } from "../../policy/conversions/exact-integer.js";
import { admitCsharpConversionSelection } from "./validation.js";
import { selectCsharpPropertyProjections } from "./property-projections.js";
import { createCsharpExactLiteralRequestCollector } from "./literal-requests.js";
import { sealCsharpConversionUses, type CsharpCallConversionRequests } from "./use-admission.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native-demand.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";

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
  const callConversions = new Map<Node, CsharpCallConversionRequests>();
  let delegateAdapters: ReturnType<typeof sealCsharpDelegateAdapterIdentities> = new Map();
  const issues: CsharpConversionIssue[] = [];
  const propertyProjections = new WeakMap<Node, ReadonlyMap<string, readonly CsharpObjectShapeMemberFact[]>>();
  const directCallables = new WeakMap<Node, NonNullable<ReturnType<CsharpPolicyContext["navigation"]["referenceFor"]>>>();
  let classificationCount = 0;
  let closed = false;
  let preparedClassifications: CsharpPreparedConversionClassifications | undefined;
  let preparedOperations: CsharpTargetOperationClassifications | undefined;
  let preparedValueReads: import("../../target-model/records/conversions.js").CsharpValueReadClassifications | undefined;
  let sealedClassifications: CsharpConversionClassifications | undefined;
  const literalRequests = createCsharpExactLiteralRequestCollector(policy.literalValues);
  const conversionPolicy = Object.freeze({
    ast: policy.ast, literalValues: policy.literalValues, typeDefinitions: policy.typeDefinitions,
    projectTypes: policy.projectTypes, providers: policy.providers, target: policy.target,
    navigation: policy.navigation, sourceFacts: policy.sourceFacts, objectShapes,
  });

  const openClassifications: CsharpConversionClassifications = {
    issues,
    propertyProjection: Object.freeze({ get: (expression, source) => propertyProjections.get(expression)?.get(targetTypeRefKey(source)) }),
    delegateAdapters: Object.freeze({ get: scope => delegateAdapters.get(scope) ?? [] }),
    delegateAdapter: Object.freeze({ get: (expression, source, target) => expressionSelections.get(expression)?.get(pairKey(source, target, "implicit"))?.delegateIdentity }),
    directCallableReference: Object.freeze({ get: expression => directCallables.get(expression) }),
    conversion: Object.freeze({ get(source, target, mode) {
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
    } }),
    expressionConversion: Object.freeze({ get(expression, source, target, mode) {
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
    } }),
  };
  const classifications = Object.freeze(openClassifications);

  const analysis: CsharpConversionAnalysis = {
    classifications,
    prepare({ operations, expectedTypes, valueReads }) {
      if (preparedClassifications !== undefined) return preparedClassifications;
      preparedOperations = operations;
      preparedValueReads = valueReads;
      for (const sourceFile of policy.sourceFiles) {
        visit(sourceFile, sourceFile, operations, expectedTypes, valueReads);
      }
      preparedClassifications = Object.freeze({ ...classifications, exactLiteralRequests: literalRequests.seal() });
      return preparedClassifications;
    },
    close(nativeDemand, requiredRecords) {
      if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Native conversion preparation closes exactly once.");
      if (preparedClassifications === undefined || preparedOperations === undefined || preparedValueReads === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Native conversion uses require completed preparation.");
      const admitted = sealCsharpConversionUses(nativeDemand, preparedOperations, (expression, source, target, mode, exactInteger, boundary, sourceCompletion) => {
        const selected = boundary === undefined ? classifyExpression(expression, source, target, mode, exactInteger, sourceCompletion) : boundary.selection;
        if (selected === undefined) return undefined;
        if (boundary === undefined && sourceCompletion?.kind !== "void") classifyPair(source, target, mode, expression);
        const key = pairKey(source, target, mode);
        if (boundary !== undefined) {
          const selections = expressionSelections.get(expression) ?? new Map();
          selections.set(key, Object.freeze({ source, target, selection: selected,
            ...(boundary.identityRequired === true ? { identityRequired: true } : {}) }));
          expressionSelections.set(expression, selections);
        }
        const classification = expressionSelections.get(expression)?.get(key);
        return classification === undefined ? undefined : Object.freeze({ key, classification });
      }, (expression, source, target) => classifyPair(source, target, "implicit", expression), requiredRecords, issues, callConversions);
      issues.push(...admitted.issues);
      delegateAdapters = sealCsharpDelegateAdapterIdentities(policy, preparedValueReads, admitted.expressions, issues);
      closed = true;
      Object.freeze(issues);
      const sealedIssues = Object.freeze([...issues]);
      const sealed: CsharpConversionClassifications = {
        issues: sealedIssues,
        propertyProjection: Object.freeze({ get: openClassifications.propertyProjection.get }),
        delegateAdapters: Object.freeze({ get: openClassifications.delegateAdapters.get }),
        delegateAdapter: Object.freeze({ get: (expression, source, target) =>
          admitted.expressions.get(expression)?.get(pairKey(source, target, "implicit"))?.delegateIdentity }),
        directCallableReference: Object.freeze({ get: openClassifications.directCallableReference.get }),
        conversion: Object.freeze({ get(source, target, mode) {
          if (source === undefined || target === undefined) {
            return unavailableConversion;
          }
          return pairSelections.get(pairKey(source, target, mode));
        } }),
        expressionConversion: Object.freeze({ get(expression, source, target, mode) {
          if (source === undefined || target === undefined) {
            return unavailableConversion;
          }
          const key = pairKey(source, target, mode);
          return admitted.expressions.get(expression)?.get(key)?.selection;
        } }),
      };
      sealedClassifications = Object.freeze(sealed);
    },
    seal() {
      return sealedClassifications ?? failTargetAnalysisInvariant("tsonic-csharp", "Native conversion publication requires its closed preparation.");
    },
  };
  return Object.freeze(analysis);

  function visit(
    node: Node,
    sourceFile: SourceFile,
    operations: CsharpTargetOperationClassifications,
    expectedTypes: CsharpExpectedTypeClassifications,
    valueReads: CsharpValueReadClassifications,
  ): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (operations.nativeUnreachable.get(node)) return;
    const sourceTypes = exactSourceTypes(node, valueReads, expectedTypes.callableTarget.get(node));
    const expectedTargets = expectedTypes.expectedType.get(node);
    const literalTargets = policy.ast.is.IsArrayLiteralExpression(node) ? expectedTargets.flatMap(target => {
      const carrier = expectedTypes.arrayLiteralCarrier.get(node, target);
      return carrier === undefined ? [target] : [target, carrier];
    }) : expectedTargets;
    literalRequests.requestReads(node, sourceTypes, literalTargets, operations);
    if (policy.literalValues.literalValue.get(node) !== undefined) {
      const source = valueReads.valueRead.get(node)?.value;
      if (source !== undefined) for (const target of expectedTypes.expectedType.get(node)) {
        classifyExpression(node, source, target, "implicit", expectedTypes.exactIntegerConversion.get(node, target));
      }
    }
    const borrowedSequence = operations.borrowedSequence.get(node);
    if (borrowedSequence !== undefined) {
      const element = getCsharpCollectionElementTargetType(borrowedSequence.sourceCarrier);
      if (element !== undefined) classifyBorrowedSequencePairs(borrowedSequence, element);
    }
    for (const targetType of expectedTypes.expectedType.get(node)) {
      classifyArraySpreadElements(node, targetType, operations, valueReads);
    }
    classifyYieldResume(node);
    classifyInvocationUses(node, operations);
    classifySelectedTargetCallUses(operations.selectedCall.get(node)?.target ?? operations.selectedConstruction.get(node)?.target, valueReads);
    policy.ast.forEachChild(
      node,
      (child) => {
        if (child !== undefined) {
          visit(child, sourceFile, operations, expectedTypes, valueReads);
        }
      },
    );
  }

  function exactSourceTypes(
    node: Node,
    valueReads: CsharpValueReadClassifications,
    callableTarget?: TargetTypeRef,
  ): readonly TargetTypeRef[] {
    const read = valueReads.valueRead.get(node);
    const candidates = [
      callableTarget,
      read?.selectedOperation,
      read?.narrowedRead,
      read?.storage,
      read?.source,
    ];
    const byIdentity = new Map<string, TargetTypeRef>();
    for (const candidate of candidates) {
      if (candidate !== undefined) {
        byIdentity.set(targetTypeRefKey(candidate), candidate);
      }
    }
    return Object.freeze([...byIdentity.values()]);
  }

  function classifyArraySpreadElements(
    node: Node,
    targetType: TargetTypeRef,
    operations: CsharpTargetOperationClassifications,
    valueReads: CsharpValueReadClassifications,
  ): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    const elementTarget = getCsharpArrayLiteralElementTargetType(targetType);
    if (elementTarget === undefined) return;
    for (const contribution of policy.ast.elements(node)) {
      if (contribution === undefined || !policy.ast.is.IsSpreadElement(contribution)) continue;
      const operand = policy.ast.as.AsSpreadElement(contribution)?.Expression;
      if (operand === undefined) continue;
      classifyBorrowedSequencePairs(operations.borrowedSequence.get(operand), elementTarget);
      for (const carrier of exactSourceTypes(operand, valueReads)) {
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

  function classifyYieldResume(node: Node): void {
    if (policy.ast.is.IsVariableDeclaration(node)) {
      const initializer = policy.ast.as.AsVariableDeclaration(node)?.Initializer;
      const yieldExpression = directCsharpSourceYieldExpression(
        policy.ast,
        initializer,
      );
      classifyYieldResumePair(
        yieldExpression,
        evidence.storageTargetType.get(node),
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
      : evidence.yield.get(yieldExpression);
    const targetProtocol = source === undefined
      ? undefined
      : getCsharpGeneratorProtocol(
          evidence.generatorTargetType.get(source.generator.declaration),
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
    const source = evidence.yield.get(yieldExpression);
    if (source === undefined) {
      return;
    }
    const sourceProtocol = source.yieldKind === "delegate"
      ? getCsharpGeneratorProtocol(
          evidence.yieldTargetType.get(yieldExpression),
        )
      : getCsharpGeneratorProtocol(
          evidence.generatorTargetType.get(source.generator.declaration),
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

  function classifyInvocationUses(
    node: Node,
    operations: CsharpTargetOperationClassifications,
  ): void {
    const call = operations.selectedCall.get(node);
    const classification = call ?? operations.selectedConstruction.get(node);
    if (classification === undefined) {
      return;
    }
    let completion: CsharpCallConversionRequests["completion"];
    const omitted: { readonly source: TargetTypeRef; readonly target: TargetTypeRef | undefined }[] = [];
    if (call?.sourceResult !== undefined) {
      classifyPair(call.sourceResult.nativeType, call.sourceResult.selectedType, "explicit", node);
    }
    if (call !== undefined && (call.optionalCallee !== undefined || call.optionalReceiver?.guard === true)) {
      const source = call.sourceResult?.selectedType ?? (call.target?.kind === "resolved"
        ? call.target.call.targetMember.returnType : undefined);
      const target = call.selectedResultType;
      if (source !== undefined && target !== undefined) {
        classifyPair(source, target, "implicit", node);
        completion = Object.freeze({ source, target });
      }
    }
    const source = call?.source ?? (classification.target?.kind === "source-owned"
      ? classification.target.source
      : undefined);
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
        const type = call?.sourceTypeArguments?.[index];
        const identity = parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast)?.identity;
        return identity === undefined || type === undefined ? [] : [[identity, type] as const];
      }));
      for (const [index, argument] of selectedArguments.entries()) {
        const parameter = parameters[index];
        const type = call?.sourceTypeArguments?.[index];
        const requirements = parameter === undefined ? undefined : evidence.typeParameterConstraints.get(parameter);
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
        const absence = csharpAbsenceTargetType();
        const target = classification.sourceParameterTypes?.[parameterIndex];
        classifyPair(absence, target, "implicit", node);
      }
    }
    const grouping = classification.target?.kind === "source-owned" ? classification.sourceArgumentGrouping : undefined;
    if (grouping?.kind === "grouped") for (const group of grouping.groups) {
      if (group.collect || group.arguments.length > 0) continue;
      const absence = csharpAbsenceTargetType();
      classifyPair(absence, group.type, "implicit", node);
      omitted.push(Object.freeze({ source: absence, target: group.type }));
    }
    if (completion !== undefined || omitted.length > 0) {
      callConversions.set(node, Object.freeze({ ...(completion === undefined ? {} : { completion }),
        omitted: Object.freeze(omitted) }));
    }
  }

  function classifySelectedTargetCallUses(
    selection: CsharpTargetCallSelection | undefined,
    valueReads: CsharpValueReadClassifications,
  ): void {
    if (selection?.kind !== "resolved") {
      return;
    }
    if (selection.call.origin === "provider") {
      const argumentsByIndex = new Map(selection.call.arguments.map(argument =>
        [argument.effectiveArgumentIndex, argument]));
      for (const mapping of selection.call.argumentMappings) {
        if (mapping.kind !== "by-value") continue;
        const argument = argumentsByIndex.get(mapping.effectiveArgumentIndex);
        const expression = argument === undefined ? undefined
          : selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
        if (expression !== undefined) {
          literalRequests.requestConversion(expression, mapping.sourceType, mapping.targetType, mapping.conversion);
        }
      }
    }
    const member = selection.call.targetMember;
    for (const argument of selection.call.arguments) {
      if (argument.targetParameter.csharpValueProjection !== "properties") continue;
      const subject = selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      if (subject === undefined) continue;
      const type = valueReads.valueRead.get(subject)?.storedValue;
      const binding = selection.source.sourceArgumentBindings.find(binding =>
        binding.effectiveArgumentIndex === argument.effectiveArgumentIndex);
      const projected = binding === undefined ? undefined
        : selectCsharpPropertyProjections(subject, type, binding.selectedParameterType, policy, objectShapes);
      if (projected === undefined) {
        issues.push({ node: subject, code: "CSHARP_PROPERTY_PROJECTION_NOT_CLOSED",
          message: "Native property projection requires exact checked selected-parameter member correspondence." });
        continue;
      }
      const orders = new Map<string, readonly CsharpObjectShapeMemberFact[]>();
      for (const projection of projected) {
        if (!reserveClassification(subject)) return;
        orders.set(targetTypeRefKey(projection.source), projection.members);
        for (const member of projection.members) {
          if (!reserveClassification(subject)) return;
          classifyPair(member.type, csharpTsValueTargetType(), "implicit", subject);
        }
      }
      propertyProjections.set(subject, orders);
    }
    if (member.returnType === undefined) {
      return;
    }
    for (const requirement of member.csharpArtifactRequirements ?? []) {
      if (requirement.kind !== "object-shape-projection") {
        continue;
      }
      const subject = requirement.source.kind === "receiver"
        ? selection.source.sourceReceiver?.expression
        : selection.source.sourceArguments[
            requirement.source.index
          ]?.expression;
      if (subject === undefined) {
        continue;
      }
      const subjectType = requirement.projection === "assign"
        ? member.returnType
        : valueReads.valueRead.get(subject)?.storedValue;
      const shape = requirement.projection === "assign"
        ? objectShapes.resolveTarget(subjectType) ?? objectShapes.resolveNode(subject)
        : objectShapes.resolveNode(subject) ?? objectShapes.resolveTarget(subjectType);
      if (requirement.projection === "assign") {
        const assignmentSubject = selection.source.sourceArguments[
          requirement.assignmentSource.index
        ]?.expression;
        const assignmentType = assignmentSubject === undefined
          ? undefined
          : valueReads.valueRead.get(assignmentSubject)?.storedValue;
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
    projection: "keys" | "values" | "entries" | "has-own",
    resultType: TargetTypeRef,
  ): TargetTypeRef | undefined {
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
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "A closed conversion preparation cannot classify another native pair.", node);
    if (source === undefined || target === undefined) {
      return unavailableConversion;
    }
    const key = pairKey(source, target, mode);
    const previous = pairSelections.get(key);
    if (previous !== undefined && previous.kind !== "rejected") {
      return previous;
    }
    if (node !== undefined) prepareStructuralDependencies(node, source, target);
    if (!reserveClassification(node)) {
      return undefined;
    }
    const selected = admitCsharpConversionSelection(conversionPolicy, source, target,
      selectCsharpConversion(conversionPolicy, source, target, mode));
    pairSelections.set(key, selected);
    return selected;
  }

  function classifyExpression(
    expression: Node,
    source: TargetTypeRef | undefined,
    target: TargetTypeRef | undefined,
    mode: CsharpConversionMode,
    exactInteger = false,
    sourceCompletion?: CsharpNativeCompletion,
  ): CsharpConversionSelection | undefined {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "A closed conversion preparation cannot classify another native expression.", expression);
    if (source === undefined || target === undefined) {
      return unavailableConversion;
    }
    const key = pairKey(source, target, mode);
    let selections = expressionSelections.get(expression);
    const previousClassification = selections?.get(key);
    const previous = previousClassification?.selection;
    if (previous !== undefined && previous.kind !== "rejected") {
      return previous;
    }
    prepareStructuralDependencies(expression, source, target);
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
      conversionPolicy,
      expression,
      source,
      target,
      mode,
    );
    if (exactInteger && mode === "implicit" && candidate.kind === "rejected") {
      candidate = selectCsharpExactIntegerConversion(source, target) ?? candidate;
    }
    const selected = admitCsharpConversionSelection(conversionPolicy, source, target, candidate.kind === "delegate-adapter" && candidate.strategy === "adaptation" &&
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
      : candidate, sourceCompletion);
    literalRequests.requestConversion(expression, source, target, selected);
    if (selections === undefined) {
      selections = new Map();
      expressionSelections.set(expression, selections);
    }
    selections.set(key, Object.freeze({ source, target, selection: selected }));
    return selected;
  }

  function prepareStructuralDependencies(expression: Node, source: TargetTypeRef, target: TargetTypeRef): void {
    const pending = [{ source, target }];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index++) {
      const pair = pending[index]!;
      const key = pairKey(pair.source, pair.target, "implicit");
      if (visited.has(key)) continue;
      visited.add(key);
      const source = getCsharpNullableElementTargetType(pair.source) ?? pair.source;
      const target = getCsharpNullableElementTargetType(pair.target) ?? pair.target;
      const shape = objectShapes.resolveTarget(source);
      const contract = objectShapes.resolveTarget(target);
      if (shape?.sourceType !== undefined && contract !== undefined && !targetTypeRefEquals(source, target) &&
        shape.implements?.some(implemented => targetTypeRefEquals(implemented, target)) !== true) {
        objectShapes.registerStructuralInterface(expression, pair.source, pair.target, shape.sourceType);
      }
      const from = getCsharpDelegateSignature(source);
      const to = getCsharpDelegateSignature(target);
      if (from !== undefined && to !== undefined) {
        if (!csharpDelegateSignatureHasSupportedPassingModes(from) || !csharpDelegateSignatureHasSupportedPassingModes(to) ||
          from.parameters.length > to.parameters.length || from.restParameterIndex !== to.restParameterIndex ||
          from.returnPassing !== to.returnPassing || from.returnPassing !== undefined ||
          from.parameterPassingModes.some(mode => mode !== "by-value") || to.parameterPassingModes.some(mode => mode !== "by-value")) continue;
        for (const [parameterIndex, sourceParameter] of from.parameters.entries()) {
          pending.push({ source: to.parameters[parameterIndex]!, target: sourceParameter });
        }
        if (!isCsharpVoidTargetType(to.returnType)) pending.push({ source: from.returnType, target: to.returnType });
      } else if (source.kind === "tuple" && target.kind === "tuple" && source.elements.length === target.elements.length) {
        for (const [elementIndex, element] of source.elements.entries()) {
          pending.push({ source: element, target: target.elements[elementIndex]! });
        }
      } else if (source.kind === "target-named" && target.kind === "target-named" && source.id === target.id) {
        const parameters = csharpTargetBindingFact(csharpProviderBindingFromResolution(policy.providers.findTargetBindingByTargetId(source.id, "ordinary")))?.typeParameters;
        const sourceArguments = source.typeArguments ?? [];
        const targetArguments = target.typeArguments ?? [];
        if (parameters === undefined || sourceArguments.length !== targetArguments.length || parameters.length !== sourceArguments.length) continue;
        for (const [argumentIndex, sourceArgument] of sourceArguments.entries()) {
          const targetArgument = targetArguments[argumentIndex]!;
          if (targetTypeRefEquals(sourceArgument, targetArgument) || !isCsharpReferenceCarrier(sourceArgument) ||
            !isCsharpReferenceCarrier(targetArgument)) continue;
          const variance = parameters[argumentIndex]!.variance;
          if (variance === "out") pending.push({ source: sourceArgument, target: targetArgument });
          else if (variance === "in") pending.push({ source: targetArgument, target: sourceArgument });
        }
      }
    }
  }

  function reserveClassification(node: Node | undefined): boolean {
    classificationCount += 1;
    if (classificationCount <= maximumConversionClassifications) {
      return true;
    }
    if (!issues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) {
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
