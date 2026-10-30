import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";

import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType, getCsharpGeneratorProtocol, getCsharpArrayLiteralElementTargetType, getCsharpCollectionElementTargetType, targetTypeRefKey } from "../../policy/types/index.js";
import { directCsharpSourceYieldExpression } from "../../target-model/syntax/yield-expression.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpClosedShapeMemberProjection } from "../../target-model/records/objects/closed-object-shapes.js";
import { selectCsharpClosedShapeConversion } from "../../policy/types/objects/closed-object-shapes.js";
import { resolveCsharpObjectShapeMemberBySourceContract } from "../../target-model/types/index.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/types/expected-types.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpStructuralInterfaceRegistration } from "../objects/structural-interfaces.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpBorrowedSequenceInput } from "../../target-model/records/storage/borrowed-sequences.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";

import type { CsharpConversionIssue } from "../../target-model/records/operations/conversions.js";

import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";

import { selectCsharpPropertyProjections } from "./property-projections.js";

import { type CsharpCallConversionRequests } from "./use-admission.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native/native-demand.js";

import type { CsharpExactLiteralRequestCollector } from "./literal-requests.js";

interface CsharpConversionRequirementInput {
  readonly policy: CsharpPolicyContext;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly objectShapes: CsharpObjectShapeClassifications & CsharpStructuralInterfaceRegistration;
  readonly operations: CsharpTargetOperationClassifications;
  readonly expectedTypes: CsharpExpectedTypeClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly literalRequests: CsharpExactLiteralRequestCollector;
  readonly classifyPair: (source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
    mode: CsharpConversionMode, node: Node | undefined) => CsharpConversionSelection | undefined;
  readonly classifyExpression: (expression: Node, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
    mode: CsharpConversionMode, exactInteger?: boolean, sourceCompletion?: CsharpNativeCompletion) => CsharpConversionSelection | undefined;
  readonly reserveClassification: (node: Node | undefined) => boolean;
  readonly issues: CsharpConversionIssue[];
  readonly propertyProjectionRoots: Map<Node, Map<string, TargetTypeRef>>;
  readonly propertyProjections: WeakMap<Node, ReadonlyMap<string, readonly CsharpClosedShapeMemberProjection[]>>;
  readonly callConversions: Map<Node, CsharpCallConversionRequests>;
}

export function collectCsharpConversionRequirements(input: CsharpConversionRequirementInput): void {
  const { policy, evidence, objectShapes, operations, expectedTypes, valueReads, literalRequests,
    classifyPair, classifyExpression, reserveClassification, issues, propertyProjectionRoots,
    propertyProjections, callConversions } = input;
  for (const sourceFile of policy.sourceFiles) visit(sourceFile, sourceFile, operations, expectedTypes, valueReads);

  function visit(
    node: Node,
    sourceFile: SourceFile,
    operations: CsharpTargetOperationClassifications,
    expectedTypes: CsharpExpectedTypeClassifications,
    valueReads: CsharpValueReadClassifications,
  ): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (operations.nativeUnreachable.get(node)) return;
    const sourceTypes = exactSourceTypes(node, valueReads);
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
    classifyCoalescingPresent(node, operations);
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
  ): readonly TargetTypeRef[] {
    const read = valueReads.valueRead.get(node);
    const candidates = [
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

  // A guarded ?? / ??= converts the left operand's present value to the selected result: the same present type the
  // type emission publishes for the left carrier (generic optional element, Nullable<T> element, or the carrier itself).
  function classifyCoalescingPresent(node: Node, operations: CsharpTargetOperationClassifications): void {
    const selection = operations.binaryOperation.get(node)?.target;
    if (selection?.kind !== "resolved" || (selection.sourceOperator !== "??" && selection.sourceOperator !== "??=")) return;
    for (const left of new Set([selection.leftType, selection.leftInputType])) {
      const present = getCsharpGenericOptionalParts(left)?.element ?? getCsharpNullableElementTargetType(left) ?? left;
      if (!targetTypeRefEquals(present, selection.resultType)) classifyPair(present, selection.resultType, "implicit", node);
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
    if (call !== undefined && (call.optionalCallee !== undefined || call.optionalReceiver !== undefined)) {
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
      if (type !== undefined) {
        const roots = propertyProjectionRoots.get(subject) ?? new Map<string, TargetTypeRef>();
        roots.set(targetTypeRefKey(type), type); propertyProjectionRoots.set(subject, roots);
      }
      const binding = selection.source.sourceArgumentBindings.find(binding =>
        binding.effectiveArgumentIndex === argument.effectiveArgumentIndex);
      const projected = binding === undefined ? undefined
        : selectCsharpPropertyProjections(subject, type, binding.selectedParameterType, policy, objectShapes);
      if (projected === undefined) {
        issues.push({ node: subject, code: "CSHARP_PROPERTY_PROJECTION_NOT_CLOSED",
          message: "Native property projection requires exact checked selected-parameter member correspondence." });
        continue;
      }
      const orders = new Map<string, readonly CsharpClosedShapeMemberProjection[]>();
      for (const projection of projected) {
        if (!reserveClassification(subject)) return;
        const members: CsharpClosedShapeMemberProjection[] = [];
        for (const member of projection.members) {
          if (!reserveClassification(subject)) return;
          const conversion = classifyPair(member.type, csharpTsValueTargetType(), "implicit", subject);
          if (conversion === undefined) continue;
          const selected = selectCsharpClosedShapeConversion(conversion, csharpTsValueTargetType());
          if (selected.kind === "rejected") issues.push({ node: subject, code: "CSHARP_UNSUPPORTED_AST", message: selected.reason });
          else members.push(Object.freeze({ member, conversion: selected.value }));
        }
        orders.set(targetTypeRefKey(projection.source), Object.freeze(members));
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
      const projectionValueType = csharpObjectProjectionValueType(
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

}

import { csharpObjectProjectionValueType } from "../../policy/conversions/object-projection.js";
