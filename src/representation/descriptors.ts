// The ONE descriptor -> TargetTypeRef mapping (I6). Every Source answer comes from the Host descriptor; C# decides only
// the .NET carrier. Unsupported .NET shapes return a CSHARP_ refusal; a malformed fact throws (I4).
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceClosedSum, SourceInstantiation, SourceObjectMember, SourceTypeDescriptor, SourceTypeDescriptorSignature } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../target-model/types/model.js";
import { csharpAnyTargetType, csharpAbsenceTargetType, csharpTsValueTargetType } from "../target-model/types/carriers/runtime-carriers.js";
import { csharpBigIntegerTargetType, csharpNeverTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpVoidTargetType } from "../target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType, csharpJsSymbolTargetType } from "../target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../target-model/types/carriers/nullable.js";
import { selectCsharpParameterListCarrier } from "../policy/types/callables/parameter-list.js";
import { csharpRefusal, csharpRepresentationContext, isCsharpRefusal, representAll, type CsharpRepresentation,
  type CsharpRepresentationContext } from "./context.js";
import { representClosedSum, type RepresentDescriptor } from "./sums.js";
import { representDeclared } from "./declared.js";
import { isClassStaticSide, representConstructorValue, representSignatureDelegate } from "./callables.js";
import { representIndexedShape, representObjectShape } from "./objects.js";
import { csharpSourceTypeParameter } from "../source/extension/type-parameters.js";
import { substituteTargetTypeParameters } from "../policy/types/resolution/substitution.js";
import type { Node } from "@tsonic/tsts";

/** The single descriptor -> TargetTypeRef mapping. */
export function representSourceType(descriptor: SourceTypeDescriptor, context: CsharpRepresentationContext): CsharpRepresentation {
  return representWithin(descriptor, context, new Set());
}

/** A closed sum -> `Union<…>` (or nullable/optional carrier), arms positional in Host order, absence lifted. */
export function representSourceSum(sum: SourceClosedSum, context: CsharpRepresentationContext): CsharpRepresentation {
  const active = new Set<SourceTypeDescriptor>();
  return representClosedSum(sum, context, descriptor => representWithin(descriptor, context, active));
}

export interface CsharpInstantiationRepresentation {
  readonly receiver: readonly CsharpRepresentation[];
  /**
   * The C# method type arguments: the Source method binders in declaration order, then the generated projection
   * binders of the selected signature (collection-key / optional / source-union), each substituted from the binder
   * arguments (the static Set/Map key witness of a generic owner travels here).
   */
  readonly method: readonly CsharpRepresentation[];
  readonly parameters: readonly CsharpRepresentation[];
  readonly result: CsharpRepresentation;
}

/** Generic arguments for a call, construction or generic function value, from the Host instantiation (G4). */
export function representInstantiation(
  instantiation: Exclude<SourceInstantiation, { readonly kind: "refused" }>,
  context: CsharpRepresentationContext,
): CsharpInstantiationRepresentation {
  const argument = csharpRepresentationContext(context, context.occurrence, "type-argument");
  const receiver = instantiation.receiver.map(binding => representSourceType(binding.type, argument));
  const method = instantiation.method.map(binding => representSourceType(binding.type, argument));
  const bindings = new Map<string, TargetTypeRef>();
  const bind = (bound: readonly { readonly declaration: Node }[], represented: readonly CsharpRepresentation[]): boolean =>
    bound.every((binding, index) => {
      const parameter = csharpSourceTypeParameter(binding.declaration, context.syntax);
      const selected = represented[index]!;
      if (parameter === undefined || isCsharpRefusal(selected)) return false;
      bindings.set(parameter.identity, selected);
      return true;
    });
  const projections = context.genericProjections(instantiation.signature);
  if (projections.length !== 0 && bind(instantiation.receiver, receiver) && bind(instantiation.method, method)) {
    for (const projection of projections) method.push(substituteTargetTypeParameters(projection, bindings));
  }
  return Object.freeze({
    receiver: Object.freeze(receiver),
    method: Object.freeze(method),
    parameters: Object.freeze(instantiation.parameters.map(parameter => representSourceType(parameter,
      csharpRepresentationContext(context, context.occurrence, "storage")))),
    result: representSourceType(instantiation.result, csharpRepresentationContext(context, context.occurrence, "return")),
  });
}

/** The native object shape (class/struct/record/anonymous) for a Source object type, from Host object facts. */
export function representObject(type: SourceTypeDescriptor, members: readonly SourceObjectMember[],
  context: CsharpRepresentationContext): CsharpRepresentation {
  const active = new Set<SourceTypeDescriptor>();
  return representObjectShape(type, members, context, descriptor => representWithin(descriptor, context, active));
}

function representWithin(descriptor: SourceTypeDescriptor, context: CsharpRepresentationContext,
  active: Set<SourceTypeDescriptor>): CsharpRepresentation {
  // An anonymous structural cycle has no .NET name to close it; named cycles end at a declaration (recursion cut).
  if (active.has(descriptor)) return csharpRefusal("CSHARP_RECURSIVE_STRUCTURE",
    "An anonymous object type refers to itself; .NET needs a named type for the cycle.", context.occurrence);
  active.add(descriptor);
  const represent: RepresentDescriptor = selected => representWithin(selected, context, active);
  try {
    return representDescriptor(descriptor, context, represent);
  } finally {
    active.delete(descriptor);
  }
}

