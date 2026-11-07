// Target-only type queries over the one representation (nextgen C-2542, request R-C1 of AGENT-D1-NOTES).
// Each answers a .NET question about a Host-published Source answer: array literal storage, guard folding, fixed
// array markers, pointer return and pointee carriers, typed-location pointees. Inputs are SourceProgramFacts,
// extension facts and the C# representation; no checker Type, Signature or Symbol is read (I2). A refused Host
// outcome reached here is an invariant failure: Host refusals are forwarded before C# analysis.
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceStorageProducer, SourceStorageBindings, SourceStorageQueries } from "@tsonic/target-api/analysis";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionShapeQueries } from "../../policy/conversions/shape-queries.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { selectCsharpExactLiteralConversion } from "../../policy/conversions/literals.js";
import { csharpArrayLiteralElisionIssue } from "../../policy/types/collections/literal-construction.js";
import { selectCsharpFixedArray, type CsharpFixedArraySelection } from "../../policy/types/collections/fixed-arrays.js";
import type { CsharpArrayLiteralSelection } from "../../target-model/records/operations/array-literals.js";
import type { CsharpPointerStoragePointeeSelection } from "../../target-model/records/storage/pointer-storage.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { csharpRuntimeLocationPointee } from "../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";
import { resolveCsharpPointerReturnContract } from "../callables/ownership/pointer-return.js";
import type { SourceCallableSourceContract } from "../../target-model/records/callables/source-callable-contract.js";
import { selectCsharpPhysicalRead } from "./physical-reads.js";
import { csharpRefusal, csharpRepresentationContext, isCsharpRefusal, representSourceType,
  type CsharpRepresentation, type CsharpRepresentationServices } from "../../representation/index.js";

/** Program inputs beyond the representation services. `conversions` is read lazily, after the type system exists. */
export interface CsharpSourceEvidenceTypeQueryHost {
  readonly pointerStorage: TsonicPointerStorageRelation;
  readonly sourceStorage: SourceStorageQueries;
  conversions(): Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers" | "target"> & CsharpConversionShapeQueries;
  /** The native storage carrier selected for a node (current constructions, then the planning iteration; K-2664). */
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  /** The closed callable input contract of a callable value or its binding (planning iteration). */
  closedInputContract(node: Node): SourceCallableSourceContract | undefined;
}

export type CsharpSourceEvidenceTypeQueries = Pick<CsharpTypeQueries, "resolveArrayLiteral" | "nativeGuardResult" |
  "resolvePointerReturn" | "resolvePointerStoragePointee" | "resolveTypedLocationOperationPointee"> & {
  /** The FixedArray a descriptor denotes (element descriptor + Host extent), or undefined (R-C4-1, R-C4-2). */
  selectFixedArray(type: SourceTypeDescriptor, occurrence: Node): CsharpFixedArraySelection | undefined;
  /**
   * The physical carrier a read of `node` uses instead of its represented logical carrier (physical-reads.ts), or
   * undefined when the logical carrier stays. CsharpTypeQueries.value composes it: `physicalRead(node, logical) ?? logical`.
   */
  physicalRead(node: Node, logical: TargetTypeRef): TargetTypeRef | undefined;
};

/** Activation binding chains deeper than this are refused as unresolved pointer backing (a C# analysis budget). */
const maximumActivationDepth = 64;
const unavailable: CsharpArrayLiteralSelection = Object.freeze({ kind: "unavailable" });

