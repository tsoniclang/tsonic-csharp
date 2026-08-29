import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/context.js";
import {
  selectCsharpConversion,
  selectCsharpExpressionConversion,
} from "../../policy/conversions/index.js";
import type {
  CsharpConversionMode,
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import {
  csharpRuntimeUndefinedTargetType,
  getCsharpGeneratorProtocol,
  getCsharpArrayLiteralInputCarrierTargetType,
  getCsharpJsArrayElementTargetType,
  isSourceOwnedCallableRuntimeCarrierSubject,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import {
  directCsharpSourceYieldExpression,
} from "../../target-model/syntax/yield-expression.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "../../target-model/types/index.js";
import type { CsharpExpectedTypeClassifications } from "../expected-types/index.js";
import type { CsharpObjectShapeClassifications } from "../object-shapes/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpStorageClassifications } from "../storage/index.js";
import type {
  CsharpConversionAnalysis,
  CsharpConversionClassifications,
  CsharpConversionIssue,
} from "./model.js";

const unavailableConversion: CsharpConversionSelection = Object.freeze({
  kind: "rejected",
  reason: "C# conversion requires closed source and target representations.",
});
const maximumConversionClassifications = 1_048_576;

export function analyzeCsharpConversions(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  objectShapes: CsharpObjectShapeClassifications,
): CsharpConversionAnalysis {
  const pairSelections = new Map<string, CsharpConversionSelection>();
  const expressionSelections = new WeakMap<
    Node,
    Map<string, CsharpConversionSelection>
  >();
  const issues: CsharpConversionIssue[] = [];
  let classificationCount = 0;
  let closed = false;
  let sealedClassifications: CsharpConversionClassifications | undefined;

  const openClassifications: CsharpConversionClassifications = {
    issues,
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
      const selected = expressionSelections.get(expression)?.get(key);
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
      closed = true;
      const sealedIssues = Object.freeze([...issues]);
      const sealed: CsharpConversionClassifications = {
        issues: sealedIssues,
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
          return expressionSelections.get(expression)?.get(key) ??
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
    storage: CsharpStorageClassifications,
  ): void {
    const sourceTypes = exactSourceTypes(node, operations, storage);
    const sourceType = sourceTypes[0];
    const effectiveSourceType = storage.type(node) ?? sourceType;
    for (const candidate of sourceTypes) {
      classifyPair(candidate, candidate, "implicit", node);
    }
    for (const targetType of expectedTypes.forExpression(node)) {
      for (const candidate of sourceTypes) {
        classifyExpression(node, candidate, targetType, "implicit");
      }
      classifyArrayCarrier(node, effectiveSourceType, targetType);
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
    storage: CsharpStorageClassifications,
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
    storage: CsharpStorageClassifications,
  ): readonly TargetTypeRef[] {
    const candidates = [
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
    sourceType: TargetTypeRef | undefined,
    targetType: TargetTypeRef,
  ): void {
    if (!policy.ast.is.IsArrayLiteralExpression(node)) {
      return;
    }
    classifyPair(
      getCsharpArrayLiteralInputCarrierTargetType(targetType, sourceType),
      targetType,
      "implicit",
      node,
    );
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
      csharpRuntimeUndefinedTargetType(),
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
    storage: CsharpStorageClassifications,
  ): void {
    const classification = operations.call(node);
    if (classification === undefined) {
      return;
    }
    const source = classification.source ?? (
      classification.target?.kind === "resolved"
        ? classification.target.source
        : undefined
    );
    if (source !== undefined) {
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
          csharpRuntimeUndefinedTargetType(),
          classification.sourceParameterTypes?.[parameterIndex],
          "implicit",
          node,
        );
      }
    }
    if (classification.target?.kind !== "resolved") {
      return;
    }
    const member = classification.target.call.targetMember;
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
  ): CsharpConversionSelection | undefined {
    if (source === undefined || target === undefined) {
      return unavailableConversion;
    }
    const key = pairKey(source, target, mode);
    let selections = expressionSelections.get(expression);
    const previous = selections?.get(key);
    if (previous !== undefined) {
      return previous;
    }
    if (!reserveClassification(expression)) {
      return undefined;
    }
    const sourceFile = policy.ast.getSourceFile(expression);
    const candidate = selectCsharpExpressionConversion(
      policy,
      expression,
      source,
      target,
      mode,
    );
    const selected = candidate.kind === "delegate-adapter" &&
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
    selections.set(key, selected);
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
