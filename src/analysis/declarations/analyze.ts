import type { Node } from "@tsonic/tsts";
import { selectCsharpContextualAsyncReturn } from "../../policy/conversions/contextual-async-return.js";
import { getCsharpAwaitResultTargetType } from "../../policy/operations/control-flow/await-completions.js";
import { csharpTaskTargetType } from "../../target-model/types/carriers/delegates.js";
import { csharpMethodValueCoversContract } from "../../target-model/types/method-values.js";
import {
  HasSyntacticModifier,
  ModifierFlagsAsync,
  Node_Type,
  sourceCallableValueParameters,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { csharpNumericReturnBaselineCovered, csharpSourceUnionLayoutsMatch, csharpSourceUnionReturnLayout } from "../../policy/conversions/union-relations.js";
import { classifyCsharpSourceProfileType } from "../../policy/identities/source-types.js";
import { csharpLiteralReturnsFit, forEachCsharpDirectReturnExpression } from "../callables/calls/return-expressions.js";
import { selectCsharpCommonImplicitTarget } from "../conversions/common-target.js";
import {
  csharpAbsenceTargetType,
  combineCsharpTargetUnionMembers,
  isCsharpAbsenceTargetType,
  csharpCarrierAdmitsSourceAbsence,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpDelegateSignature,
  isCsharpJsValueTargetType,
  targetTypeRefKey,
  targetTypeRefEquals,
  isCsharpVoidTargetType,
  getCsharpTaskResultTargetType,
} from "../../policy/types/index.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeParameterDefault } from "../../policy/types/storage/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../policy/types/objects/binding-projection.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications, CsharpReturnTargetContract } from "../../target-model/records/declarations.js";
import { createCsharpDeclarationProducer } from "../program/records/declarations.js";

export function analyzeCsharpDeclarations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  valueReadStages: CsharpValueReadStageIndex,
): CsharpDeclarationClassifications {
  const declarations = createCsharpDeclarationProducer();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }
  return declarations.seal();

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    const property = operations.selectedProperty.get(node);
    if (property?.selection.kind === "source-owned" && property.selection.source.accessMode !== "read") {
      const declaration = property.selection.source.selectedDeclaration;
      const selectedType = property.sourceOwned?.rawReadType;
      if (declaration !== undefined && policy.ast.is.IsMethodDeclaration(declaration) &&
        selectedType !== undefined && getCsharpDelegateSignature(selectedType) !== undefined && declarations.records.methodWrite.get(declaration) === undefined) {
        const owner = policy.ast.parent(declaration);
        if (owner !== undefined && (policy.ast.is.IsClassDeclaration(owner) || policy.ast.is.IsClassExpression(owner))) {
          const reserved = new Set(policy.ast.members(owner).map(member => {
            const name = policy.ast.name(member);
            const selected = name === undefined ? undefined : policy.semanticsFor(name).propertyNames.get(name);
            return selected?.kind === "resolved" ? selected.name : undefined;
          }));
          const declarationName = policy.ast.name(declaration);
          const selectedName = declarationName === undefined ? undefined : policy.semanticsFor(declarationName).propertyNames.get(declarationName);
          const allocate = (prefix: string): string => {
            let name = `${prefix}${selectedName?.kind === "resolved" ? selectedName.name : policy.ast.pos(declaration)}`;
            while (reserved.has(name)) name = `_${name}`;
            reserved.add(name);
            return name;
          };
          declarations.methodWrite(declaration, { type: selectedType,
            storageName: allocate("__tsonic_method_slot_"), implementationName: allocate("__tsonic_method_body_") });
        }
      }
    }
    if (policy.ast.is.IsParameterDeclaration(node)) {
      const parameter = policy.ast.as.AsParameterDeclaration(node);
      const selected = parameter === undefined ? undefined
        : evidence.nodeTargetType.get(parameter.Type ?? parameter.name!);
      if (parameter?.Initializer !== undefined && selected !== undefined) {
        const owner = policy.ast.parent(node);
        const contextual = owner === undefined ? undefined : evidence.contextualTargetType.get(owner);
        const signature = contextual === undefined ? undefined : getCsharpDelegateSignature(contextual);
        const parameters = owner === undefined ? undefined : sourceCallableValueParameters(policy.ast, owner, policy.semanticsFor(owner));
        const index = parameters?.indexOf(node) ?? -1;
        const incoming = index < 0 ? undefined : signature?.parameters[index];
        const value = incoming === undefined ? undefined : getCsharpNullableElementTargetType(incoming);
        const source = evidence.expressionType.get(parameter.Initializer);
        const queries = policy.semanticsFor(node);
        const members = source === undefined ? [] : queries.types.isUnion(source)
          ? queries.types.unionOrIntersectionTypes(source) : [source];
        const presentInitializer = members.length > 0 && members.every(member =>
          member !== undefined && !queries.types.isNullish(member) && !queries.types.isAny(member) && !queries.types.isUnknown(member));
        const runtimeDefault = incoming !== undefined && value !== undefined && presentInitializer
          ? csharpRuntimeParameterDefault(parameter.Type === undefined ? value : selected, incoming)
          : csharpRuntimeParameterDefault(selected);
        if (runtimeDefault !== undefined) {
          const slot = owner === undefined ? undefined : queries.types.declarationSignatureInfo(owner)
            ?.parameters.find(parameter => parameter.declaration === node);
          if (slot === undefined) throw new Error("A native parameter default requires its exact checked declaration slot.");
          const native = selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false);
          const absentInitializer = source !== undefined && queries.types.isNullish(source) &&
            (policy.ast.kindName(parameter.Initializer) === "KindNullKeyword" ||
              policy.ast.is.IsIdentifier(parameter.Initializer) && policy.navigation.sourceReferenceFor(parameter.Initializer) === undefined);
          declarations.runtimeDefault(node, Object.freeze({ ...runtimeDefault, acceptsOmission: slot.acceptsOmission, native,
            passthrough: (native.kind === "value" || absentInitializer) && !native.normalize &&
              targetTypeRefEquals(native.source, native.target) }));
        }
      }
    }
    if (isCallableDeclaration(policy, node)) {
      declarations.returnContract(
        node,
        withAbsenceCompletion(policy, evidence, node, classifyReturnContract(policy, evidence, valueReadStages, node)),
      );
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function withAbsenceCompletion(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declaration: Node,
  contract: CsharpReturnTargetContract,
): CsharpReturnTargetContract {
  if (contract.kind !== "resolved") return contract;
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const contextual = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration))?.returnType;
  const inferred = Node_Type(policy.ast, declaration) === undefined;
  const type = asynchronous && inferred
    ? selectCsharpContextualAsyncReturn(policy, contract.type, contextual) ?? contract.type
    : !asynchronous && inferred && isCsharpVoidTargetType(contract.type) && csharpCarrierAdmitsSourceAbsence(contextual)
      ? contextual! : contract.type;
  const value = asynchronous ? getCsharpTaskResultTargetType(type) : type;
  if (!isCsharpVoidTargetType(value) && !csharpCarrierAdmitsSourceAbsence(value)) return type === contract.type ? contract : { ...contract, type };
  const completion = policy.semanticsFor(declaration).operations.callableCompletion(declaration);
  if (policy.ast.body(declaration) !== undefined && completion === undefined) {
    return { kind: "rejected", reason: "An absence-bearing callable requires exact source completion evidence." };
  }
  return Object.freeze({ kind: "resolved", type, undefinedReturn: true,
    fallthroughUndefined: !isCsharpVoidTargetType(value) && completion?.canFallThrough === true });
}

function classifyReturnContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  valueReadStages: CsharpValueReadStageIndex,
  declaration: Node,
): CsharpReturnTargetContract {
  const authoredReturnNode = Node_Type(policy.ast, declaration);
  const authoredReturnType = authoredReturnNode === undefined
    ? undefined
    : evidence.nodeTargetType.get(authoredReturnNode);
  const pointer = evidence.pointerReturn.get(declaration);
  if (authoredReturnNode !== undefined && authoredReturnType === undefined) return {
    kind: "rejected", reason: "The authored source callable return type has no closed C# representation.",
  };
  const baseline = authoredReturnType ?? evidence.inferredCallableReturnType.get(declaration);
  if (baseline === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checked source callable has no single closed C# return representation.",
    };
  }
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const observedBaseline = asynchronous ? getCsharpTaskResultTargetType(baseline) : baseline;
  if (observedBaseline === undefined) return authoredReturnType === undefined
    ? { kind: "rejected", reason: "The checked source callable has no single closed C# return representation." }
    : { kind: "resolved", type: authoredReturnType,
        ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  const observed: TargetTypeRef[] = [];
  let incomplete = false;
  forEachCsharpDirectReturnExpression(policy.ast, declaration, (expression) => {
    const type = valueReadStages.get(expression)?.returnedValue;
    if (type === undefined) {
      incomplete = true;
    } else {
      if (asynchronous) {
        const awaited = getCsharpAwaitResultTargetType(type, policy.typeDefinitions);
        if (awaited !== undefined) observed.push(awaited);
        else if (targetTypeRefEquals(type, observedBaseline)) observed.push(type);
        else incomplete = true;
      } else observed.push(type);
    }
  });
  if (authoredReturnType !== undefined) {
    const queries = policy.semanticsFor(declaration);
    const sourceReturn = authoredReturnNode === undefined ? undefined : queries.types.authoredType(authoredReturnNode);
    const sourceResult = !asynchronous ? sourceReturn : sourceReturn !== undefined &&
      classifyCsharpSourceProfileType(sourceReturn, queries, policy.ast)?.kind === "promise" ? queries.types.awaitedType(sourceReturn) : undefined;
    const actual = !incomplete && observed.length > 0 && observed.every(type => targetTypeRefEquals(type, observed[0]!))
      && sourceResult !== undefined && csharpSourceUnionReturnLayout({ source: observed[0]!, target: observedBaseline,
        sourceType: sourceResult, queries, ast: policy.ast, definitions: policy.typeDefinitions,
        resolveType: type => policy.types.resolveType(type, queries.sourceFile) }) ? observed[0] : undefined;
    const nativeTarget = authoredReturnType.kind === "target-named" ? authoredReturnType as CsharpTargetNamedTypeRef : undefined;
    const native = !asynchronous && !incomplete && nativeTarget !== undefined &&
      (nativeTarget.csharpStructuralContract === true || nativeTarget.csharpSourceDeclarationKind === "interface")
      ? policy.objectShapes.resolveNativeReturn(declaration, authoredReturnType, observed) : undefined;
    if (native?.kind === "rejected") return { kind: "rejected", reason: native.reason };
    const type = actual !== undefined ? asynchronous ? csharpTaskTargetType(actual) : actual
      : native?.type ?? authoredReturnType;
    return { kind: "resolved", type,
      ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  }
  const observedContract = reconcileInferredReturnTargetContract(
    policy,
    observedBaseline,
    observed,
    incomplete,
  );
  const contract = asynchronous && observedContract.kind === "resolved"
    ? { ...observedContract, type: csharpTaskTargetType(observedContract.type) } : observedContract;
  const contextualReturn = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration))?.returnType;
  if (contract.kind === "resolved" && isCsharpJsValueTargetType(contract.type) && contextualReturn !== undefined &&
    csharpConversionIsApplicable(selectCsharpConversion(policy, contract.type, contextualReturn, "implicit"), "implicit")) {
    return { kind: "resolved", type: contextualReturn };
  }
  // An inferred synchronous return whose every returned expression is a literal exactly representable in the contextual
  // return carrier takes that carrier: `() => 9n` under `() => int64` returns the long literal 9, not a BigInteger.
  if (contract.kind === "resolved" && !asynchronous && contextualReturn !== undefined &&
    !targetTypeRefEquals(contract.type, contextualReturn) &&
    !csharpConversionIsApplicable(selectCsharpConversion(policy, contract.type, contextualReturn, "implicit"), "implicit") &&
    csharpLiteralReturnsFit(policy.ast, policy.literalValues, declaration, contextualReturn)) {
    return { kind: "resolved", type: contextualReturn };
  }
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
    [...observed, baseline, ...(requiredSources.some(isCsharpAbsenceTargetType)
      ? observed.flatMap(source => {
          const optional = combineCsharpTargetUnionMembers([source, csharpAbsenceTargetType()]);
          return optional === undefined ? [] : [optional];
        }) : [])],
  );
  if (selected.kind === "resolved") return { kind: "resolved", type: selected.target };
  // Mutually convertible carriers (an empty source struct and the empty object) tie as equally specific. When every
  // returned value already has one carrier that accepts every required source, the return keeps that carrier: the
  // returned values then need no conversion at all.
  const single = observed.every(type => targetTypeRefEquals(type, observed[0]!)) ? observed[0]! : undefined;
  const actual = single === undefined ? undefined : selectCsharpCommonImplicitTarget(policy, requiredSources, [single]);
  return actual?.kind === "resolved"
    ? { kind: "resolved", type: actual.target }
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
  collectTargetContractAlternatives(baseline, alternatives, policy);
  const observedAlternatives = new Map<string, TargetTypeRef>();
  observed.forEach(source => collectTargetContractAlternatives(source, observedAlternatives, policy));
  const observedSources = [...observedAlternatives.values()];
  return [...alternatives.values()].filter((alternative) =>
    !observedSources.some((source) =>
      csharpNumericReturnBaselineCovered({ source, baseline: alternative, definitions: policy.typeDefinitions,
        convert: (source, target) => selectCsharpConversion(policy, source, target, "implicit") }) ||
      csharpSourceUnionLayoutsMatch(source, alternative) ||
      csharpMethodValueCoversContract(source, alternative) || csharpConversionIsApplicable(
        selectCsharpConversion(policy, source, alternative, "implicit"),
        "implicit",
      )
    )
  );
}

function collectTargetContractAlternatives(
  type: TargetTypeRef,
  alternatives: Map<string, TargetTypeRef>,
  policy: CsharpPolicyContext,
): void {
  const union = getCsharpRuntimeUnionArms(type, policy.typeDefinitions);
  if (union !== undefined) {
    union.forEach((member) =>
      collectTargetContractAlternatives(member, alternatives, policy)
    );
    return;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    collectTargetContractAlternatives(nullableElement, alternatives, policy);
    const undefinedType = csharpAbsenceTargetType();
    alternatives.set(targetTypeRefKey(undefinedType), undefinedType);
    return;
  }
  alternatives.set(targetTypeRefKey(type), type);
}

function isCallableDeclaration(
  policy: CsharpPolicyContext,
  node: Node,
): boolean {
  return policy.ast.is.IsFunctionDeclaration(node) ||
    policy.ast.is.IsFunctionExpression(node) ||
    policy.ast.is.IsArrowFunction(node) ||
    policy.ast.is.IsMethodDeclaration(node) ||
    policy.ast.is.IsMethodSignatureDeclaration(node) ||
    policy.ast.is.IsGetAccessorDeclaration(node) ||
    policy.ast.is.IsSetAccessorDeclaration(node);
}
