import type { Node } from "@tsonic/tsts";
import { csharpMethodValueCoversContract } from "../../target-model/types/method-values.js";
import {
  HasSyntacticModifier,
  ModifierFlagsAsync,
  sourceCallableValueParameters,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { csharpNumericReturnBaselineCovered, csharpSourceUnionLayoutsMatch } from "../../policy/conversions/union-relations.js";
import { selectCsharpCommonImplicitTarget } from "../conversions/common-target.js";
import {
  csharpAbsenceTargetType,
  combineCsharpTargetUnionMembers,
  isCsharpAbsenceTargetType,
  csharpCarrierAdmitsSourceAbsence,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpDelegateSignature,
  targetTypeRefKey,
  targetTypeRefEquals,
  isCsharpVoidTargetType,
  getCsharpTaskResultTargetType,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeParameterDefault } from "../../policy/types/storage/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../policy/types/objects/binding-projection.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpDeclarationClassifications, CsharpReturnTargetContract } from "../../target-model/records/program/declarations.js";
import { createCsharpDeclarationProducer } from "../program/records/program/declarations.js";
import { selectCsharpParameterDefaultContext } from "./parameter-default-context.js";

export function analyzeCsharpDeclarations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
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
        const signature = owner === undefined ? undefined : selectCsharpParameterDefaultContext(policy, evidence, owner);
        const parameters = owner === undefined ? undefined : sourceCallableValueParameters(policy.ast, owner, policy.semanticsFor(owner));
        const index = parameters?.indexOf(node) ?? -1;
        const incoming = index < 0 || signature?.restParameterIndex !== undefined && index >= signature.restParameterIndex
          ? undefined : signature?.parameters[index];
        const value = incoming === undefined ? undefined : getCsharpNullableElementTargetType(incoming);
        const initializerType = evidence.nodeTargetType.get(parameter.Initializer);
        const queries = policy.semanticsFor(node);
        const presentInitializer = initializerType !== undefined && !csharpCarrierAdmitsSourceAbsence(initializerType);
        const presentOnly = incoming !== undefined && !csharpCarrierAdmitsSourceAbsence(incoming) &&
          signature?.optionalParameterIndexes?.includes(index) !== true;
        const contextualDefault = incoming === undefined ? undefined : presentOnly
          ? Object.freeze({ kind: "present" as const, valueType: incoming, parameterType: incoming })
          : csharpRuntimeParameterDefault(incoming, incoming);
        const runtimeDefault = incoming === undefined ? csharpRuntimeParameterDefault(selected)
          : contextualDefault === undefined ? undefined : Object.freeze({ ...contextualDefault,
            valueType: parameter.Type === undefined && value !== undefined && presentInitializer ? value : selected,
          });
        if (runtimeDefault !== undefined) {
          const slot = owner === undefined ? undefined : queries.types.declarationSignatureInfo(owner)
            ?.parameters.find(parameter => parameter.declaration === node);
          if (slot === undefined) throw new Error("A native parameter default requires its exact checked declaration slot.");
          const native = selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false);
          const absentInitializer = isCsharpAbsenceTargetType(initializerType) &&
            (policy.ast.kindName(parameter.Initializer) === "KindNullKeyword" ||
              policy.ast.is.IsIdentifier(parameter.Initializer) && policy.navigation.sourceReferenceFor(parameter.Initializer) === undefined);
          declarations.runtimeDefault(node, Object.freeze({ ...runtimeDefault, acceptsOmission: presentOnly ? false : slot.acceptsOmission, native,
            passthrough: (presentOnly || (native.kind === "value" || absentInitializer) && !native.normalize) &&
              targetTypeRefEquals(native.source, native.target) }));
        }
      }
    }
    if (isCallableDeclaration(policy, node)) {
      declarations.returnContract(
        node,
        classifyReturnContract(policy, evidence, node),
      );
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function classifyReturnContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declaration: Node,
): CsharpReturnTargetContract {
  const type = policy.types.resolveCallableReturn(declaration);
  if (type === undefined) return { kind: "rejected",
    reason: "The Host-published callable return has no closed C# representation." };
  const pointer = evidence.pointerReturn.get(declaration);
  const contract: CsharpReturnTargetContract = { kind: "resolved", type,
    ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const value = asynchronous ? getCsharpTaskResultTargetType(type) : type;
  if (!isCsharpVoidTargetType(value) && !csharpCarrierAdmitsSourceAbsence(value)) return contract;
  const completion = policy.semanticsFor(declaration).operations.callableCompletion(declaration);
  if (policy.ast.body(declaration) !== undefined && completion === undefined) {
    return { kind: "rejected", reason: "An absence-bearing callable requires exact source completion evidence." };
  }
  return Object.freeze({ kind: "resolved", type, undefinedReturn: true,
    fallthroughUndefined: !isCsharpVoidTargetType(value) && completion?.canFallThrough === true });
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
