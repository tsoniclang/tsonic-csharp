import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { HasSyntacticModifier, ModifierFlagsAsync } from "@tsonic/target-api/source";
import { csharpSignatureParameters } from "../callables/calls/signature-parameters.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  isCsharpAbsenceTargetType,
  csharpCarrierAdmitsSourceAbsence,
  getCsharpNullableElementTargetType,
  getCsharpDelegateSignature,
  targetTypeRefEquals,
  isCsharpVoidTargetType,
  getCsharpTaskResultTargetType,
} from "../../policy/types/index.js";
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
    if (property?.selection.kind === "source-owned" && property.selection.source.access !== "read") {
      const selectedMember = property.selection.source.selected;
      const declaration = selectedMember.kind === "member" ? selectedMember.declarations[0] : undefined;
      const selectedType = property.sourceOwned?.rawReadType;
      if (declaration !== undefined && policy.ast.is.IsMethodDeclaration(declaration) &&
        selectedType !== undefined && getCsharpDelegateSignature(selectedType) !== undefined && declarations.records.methodWrite.get(declaration) === undefined) {
        const owner = policy.ast.parent(declaration);
        if (owner !== undefined && (policy.ast.is.IsClassDeclaration(owner) || policy.ast.is.IsClassExpression(owner))) {
          const reserved = new Set(policy.ast.members(owner).map(member => {
            const name = policy.ast.name(member);
            const selected = name === undefined ? undefined : policy.facts.analyses.propertyName(name);
            return selected?.kind === "resolved" ? selected.name : undefined;
          }));
          const declarationName = policy.ast.name(declaration);
          const selectedName = declarationName === undefined ? undefined : policy.facts.analyses.propertyName(declarationName);
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
        : evidence.nodeTargetType.get(node);
      if (parameter?.Initializer !== undefined && selected !== undefined) {
        const owner = policy.ast.parent(node);
        const signature = owner === undefined ? undefined : selectCsharpParameterDefaultContext(policy, evidence, owner);
        const parameters = owner === undefined ? undefined : csharpSignatureParameters(policy, owner);
        const index = parameters?.findIndex(candidate => candidate.declaration === node) ?? -1;
        const incoming = index < 0 || signature?.restParameterIndex !== undefined && index >= signature.restParameterIndex
          ? undefined : signature?.parameters[index];
        const value = incoming === undefined ? undefined : getCsharpNullableElementTargetType(incoming);
        const initializerType = evidence.nodeTargetType.get(parameter.Initializer);
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
          const slot = parameters?.[index];
          if (slot === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A native parameter default requires its exact declaration slot.", node);
          const native = selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false);
          const absentInitializer = isCsharpAbsenceTargetType(initializerType) &&
            (policy.ast.kindName(parameter.Initializer) === "KindNullKeyword" ||
              policy.ast.is.IsIdentifier(parameter.Initializer) && policy.facts.navigation.identity.target(parameter.Initializer) === undefined);
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
  const type = policy.types.callableReturn(declaration);
  // The CsharpRefusal travels with the rejected contract and is reported once, as it is (declaration emission).
  if (type.kind === "csharp-refused") return { kind: "rejected", reason: type.message, refusal: type };
  const pointer = evidence.pointerReturn.get(declaration);
  const contract: CsharpReturnTargetContract = { kind: "resolved", type,
    ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const value = asynchronous ? getCsharpTaskResultTargetType(type) : type;
  if (!isCsharpVoidTargetType(value) && !csharpCarrierAdmitsSourceAbsence(value)) return contract;
  const completion = policy.facts.selections.completion(declaration);
  if (policy.ast.body(declaration) !== undefined && completion === undefined) {
    return { kind: "rejected", reason: "An absence-bearing callable requires exact source completion evidence." };
  }
  return Object.freeze({ kind: "resolved", type, undefinedReturn: true,
    fallthroughUndefined: !isCsharpVoidTargetType(value) && completion?.canFallThrough === true });
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
