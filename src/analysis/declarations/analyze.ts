import type { Node } from "@tsonic/tsts";
import { selectCsharpContextualAsyncReturn } from "../../policy/conversions/contextual-async-return.js";
import { getCsharpAwaitResultTargetType } from "../../policy/operations/control-flow/await-completions.js";
import { csharpTaskTargetType } from "../../target-model/types/carriers/delegates.js";
import { csharpMethodValueCoversContract } from "../../target-model/types/method-values.js";
import {
  HasSyntacticModifier,
  isSourceCallableBodyBoundary,
  ModifierFlagsAsync,
  Node_Type,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  csharpConversionIsApplicable,
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";
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
  csharpBigIntegerTargetType,
  isCsharpVoidTargetType,
  getCsharpTaskResultTargetType,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeParameterDefault } from "../../target-model/types/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../policy/types/objects/binding-projection-policy.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications, CsharpDefaultParameterContract, CsharpReturnTargetContract } from "../../target-model/records/declarations.js";

export function analyzeCsharpDeclarations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  valueReadStages: CsharpValueReadStageIndex,
): CsharpDeclarationClassifications {
  const returnContracts = new WeakMap<Node, CsharpReturnTargetContract>();
  const runtimeDefaults = new WeakMap<Node, CsharpDefaultParameterContract>();
  const methodWrites = new WeakMap<Node, { readonly type: TargetTypeRef; readonly storageName: string; readonly implementationName: string }>();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }
  return Object.freeze({
    runtimeDefault: Object.freeze({ get(node: Node) { return runtimeDefaults.get(node); } }),
    methodWrite: Object.freeze({ get(node: Node) { return methodWrites.get(node); } }),
    returnContract: Object.freeze({ get(node: Node) {
      return returnContracts.get(node);
    } }),
  });

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    const property = operations.selectedProperty.get(node);
    if (property?.selection.kind === "source-owned" && property.selection.source.accessMode !== "read") {
      const declaration = property.selection.source.selectedDeclaration;
      const selectedType = property.sourceOwned?.rawReadType;
      if (declaration !== undefined && policy.ast.is.IsMethodDeclaration(declaration) &&
        selectedType !== undefined && getCsharpDelegateSignature(selectedType) !== undefined && !methodWrites.has(declaration)) {
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
          methodWrites.set(declaration, { type: selectedType,
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
        const index = owner === undefined ? -1 : policy.ast.parameters(owner).indexOf(node);
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
          runtimeDefaults.set(node, Object.freeze({ ...runtimeDefault, acceptsOmission: slot.acceptsOmission,
            native: selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false) }));
        }
      }
    }
    if (isCallableDeclaration(policy, node)) {
      returnContracts.set(
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
  const baseline = evidence.inferredCallableReturnType.get(declaration);
  const authoredReturnNode = Node_Type(policy.ast, declaration);
  const authoredReturnType = authoredReturnNode === undefined
    ? undefined
    : evidence.nodeTargetType.get(authoredReturnNode);
  const pointer = evidence.pointerReturn.get(declaration);
  if (authoredReturnNode !== undefined) {
    return authoredReturnType === undefined
      ? {
          kind: "rejected",
          reason:
            "The authored source callable return type has no closed C# representation.",
        }
      : { kind: "resolved", type: authoredReturnType,
          ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  }
  if (baseline === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checked source callable has no single closed C# return representation.",
    };
  }
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const observed: TargetTypeRef[] = [];
  let incomplete = false;
  collectDirectReturnExpressions(policy, declaration, (expression) => {
    const type = valueReadStages.get(expression)?.returnedValue;
    if (type === undefined) {
      incomplete = true;
    } else {
      if (asynchronous) {
        const awaited = getCsharpAwaitResultTargetType(type, policy.typeDefinitions);
        const baselineResult = getCsharpTaskResultTargetType(baseline);
        if (awaited !== undefined) observed.push(csharpTaskTargetType(awaited));
        else if (baselineResult !== undefined && targetTypeRefEquals(type, baselineResult)) observed.push(baseline);
        else incomplete = true;
      } else observed.push(type);
    }
  });
  const contract = reconcileInferredReturnTargetContract(
    policy,
    baseline,
    observed,
    incomplete,
  );
  const contextualReturn = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration))?.returnType;
  if (contract.kind === "resolved" && isCsharpJsValueTargetType(contract.type) && contextualReturn !== undefined &&
    csharpConversionIsApplicable(selectCsharpConversion(policy, contract.type, contextualReturn, "implicit"), "implicit")) {
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
  return selected.kind === "resolved"
    ? { kind: "resolved", type: selected.target }
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
      observedNumericCarrierCoversBaseline(policy, source, alternative) ||
      csharpMethodValueCoversContract(source, alternative) || csharpConversionIsApplicable(
        selectCsharpConversion(policy, source, alternative, "implicit"),
        "implicit",
      )
    )
  );
}

const nativeIntegralKinds = new Set([
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "int128", "uint128", "native-int", "native-uint",
]);

function observedNumericCarrierCoversBaseline(
  policy: CsharpPolicyContext,
  source: TargetTypeRef,
  baseline: TargetTypeRef,
): boolean {
  if (targetTypeRefEquals(source, baseline)) return true;
  if (source.kind === "source-primitive") {
    if (nativeIntegralKinds.has(source.name) && targetTypeRefEquals(baseline, csharpBigIntegerTargetType())) return true;
    return baseline.kind === "source-primitive" && baseline.name === "float64" &&
      (nativeIntegralKinds.has(source.name) || source.name === "float32") &&
      csharpConversionIsApplicable(selectCsharpConversion(policy, source, baseline, "implicit"), "implicit");
  }
  if (source.kind === "array" && baseline.kind === "array") {
    return (source.rank ?? 1) === (baseline.rank ?? 1) &&
      observedNumericCarrierCoversBaseline(policy, source.element, baseline.element);
  }
  if (source.kind === "tuple" && baseline.kind === "tuple") {
    return source.elements.length === baseline.elements.length && source.elements.every((element, index) =>
      observedNumericCarrierCoversBaseline(policy, element, baseline.elements[index]!));
  }
  if (source.kind === "target-named" && baseline.kind === "target-named" && source.id === baseline.id) {
    const actual = source.typeArguments ?? [];
    const erased = baseline.typeArguments ?? [];
    return actual.length > 0 && actual.length === erased.length &&
      targetTypeRefEquals({ ...source, typeArguments: baseline.typeArguments }, baseline) && actual.every((argument, index) =>
      observedNumericCarrierCoversBaseline(policy, argument, erased[index]!));
  }
  return false;
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

function collectDirectReturnExpressions(
  policy: CsharpPolicyContext,
  declaration: Node,
  consume: (expression: Node) => void,
): void {
  const body = policy.ast.body(declaration);
  if (body === undefined) {
    return;
  }
  if (policy.ast.is.IsArrowFunction(declaration) && !policy.ast.is.IsBlock(body)) {
    consume(body);
    return;
  }
  visit(body);

  function visit(node: Node): void {
    if (node !== body && isSourceCallableBodyBoundary(policy.ast, node)) {
      return;
    }
    if (policy.ast.is.IsReturnStatement(node)) {
      const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
      if (expression !== undefined) {
        consume(expression);
      }
      return;
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
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