function representDescriptor(descriptor: SourceTypeDescriptor, context: CsharpRepresentationContext,
  represent: RepresentDescriptor): CsharpRepresentation {
  switch (descriptor.kind) {
    case "primitive":
      return csharpSourcePrimitiveTargetType(descriptor.primitive);
    case "string":
      return csharpStringTargetType();
    case "intrinsic":
      switch (descriptor.intrinsic) {
        case "any": return csharpAnyTargetType();
        case "unknown": return csharpTsValueTargetType();
        case "object": return csharpObjectTargetType();
        case "void": return csharpVoidTargetType();
        case "never": return csharpNeverTargetType();
        case "absence": return csharpAbsenceTargetType();
        case "bigint": return csharpBigIntegerTargetType();
        case "symbol": return context.profile === "js" ? csharpJsSymbolTargetType()
          : csharpRefusal("CSHARP_SYMBOL_NATIVE", "Symbol values need the JS runtime profile.", context.occurrence);
      }
      return failTargetAnalysisInvariant("tsonic-csharp", "Unknown Host intrinsic descriptor.", context.occurrence);
    case "union": {
      const sum = context.facts.sums.sumOf(descriptor);
      if (sum === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A Host union descriptor must denote a published closed sum.", context.occurrence);
      return representClosedSum(sum, context, represent);
    }
    case "optional": {
      if (descriptor.value.kind === "union") {
        const sum = context.facts.sums.sumOf(descriptor);
        if (sum !== undefined) return representClosedSum(sum, context, represent);
      }
      const value = represent(descriptor.value);
      return isCsharpRefusal(value) ? value : csharpNullableTargetType(value);
    }
    case "array": {
      const element = represent(descriptor.element);
      if (isCsharpRefusal(element)) return element;
      return context.profile === "js" ? csharpJsArrayTargetType(element) : Object.freeze({ kind: "array", element });
    }
    case "tuple": {
      const elements = representAll(descriptor.elements, element => represent(element.type));
      if (isCsharpRefusal(elements)) return elements;
      const carriers = elements.map((element, index) => descriptor.elements[index]!.kind === "optional"
        ? csharpNullableTargetType(element) : element);
      const restIndexes = descriptor.elements.flatMap((element, index) => element.kind === "rest" ? [index] : []);
      return selectCsharpParameterListCarrier(Object.freeze(carriers), restIndexes, context.profile === "js") ??
        csharpRefusal("CSHARP_REST_PARAMETER", "A tuple with a rest element needs one homogeneous element type in .NET.", context.occurrence);
    }
    case "callable":
      return representCallable(descriptor.calls, descriptor.constructs, context, represent);
    case "shape": {
      if (descriptor.calls.length === 0 && descriptor.constructs.length !== 0) {
        // A construct-carrying shape is a constructor value only when its whole inventory is that class's static side.
        return descriptor.indexes.length === 0 && (descriptor.members.length === 0 || isClassStaticSide(descriptor, context))
          ? representConstructorValue(descriptor.constructs, context, represent)
          : csharpRefusal("CSHARP_CONSTRUCTOR_VALUE",
            "A constructor value with extra members or index signatures has no .NET carrier.", context.occurrence);
      }
      if (descriptor.calls.length !== 0) return csharpRefusal("CSHARP_SHAPE_CALLABLE_MEMBERS",
        "An object type with call signatures and members has no .NET delegate or class carrier.", context.occurrence);
      if (descriptor.indexes.length !== 0) {
        return descriptor.members.length === 0 ? representIndexedShape(descriptor.indexes, context, represent)
          : csharpRefusal("CSHARP_INDEX_SIGNATURES", "An object type with members and index signatures has no one .NET carrier.",
            context.occurrence);
      }
      // The descriptor was published, so its member facts exist (I4); a refusal here is a Host invariant breach.
      const members = context.facts.objects.members(descriptor);
      if (!Array.isArray(members)) failTargetAnalysisInvariant("tsonic-csharp",
        "A published Source shape must have published object member facts.", context.occurrence);
      return representObjectShape(descriptor, members as readonly SourceObjectMember[], context, represent);
    }
    case "declared":
      return representDeclared(descriptor, context, represent);
  }
}

function representCallable(calls: readonly SourceTypeDescriptorSignature[], constructs: readonly SourceTypeDescriptorSignature[],
  context: CsharpRepresentationContext, represent: RepresentDescriptor): CsharpRepresentation {
  if (calls.length === 0 && constructs.length !== 0) return representConstructorValue(constructs, context, represent);
  if (calls.length !== 1 || constructs.length !== 0) return csharpRefusal("CSHARP_CALLABLE_OVERLOADS",
    "A function type with several signatures has no single .NET delegate.", context.occurrence);
  return representSignatureDelegate(calls[0]!, context, represent);
}

/** Represents `descriptor` and returns the TargetTypeRef, or throws when a supported form was refused (tests, ABI). */
export function representedSourceType(descriptor: SourceTypeDescriptor, context: CsharpRepresentationContext): TargetTypeRef {
  const represented = representSourceType(descriptor, context);
  if (isCsharpRefusal(represented)) failTargetAnalysisInvariant("tsonic-csharp",
    `Expected a .NET representation, got ${represented.code}: ${represented.message}`, represented.site);
  return represented;
}