export function createCsharpSourceEvidenceTypeQueries(
  services: CsharpRepresentationServices,
  host: CsharpSourceEvidenceTypeQueryHost,
): CsharpSourceEvidenceTypeQueries {
  const { facts, syntax: ast } = services;
  const represent = (descriptor: SourceTypeDescriptor, occurrence: Node, position: "storage" | "value" = "value"): CsharpRepresentation =>
    representSourceType(descriptor, csharpRepresentationContext(services, occurrence, position));
  const published = (node: Node): SourceTypeDescriptor => {
    const outcome: ReturnType<typeof facts.values.type> | undefined = facts.values.type(node);
    // values.type is total over value nodes (I4): a missing fact is a Host invariant breach, never "unavailable".
    if (outcome === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A value node reached a C# type query without its published Host type (I4).", node);
    return outcome.kind === "refused" ? failTargetAnalysisInvariant("tsonic-csharp",
      `A Host refusal (${outcome.code}) reached a C# type query; Host refusals are forwarded before C# analysis.`, node)
      : outcome.construction ?? outcome.type;
  };

  function resolveArrayLiteral(node: Node): CsharpArrayLiteralSelection {
    if (!ast.is.IsArrayLiteralExpression(node)) return unavailable;
    const elision = csharpArrayLiteralElisionIssue(ast, node);
    if (elision !== undefined) return elision;
    const carrier = represent(published(node), node, "storage");
    if (isCsharpRefusal(carrier)) return Object.freeze({ kind: "rejected", subject: carrier.site, code: carrier.code, reason: carrier.message });
    const presentCarrier = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier) ?? carrier;
    const element = getCsharpCollectionElementTargetType(presentCarrier);
    if (presentCarrier.kind !== "tuple" && element === undefined) return unavailable;
    const elements: TargetTypeRef[] = [];
    let rejection: Extract<CsharpArrayLiteralSelection, { readonly kind: "rejected" }> | undefined;
    const fits = (required: TargetTypeRef, actual: TargetTypeRef, value: Node | undefined): boolean => {
      const literal = value === undefined ? undefined : facts.values.literal(value);
      if (literal !== undefined) {
        const selected = selectCsharpExactLiteralConversion(literal, actual, required);
        if (selected.kind === "rejected") {
          rejection ??= Object.freeze({ kind: "rejected", subject: value!, code: "CSHARP_LITERAL_NOT_REPRESENTABLE", reason: selected.reason });
          return false;
        }
        if (selected.kind === "resolved" || selected.kind === "source-representation") return true;
      }
      return csharpConversionIsApplicable(selectCsharpConversion(host.conversions(), actual, required, "implicit"), "implicit");
    };
    let complete = true;
    let mismatch = false;
    for (const entry of ast.elements(node)) {
      if (entry === undefined) {
        complete = false;
        continue;
      }
      if (!ast.is.IsSpreadElement(entry)) {
        const physical = represent(published(entry), entry);
        if (isCsharpRefusal(physical)) return Object.freeze({ kind: "rejected", subject: physical.site, code: physical.code, reason: physical.message });
        const required = presentCarrier.kind === "tuple" ? presentCarrier.elements[elements.length] : element;
        elements.push(physical);
        if (required === undefined || !fits(required, physical, entry)) mismatch = true;
        continue;
      }
      const operand = ast.as.AsSpreadElement(entry)?.Expression;
      const choice = operand === undefined ? undefined : sourceSequenceInputChoice(ast, operand);
      if (choice === undefined) {
        complete = false;
        continue;
      }
      let contribution: TargetTypeRef | undefined = element;
      for (const expression of choice.inputs) {
        if (sourceSequenceInputIsEmpty(ast, expression)) continue;
        const selected = represent(published(expression), expression);
        if (isCsharpRefusal(selected)) return Object.freeze({ kind: "rejected", subject: selected.site, code: selected.code, reason: selected.message });
        const present = getCsharpGenericOptionalParts(selected)?.element ?? getCsharpNullableElementTargetType(selected) ?? selected;
        if (present.kind !== "tuple" && getCsharpCollectionElementTargetType(present) === undefined) complete = false;
        const carriers = present.kind === "tuple" ? present.elements : [getCsharpCollectionElementTargetType(present)];
        for (const item of carriers) if (item !== undefined && element !== undefined && !fits(element, item, undefined)) mismatch = true;
        contribution ??= present.kind === "tuple" ? present.elements[0] : getCsharpCollectionElementTargetType(present);
      }
      if (contribution === undefined) complete = false;
      else elements.push(contribution);
    }
    return !complete ? unavailable : rejection ?? (mismatch ? Object.freeze({ kind: "rejected",
      subject: node, code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
      reason: "An array element cannot retain the exact Host-selected native element carrier." })
      : Object.freeze({ kind: "resolved", carrier, elementCarriers: Object.freeze(elements) }));
  }

  /**
   * A guard whose value the Host decided: a `test` relation with outcome "always-true" or "always-false" (the Host proves
   * it for every value the operand can hold). An undecided test, or a guard without a Host test relation, is not folded;
   * C# never derives the outcome from arms or carriers.
   */
  function nativeGuardResult(expression: Node): boolean | undefined {
    let guard = facts.navigation.expressions.transparentOperand(expression);
    let negated = false;
    while (ast.is.IsPrefixUnaryExpression(guard) && ast.operatorKindName(guard) === "KindExclamationToken") {
      const operand = ast.as.AsPrefixUnaryExpression(guard)?.Operand;
      if (operand === undefined) return undefined;
      guard = facts.navigation.expressions.transparentOperand(operand);
      negated = !negated;
    }
    const relation = facts.relations.at(guard);
    if (relation === undefined || relation.kind !== "test" || relation.outcome === "undecided") return undefined;
    return (relation.outcome === "always-true") !== negated;
  }

  /** A function of the descriptor: the FixedArray marker of the declaration it names and the Host extent it carries. */
  function selectFixedArray(type: SourceTypeDescriptor, occurrence: Node): CsharpFixedArraySelection | undefined {
    return selectCsharpFixedArray(services.sourceFacts, type, occurrence);
  }

  /** Generic binder maps of every activation of the storage owner (receiver and method binders per invocation). */
  function activationBindings(node: Node, bindings: SourceStorageBindings, depth: number):
    readonly ReadonlyMap<Node, SourceTypeDescriptor>[] | undefined {
    if (depth > maximumActivationDepth) return undefined;
    const owner = facts.navigation.scopes.enclosing(node, "callable-body");
    if (owner === undefined) return [new Map()];
    const selected = host.sourceStorage.boundActivationsFor(owner, bindings);
    if (selected.kind === "unresolved") return undefined;
    const states: ReadonlyMap<Node, SourceTypeDescriptor>[] = [];
    for (const activation of selected.activations) {
      if (activation.kind === "declaration") {
        states.push(new Map());
        continue;
      }
      const callers = activationBindings(activation.invocation, activation.callerBindings, depth + 1);
      if (callers === undefined) return undefined;
      const instantiation = facts.instantiations.at(activation.invocation);
      if (instantiation?.kind === "refused") return undefined;
      for (const caller of callers) {
        const state = new Map<Node, SourceTypeDescriptor>();
        for (const argument of instantiation === undefined ? [] : [...instantiation.receiver, ...instantiation.method]) {
          state.set(argument.declaration, caller.size === 0 ? argument.type : facts.sums.substitute(argument.type, caller));
        }
        states.push(state);
      }
    }
    return states;
  }

  /** The Host type of a storage subject: the subject node's type, then its projection through Host object facts. */
  function subjectType(producer: SourceStorageProducer): SourceTypeDescriptor | undefined {
    const { subject } = producer;
    const root = subject.kind === "return" ? facts.values.callableReturn(subject.node) : facts.values.type(subject.node);
    if (root.kind === "refused") return undefined;
    let type: SourceTypeDescriptor | undefined = root.type;
    for (const component of subject.projection) {
      if (type === undefined) return undefined;
      const present: SourceTypeDescriptor = type.kind === "optional" ? type.value : type;
      const structure: SourceTypeDescriptor = present.kind === "declared" && present.definition !== undefined ? present.definition : present;
      if (component.kind === "array-element") type = structure.kind === "array" ? structure.element : undefined;
      else if (component.kind === "tuple-element") type = structure.kind === "tuple" ? structure.elements[component.index]?.type : undefined;
      else {
        const members = facts.objects.members(present);
        type = Array.isArray(members)
          ? (members as Exclude<typeof members, { readonly kind: "refused" }>).find(member => member.declarations.includes(component.declaration))?.type
          : undefined;
      }
    }
    return type;
  }

  function resolvePointerStoragePointee(producer: SourceStorageProducer): CsharpPointerStoragePointeeSelection {
    const states = activationBindings(producer.subject.node, producer.bindings, 0);
    if (states === undefined || states.length === 0) return {
      kind: "unresolved", reason: "The pointer producer has no complete canonical native activation bindings.",
    };
    const type = subjectType(producer);
    if (type === undefined) return { kind: "unresolved", reason: "The pointer producer has no Host-published storage type." };
    const pointees = states.map(bindings => {
      const carrier = represent(bindings.size === 0 ? type : facts.sums.substitute(type, bindings), producer.subject.node, "storage");
      return isCsharpRefusal(carrier) ? undefined : csharpRuntimeLocationPointee(getCsharpNullableElementTargetType(carrier) ?? carrier);
    });
    const first = pointees[0];
    if (first === undefined || pointees.some(pointee => pointee === undefined || !targetTypeRefEquals(pointee, first))) return {
      kind: "unresolved", reason: "The pointer producer does not have one exact native pointee carrier in every activation.",
    };
    return Object.freeze({ kind: "resolved", type: first });
  }

  function resolveTypedLocationOperationPointee(operation: CsharpSourceTypedLocationOperation): CsharpRepresentation {
    const site = operation.call;
    const pointee = (selected: CsharpRepresentation): CsharpRepresentation =>
      isCsharpRefusal(selected) ? selected : csharpRuntimeLocationPointee(selected) ?? missing();
    const delegateResult = (selected: CsharpRepresentation): CsharpRepresentation =>
      isCsharpRefusal(selected) ? selected : getCsharpDelegateSignature(selected)?.returnType ?? missing();
    const missing = (): CsharpRepresentation => csharpRefusal("CSHARP_TYPED_LOCATION_POINTEE",
      "The typed-location operand has no .NET location or accessor carrier to take its pointee from.", site);
    if (operation.explicitPointeeTypeNode !== undefined) return represent(operation.pointeeType, site, "storage");
    switch (operation.kind) {
      case "location-address": {
        const slot = operation.storageDeclaration === undefined ? undefined : facts.values.slot(operation.storageDeclaration);
        return represent(slot?.kind === "slot" ? slot.type : operation.storageType, operation.storageExpression, "storage");
      }
      case "location-allocate":
        return represent(operation.initialType, operation.initialExpression);
      case "location-load":
      case "location-store":
      case "location-hash":
        return pointee(represent(operation.locationType, operation.locationExpression));
      case "location-equal": {
        const left = pointee(represent(operation.leftType, operation.leftExpression));
        return isCsharpRefusal(left) ? pointee(represent(operation.rightType, operation.rightExpression)) : left;
      }
      case "location-bind":
      case "location-view":
        return delegateResult(represent(operation.readType, operation.readExpression));
      case "location-project":
        return delegateResult(represent(operation.fromSourceType, operation.fromSourceExpression));
    }
  }

  return Object.freeze({
    resolveArrayLiteral,
    nativeGuardResult,
    selectFixedArray,
    resolvePointerReturn: (declaration: Node) => resolveCsharpPointerReturnContract({
      ast, facts, pointerStorage: host.pointerStorage, sourceStorage: host.sourceStorage, resolvePointee: resolvePointerStoragePointee,
    }, declaration),
    resolvePointerStoragePointee,
    resolveTypedLocationOperationPointee,
    physicalRead: (node: Node, logical: TargetTypeRef) => selectCsharpPhysicalRead({
      facts,
      syntax: ast,
      scopedTargetType: selected => host.scopedTargetType(selected),
      closedInputContract: selected => host.closedInputContract(selected),
      objectShapes: host.conversions().objectShapes ?? failTargetAnalysisInvariant("tsonic-csharp",
        "A physical read was requested before the object-shape registry was initialized.", node),
    }, node, logical),
  });
}
