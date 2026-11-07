// Target inputs of one source-profile selection (nextgen C-2542). Every Source answer here is a published Host fact
// (a descriptor or a node); the TargetTypeRefs are its one C# representation (I6). No checker Type (I2).
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpObjectShapeFact } from "../../types/model.js";
import type { CsharpDelegateSignatureShape } from "../../types/model.js";
import type { CsharpCallArgumentProjection } from "../objects/members.js";
import type { SourceCallSelection, SourceElementAccessRecord, SourceMemberAccessSelection, SourceTypeDescriptor } from "@tsonic/target-api/source";

/** A value input of a source-profile use: the expression and its published value type. */
export interface CsharpSourceProfileValue {
  readonly expression: Node;
  readonly type: SourceTypeDescriptor;
}

/** One method binder of the selected signature, instantiated at the use (facts.instantiations.at). */
export interface CsharpSourceProfileTypeArgumentSource {
  readonly binder: Node;
  readonly type: SourceTypeDescriptor;
  /** The type argument is authored at the use (`f<T>(…)`), not inferred. Authored syntax only. */
  readonly explicit: boolean;
}

/** A call, `new` or tagged template selected by the Host (facts.selections.call + facts.instantiations.at). */
export interface CsharpSourceProfileCallSource {
  readonly call: Node;
  readonly selection: SourceCallSelection;
  readonly receiver?: CsharpSourceProfileValue;
  /** Authored arguments in order (a spread argument is the spread element itself). */
  readonly arguments: readonly CsharpSourceProfileValue[];
  /** Selected signature parameters after instantiation, in order. */
  readonly parameters: SourceCallSelection["parameters"];
  /** Argument → parameter correspondence (Host). */
  readonly bindings: SourceCallSelection["arguments"];
  readonly typeArguments: readonly CsharpSourceProfileTypeArgumentSource[];
}

/** A member read or write selected by the Host (facts.selections.memberAccess). */
export interface CsharpSourceProfilePropertySource {
  readonly expression: Node;
  readonly selection: SourceMemberAccessSelection;
  readonly receiver: CsharpSourceProfileValue;
}

/** An element read or write selected by the Host (facts.values.elementAccess). */
export interface CsharpSourceProfileElementSource {
  readonly expression: Node;
  readonly access: SourceElementAccessRecord;
  readonly receiver: CsharpSourceProfileValue;
  readonly argument: CsharpSourceProfileValue;
}
export type CustomRegExpProtocolKind = "match" | "match-all" | "replace" | "search" | "split";
export interface CsharpCustomRegExpProtocol {
  readonly receiverType: TargetTypeRef;
  readonly memberTargetName: string;
  readonly signature: CsharpDelegateSignatureShape;
}
export interface CsharpSourceProfileInputRequirements {
  readonly errorCause?: true;
  readonly regexpProtocol?: true;
  readonly regexpExecution?: true;
  readonly objectShapes?: true;
}
/** One method binder of the call (Host instantiation) and its C# representation. */
export interface CsharpSourceProfileTypeArgumentInput {
  readonly source: CsharpSourceProfileTypeArgumentSource;
  /** The instantiated Source type, represented as a type argument. */
  readonly carrier: TargetTypeRef | undefined;
  /** The binder itself, represented as the C# type parameter it declares. */
  readonly parameter: TargetTypeRef | undefined;
}
export interface CsharpSourceProfileInputFacts {
  readonly errorCause?: { readonly kind: "resolved"; readonly projection: CsharpCallArgumentProjection }
    | { readonly kind: "unresolved"; readonly reason: string };
  readonly nativeRegExpReceivers: ReadonlySet<Node>;
  /** Value expressions whose C# carrier is a type parameter constrained to INumber<T>. */
  readonly numericArguments: ReadonlySet<Node>;
  readonly throwableCarriers: ReadonlySet<TargetTypeRef>;
  /** Every method binder's carrier in declaration order, or undefined when one has no C# representation. */
  readonly callTypeArguments: readonly TargetTypeRef[] | undefined;
  /** Per selected signature parameter: its instantiated C# carrier (a single delegate arm for a callable argument). */
  readonly parameters: readonly (TargetTypeRef | undefined)[];
  readonly regexpProtocol: { readonly get: (index: number, kind: CustomRegExpProtocolKind) => CsharpCustomRegExpProtocol | undefined };
  /** The published value type of an input expression (or a spread operand), represented as a value. */
  readonly values: { readonly get: (node: Node | undefined) => TargetTypeRef | undefined };
  /** The published result of the call or member/element read, represented as a value. */
  readonly results: { readonly get: (node: Node | undefined) => TargetTypeRef | undefined };
  readonly typeArgument: { readonly get: (source: CsharpSourceProfileTypeArgumentSource) => TargetTypeRef | undefined };
  readonly objectShape: { readonly get: (node: Node | undefined) => CsharpObjectShapeFact | undefined };
  readonly typeArguments: readonly CsharpSourceProfileTypeArgumentInput[];
}
