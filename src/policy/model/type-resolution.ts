// The C# policy model's type queries (nextgen C-2542, I2, I6).
//
// Inputs are published Source facts and descriptors only: no checker Type, Signature, Symbol or ResolvedSource*Info.
// Every Source question (value type, slot, return, instantiation, sum, relation) is answered by SourceProgramFacts;
// these queries only represent the Host answer in .NET through the one mapping (representation/), or answer a
// target-only question (array literal storage, guard folding, binding projection, pointer and typed-location ABI).
// A missing Host fact for a supported form is an invariant failure inside the implementation, never `undefined`.
import type { Node } from "@tsonic/tsts";

import type { SourceStorageProducer } from "@tsonic/target-api/analysis";
import type { SourceClosedSum, SourceInstantiation, SourceTypeDescriptor } from "@tsonic/target-api/source";
// The representation data types live in target-model (policy may not import representation/, R8 layer contract;
// request FX-CC-R1 to FX-CR); representation/ implements the one mapping over them.
import type { CsharpRepresentation, CsharpRepresentationPosition } from "../../target-model/types/representation.js";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";
import type { CsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";
import type { CsharpArrayLiteralSelection } from "../../target-model/records/operations/array-literals.js";

/** Where a represented type is used: storage (fields, locals, parameters), a value-only use, a type argument or a return. */
export type CsharpTypePosition = CsharpRepresentationPosition;

/** The represented per-use instantiation (receiver binders, method binders, parameters, result), from the Host record. */
export interface CsharpInstantiationRepresentation {
  readonly instantiation: Exclude<SourceInstantiation, { readonly kind: "refused" }>;
  readonly receiver: readonly CsharpRepresentation[];
  readonly method: readonly CsharpRepresentation[];
  readonly parameters: readonly CsharpRepresentation[];
  readonly result: CsharpRepresentation;
}

export interface CsharpTypeQueries {
  /** The one descriptor → TargetTypeRef mapping (I6) at an occurrence. */
  represent(descriptor: SourceTypeDescriptor, occurrence: Node, position: CsharpTypePosition): CsharpRepresentation;
  /** A closed sum, arms positional in Host order (R6). */
  representSum(sum: SourceClosedSum, occurrence: Node, position: CsharpTypePosition): CsharpRepresentation;
  /** `facts.values.type(node)` represented as a value. */
  value(node: Node): CsharpRepresentation;
  /** `facts.values.slot(slot)` represented as storage (declaration, parameter, field, property, element binding). */
  storage(slot: Node): CsharpRepresentation;
  /** The storage a read expression reads (identifier, member or element read → the slot it names, else its value). */
  readStorage(read: Node): CsharpRepresentation;
  /** `facts.values.callableReturn(declaration)` represented as a return. */
  callableReturn(declaration: Node): CsharpRepresentation;
  /** `facts.values.awaited(node)` represented as a value. */
  awaited(node: Node): CsharpRepresentation;
  /** `facts.instantiations.at(use)` represented; undefined when the use has no generic binders. */
  instantiation(use: Node): CsharpInstantiationRepresentation | undefined;
  /** C# constraints of one generic binder declaration, from the Host descriptors of its authored constraint parts. */
  typeParameterConstraints(declaration: Node, parameter: Extract<import("../../target-model/types/model.js").TargetTypeRef, { readonly kind: "type-parameter" }>):
    import("../../target-model/types/generic-constraints.js").CsharpTypeParameterConstraintResolution;
  /** Target-only: the C# storage of an array literal (List<T>, T[], JSArray role) from its published element type. */
  resolveArrayLiteral(node: Node): CsharpArrayLiteralSelection;
  /** Target-only: a guard whose native value is constant (folded by the planner). */
  nativeGuardResult(expression: Node): boolean | undefined;
  /** Target-only: the native projection of a destructuring binding. */
  resolveBindingProjection(node: Node): import("../../target-model/records/storage/binding-projection-policy.js").CsharpBindingProjection | undefined;
  /** Target-only: a fixed-array marker carrier selected for a published descriptor. */
  selectFixedArray(type: SourceTypeDescriptor, occurrence: Node): import("../types/collections/fixed-arrays.js").CsharpFixedArraySelection | undefined;
  resolvePointerReturn(declaration: Node): CsharpPointerReturnContract | undefined;
  resolvePointerStoragePointee(producer: SourceStorageProducer): import("../../target-model/records/storage/pointer-storage.js").CsharpPointerStoragePointeeSelection;
  resolveTypedLocationOperationPointee(operation: CsharpSourceTypedLocationOperation): CsharpRepresentation;
}
