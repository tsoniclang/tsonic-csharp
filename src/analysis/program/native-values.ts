import type { Node } from "@tsonic/tsts";
import type { SourceOperation, SourceTypeEvidence, TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpRepresentationContract } from "./iteration.js";
import { represented, nativeRepresentationFailure } from "../../policy/types/source-type-flow/representation-results.js";
import { csharpSelectedCallResultType } from "../../target-model/types/member-facts.js";
import { getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { getCsharpReadOnlyIndexableCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { representCsharpOptionalStorage } from "../../policy/types/source-type-flow/representation-optional.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../operations/members/selected-members.js";
import { selectCsharpSourceCallableApplication } from "../callables/calls/native-application.js";
import { selectCsharpBinaryOperation, selectCsharpUnaryOperation } from "../operations/operators.js";

type Failure = Exclude<CsharpRepresentationOutcome<TargetTypeRef>, { readonly kind: "represented" }>;

export function createCsharpNativeValueQuery(
  source: TargetSourceProgram,
  policyFor: () => CsharpPolicyContext,
  previous: CsharpRepresentationContract | undefined,
): (occurrence: Node) => CsharpRepresentationOutcome<TargetTypeRef> {
  const values = new WeakMap<Node, CsharpRepresentationOutcome<TargetTypeRef>>();
  const active = new Set<Node>();
  const occurrences = new Set(source.facts.values.occurrences());
  const { ast, facts } = source;

  function nativeValue(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    const cached = values.get(occurrence);
    if (cached !== undefined) return cached;
    if (active.has(occurrence)) return nativeRepresentationFailure(occurrence, "CSHARP_NATIVE_VALUE_CARRIER_NOT_PROVEN",
      "A Native value dependency requires a completed physical declaration or operation contract before reentry.");
    active.add(occurrence);
    try {
      const selected = produce(occurrence);
      if (selected.kind === "represented") values.set(occurrence, selected);
      return selected;
    } finally {
      active.delete(occurrence);
    }
  }

  function produce(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    const policy = policyFor();
    const safety = facts.protocols.safety(occurrence);
    if (safety.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: safety });
    if (safety.value.kind === "present" && safety.value.value.kind === "unsafe-context" &&
      safety.value.value.fact.kind === "expression") return nativeValue(safety.value.value.fact.expression);
    if (ast.is.IsParenthesizedExpression(occurrence)) {
      const operand = ast.as.AsParenthesizedExpression(occurrence)?.Expression;
      if (operand !== undefined) return nativeValue(operand);
    }
    if (ast.is.IsCallExpression(occurrence) || ast.is.IsNewExpression(occurrence)) {
      const publication = facts.applications.application(occurrence);
      if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
      if (publication.value.argumentDisposition === "skip") return represented(csharpAbsenceTargetType());
      const sourceFile = ast.getSourceFile(occurrence);
      if (sourceFile === undefined) throw new TypeError("An original Native application requires its Source file.");
      const selection = selectCsharpTargetCall(policy, occurrence, sourceFile);
      if (selection.kind === "source-refused" || selection.kind === "native-refused") return selection;
      if (selection.kind === "resolved") {
        const carrier = csharpSelectedCallResultType(selection.call.targetMember, selection.call.discardResult === true);
        return carrier === undefined ? missing(occurrence, "The selected Native call has no complete physical result ABI.")
          : result(carrier, publication.value.argumentDisposition === "dynamic", occurrence);
      }
      if (selection.kind !== "source-owned") return missing(occurrence,
        selection.kind === "rejected" ? selection.diagnostic.message : selection.reason);
      const application = selectCsharpSourceCallableApplication(policy, publication.value);
      return application.kind !== "represented" ? application : result(
        application.value.applied.signature.returnType, publication.value.argumentDisposition === "dynamic", occurrence);
    }
    if (ast.is.IsPropertyAccessExpression(occurrence) || ast.is.IsElementAccessExpression(occurrence)) {
      return member(occurrence);
    }
    if (ast.is.IsBinaryExpression(occurrence) || ast.is.IsPrefixUnaryExpression(occurrence) ||
      ast.is.IsPostfixUnaryExpression(occurrence) || ast.is.IsConditionalExpression(occurrence) || ast.is.IsAwaitExpression(occurrence)) {
      const publication = facts.values.operation(occurrence);
      if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
      return operation(publication.value);
    }
    const fixedStorage = previous?.storage.requiredStorageType.get(occurrence);
    if (fixedStorage !== undefined) return represented(fixedStorage);
    if (ast.is.IsArrowFunction(occurrence) || ast.is.IsFunctionExpression(occurrence)) {
      const closed = previous?.callables.closedInputType(occurrence);
      if (closed !== undefined) return represented(closed);
    }
    const place = facts.protocols.storage(occurrence);
    if (place.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: place });
    if (place.value.kind === "present" && place.value.value.kind === "binding") {
      const declaration = place.value.value.declaration;
      const physical = previous?.storage.requiredStorageType.get(declaration);
      if (physical !== undefined) return represented(physical);
      const selected = policy.types.declaredSlot(declaration);
      return selected.kind === "represented" ? represented(selected.value.value.carrier) : selected;
    }
    if (!occurrences.has(occurrence)) {
      const declared = policy.types.declaredSlot(occurrence);
      return declared.kind === "represented" ? represented(declared.value.value.carrier) : declared;
    }
    if (ast.is.IsArrayLiteralExpression(occurrence) || ast.is.IsObjectLiteralExpression(occurrence)) {
      const construction = facts.values.construction(occurrence);
      if (construction.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: construction });
      if (construction.value.kind === "none") return missing(occurrence,
        "A Native literal allocation requires its original Source construction record.");
      const destination = construction.value.value.destination;
      if (destination.kind === "present") return represent(destination.value.kind === "sum" ? destination.value.arm
        : destination.value.destination.applied, occurrence, "storage");
      return represent(construction.value.value.value, occurrence, "storage");
    }
    const selected = policy.types.value(occurrence);
    return selected.kind === "represented" ? represented(selected.value.carrier) : selected;
  }

  function operation(selected: SourceOperation): CsharpRepresentationOutcome<TargetTypeRef> {
    const policy = policyFor();
    if (selected.kind === "conditional") {
      const control = nativeValue(selected.control.occurrence);
      if (control.kind !== "represented") return control;
      if (selected.disposition !== "dynamic") {
        const branch = selected.disposition === "true" ? selected.whenTrue : selected.whenFalse;
        return branch.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: branch })
          : nativeValue(branch.value.occurrence);
      }
      for (const branch of [selected.whenTrue, selected.whenFalse]) {
        if (branch.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: branch });
        const value = nativeValue(branch.value.occurrence);
        if (value.kind !== "represented") return value;
      }
      return represent(selected.result, selected.occurrence);
    }
    if (selected.kind === "await") {
      const operand = nativeValue(selected.operand.occurrence);
      if (operand.kind !== "represented") return operand;
      const completion = getCsharpTaskResultTargetType(operand.value);
      return completion === undefined ? represent(selected.completion, selected.occurrence, "return") : represented(completion);
    }
    let failure: Failure | undefined;
    const child = (node: Node): TargetTypeRef | undefined => {
      const value = nativeValue(node);
      if (value.kind === "represented") return value.value;
      failure ??= value;
      return undefined;
    };
    const value = selected.kind === "unary" || selected.kind === "update"
      ? selectCsharpUnaryOperation(policy, selected.occurrence, child)
      : selectCsharpBinaryOperation(policy, selected.occurrence, child);
    if (failure !== undefined) return failure;
    if (value.kind === "source-refused" || value.kind === "native-refused") return value;
    return value.kind === "resolved" || value.kind === "literal" ? represented(value.resultType)
      : missing(selected.occurrence, value.reason);
  }

  function member(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    const policy = policyFor();
    const publication = facts.objects.use(occurrence);
    if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
    const use = publication.value;
    if (use.readType === undefined) return missing(occurrence, "The original Source member use has no published read result.");
    const readResult = (carrier: TargetTypeRef): CsharpRepresentationOutcome<TargetTypeRef> =>
      result(carrier, use.optionalChain || use.chainContinuation, occurrence);
    const sourceFile = ast.getSourceFile(occurrence);
    if (sourceFile === undefined) throw new TypeError("A Native member use requires its original Source file.");
    const selected = ast.is.IsElementAccessExpression(occurrence)
      ? selectCsharpTargetElement(policy, occurrence, sourceFile) : selectCsharpTargetProperty(policy, occurrence, sourceFile);
    if (selected.kind === "source-refused" || selected.kind === "native-refused") return selected;
    if (selected.kind === "resolved") return selected.targetMember.returnType === undefined
      ? missing(occurrence, "The selected Native field or indexer has no physical read ABI.") : readResult(selected.targetMember.returnType);
    if (selected.kind === "project-indexer") return readResult(selected.valueType);
    if (selected.kind !== "source-owned") return missing(occurrence,
      selected.kind === "rejected" ? selected.diagnostic.message
        : "The member use requires its completed exact Native branch layout.");
    const receiver = nativeValue(use.receiver.occurrence);
    if (receiver.kind !== "represented") return receiver;
    const carriers: TargetTypeRef[] = [];
    for (const arm of use.arms) {
      if (arm.kind === "index") {
        const carrier = getCsharpReadOnlyIndexableCollectionElementTargetType(receiver.value);
        if (carrier === undefined) return missing(occurrence, "The actual Native indexed receiver has no complete element storage ABI.");
        carriers.push(carrier);
      } else for (const origin of arm.readOrigins) {
        const physical = policy.objectShapes.resolveMember(arm.receiver, receiver.value, origin, occurrence);
        if (physical.kind !== "represented") return physical;
        if (physical.value.kind === "none") return missing(occurrence,
          "An original Source member requires its exact physical Native declaration slot.");
        carriers.push(physical.value.value.type);
      }
    }
    const carrier = carriers[0];
    if (carrier === undefined || carriers.some(value => !targetTypeRefEquals(value, carrier))) return missing(occurrence,
      "The member read requires its published Source role and complete Native branch conversion plan.");
    return readResult(carrier);
  }

  function result(carrier: TargetTypeRef, optional: boolean, occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    if (!optional || isCsharpVoidTargetType(carrier)) return represented(carrier);
    const layout = representCsharpOptionalStorage(policyFor(), carrier, occurrence);
    return layout.kind === "represented" ? represented(layout.value.carrier) : layout;
  }

  function represent(evidence: SourceTypeEvidence, occurrence: Node,
    position: "value" | "return" | "storage" = "value"): CsharpRepresentationOutcome<TargetTypeRef> {
    const selected = policyFor().representation.represent(evidence, position, occurrence);
    return selected.kind === "represented" ? represented(selected.value.carrier) : selected;
  }

  function missing(occurrence: Node, message: string): Failure {
    return nativeRepresentationFailure(occurrence, "CSHARP_NATIVE_VALUE_CARRIER_NOT_PROVEN", message);
  }

  return nativeValue;
}
