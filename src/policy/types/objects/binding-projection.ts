import type { CsharpBindingElementProjection, CsharpBindingPatternSource, CsharpTupleDefaultUse, CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";

import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

import { resolveCsharpObjectShapeMemberBySourceContract, resolveCsharpObjectShapeMemberBySourceKey, csharpObjectShapeMemberLookupFailureMessage } from "../../../target-model/types/object-shape-members.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpAbsenceTargetType, getCsharpGenericOptionalParts, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { tryCsharpIdentifier } from "../../../target-model/names/identifiers.js";

import type { TargetTypeRef, CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import { csharpArrayBindingProjectionTarget, resolveCsharpArrayBindingCarrier, type CsharpArrayBindingCarrier } from "../../../target-model/types/carriers/binding-array-carrier.js";

type BindingPatternProjectionRequest =
  | { readonly kind: "array-source"; readonly carrier: TargetTypeRef | undefined }
  | { readonly kind: "array-element"; readonly carrier: CsharpArrayBindingCarrier; readonly index: number;
      readonly rest: boolean; readonly hasDefault: boolean }
  | { readonly kind: "object-source"; readonly shape: CsharpObjectShapeFact | undefined; readonly sourceOwned: boolean }
  | { readonly kind: "object-member"; readonly shape: CsharpObjectShapeFact; readonly sourceName: string;
      readonly description: string; readonly permitsAbsence: boolean }
  | { readonly kind: "object-rest"; readonly source: CsharpObjectShapeFact; readonly rest: CsharpObjectShapeFact;
      readonly extractedNames: ReadonlySet<string>; readonly description: string }
  | { readonly kind: "source-owned-member"; readonly sourceName: string | undefined; readonly stringLiteral: boolean;
      readonly rest?: boolean; readonly hasDefault?: boolean };

type BindingPatternProjectionSelection =
  | { readonly kind: "source"; readonly source: CsharpBindingPatternSource }
  | { readonly kind: "element"; readonly element: CsharpBindingElementProjection }
  | { readonly kind: "unresolved"; readonly reasons: readonly string[] };

export function selectCsharpBindingPatternDefault(carrier: TargetTypeRef): CsharpTupleDefaultUse {
  const element = getCsharpNullableElementTargetType(carrier);
  return Object.freeze(element === undefined ? { kind: "unused" } : { kind: "planned", carrier: element });
}

export function selectCsharpDefaultValueContract(source: TargetTypeRef, target: TargetTypeRef, presence: boolean): CsharpDefaultValueContract {
  const normalize = source.kind === "type-parameter" && getCsharpGenericOptionalParts(source) === undefined;
  const storage = normalize ? csharpNullableTargetType(source) : source;
  const generic = getCsharpGenericOptionalParts(storage);
  const element = generic?.element ?? getCsharpNullableElementTargetType(storage);
  const optional = element !== undefined || isCsharpJsValueTargetType(storage);
  const retainStorage = generic !== undefined && targetTypeRefEquals(storage, target);
  const guardType = element ?? storage;
  const present = retainStorage ? storage : guardType;
  const kind = isCsharpAbsenceTargetType(storage) ? "absence"
    : !presence && generic === undefined && element !== undefined &&
      (targetTypeRefEquals(element, target) || targetTypeRefEquals(storage, target)) ? "coalesce"
    : !optional && !presence ? "value" : "guarded";
  return Object.freeze({ kind, source, storage, present, guardType, target, normalize, optional, retainStorage, presence });
}

export function selectCsharpBindingPatternProjection(input: BindingPatternProjectionRequest): BindingPatternProjectionSelection {
  const element = (value: CsharpBindingElementProjection): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "element", element: Object.freeze(value) });
  const source = (value: CsharpBindingPatternSource): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "source", source: Object.freeze(value) });
  const unresolved = (reason?: string): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "unresolved", reasons: Object.freeze(reason === undefined ? [] : [reason]) });
  switch (input.kind) {
    case "array-source": {
      const bindingCarrier = resolveCsharpArrayBindingCarrier(input.carrier);
      return input.carrier === undefined || bindingCarrier === undefined ? unresolved()
        : source({ kind: "array-source", sourceCarrier: input.carrier, bindingCarrier });
    }
    case "array-element": {
      const projected = csharpArrayBindingProjectionTarget(input.carrier, input.index, input.rest);
      if (input.rest) {
        if (input.carrier.kind === "array" && projected !== undefined) return element({ kind: "array-rest", start: input.index, restCarrier: input.carrier.restCarrier });
        return projected?.kind === "tuple" ? element({ kind: "tuple-rest", start: input.index, restCarrier: projected })
          : unresolved("Tuple rest destructuring requires an exact tuple-slice carrier.");
      }
      return element({ kind: "array-element", index: input.index,
        ...(projected === undefined ? {} : { elementCarrier: projected }),
        ...(input.hasDefault && input.carrier.kind === "tuple" && projected !== undefined
          ? { tupleDefault: selectCsharpBindingPatternDefault(projected) } : {}) });
    }
    case "object-source":
      return input.shape !== undefined ? source({ kind: "object-shape-source", shape: input.shape })
        : input.sourceOwned ? source({ kind: "source-owned-source" }) : unresolved();
    case "object-member": {
      if (typeof input.permitsAbsence !== "boolean") return unresolved("An object binding requires its checked absence permission.");
      const selected = resolveCsharpObjectShapeMemberBySourceContract(input.shape, input.sourceName, "checked-object-binding-property");
      if (selected.kind === "missing" && selected.reason === "not-in-finalized-shape" && input.permitsAbsence) {
        return element({ kind: "object-shape-absence", carrier: csharpAbsenceTargetType() });
      }
      return selected.kind === "resolved" ? element({ kind: "object-shape-member", member: selected.member })
        : unresolved(csharpObjectShapeMemberLookupFailureMessage(selected, input.description));
    }
    case "object-rest": {
      for (const name of input.extractedNames) {
        const stale = resolveCsharpObjectShapeMemberBySourceContract(input.rest, name, "finalized-object-rest-member");
        if (stale.kind === "resolved") return unresolved(`${input.description} rest shape must exclude explicitly extracted member '${stale.member.sourceName}'.`);
      }
      const members: { readonly rest: CsharpObjectShapeMemberFact; readonly source: CsharpObjectShapeMemberFact }[] = [];
      const reasons: string[] = [];
      for (const restMember of input.rest.members) {
        const selected = resolveCsharpObjectShapeMemberBySourceKey(input.source, restMember.sourceKey, "finalized-object-rest-member");
        if (selected.kind !== "resolved") {
          reasons.push(csharpObjectShapeMemberLookupFailureMessage(selected, `${input.description} source shape`));
          continue;
        }
        if (!targetTypeRefEquals(selected.member.type, restMember.type)) {
          reasons.push(`${input.description} member '${restMember.sourceName}' requires matching finalized source and rest member carriers.`);
          continue;
        }
        members.push(Object.freeze({ rest: restMember, source: selected.member }));
      }
      if (reasons.length > 0) return Object.freeze({ kind: "unresolved", reasons: Object.freeze(reasons) });
      return element({ kind: "object-shape-rest", restShape: input.rest, members: Object.freeze(members) });
    }
    case "source-owned-member":
      if (input.rest) return unresolved("Object rest destructuring requires finalized provider object-spread semantics before C# emission.");
      if (input.hasDefault) return unresolved("Destructuring defaults require finalized undefined/default-value semantics before C# emission.");
      return input.sourceName === undefined || input.stringLiteral && tryCsharpIdentifier(input.sourceName) !== input.sourceName
        ? unresolved() : element({ kind: "source-owned-member", propertyName: input.sourceName,
          propertyNameKind: input.stringLiteral ? "string-literal" : "identifier" });
  }
}
