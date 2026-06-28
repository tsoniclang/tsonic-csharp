import type {
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTypeofRuntimeKind,
} from "../../csharp-facts.js";

export type CsharpTargetTypeRenderShape =
  | { readonly kind: "predefined"; readonly name: string }
  | { readonly kind: "named"; readonly namespace?: readonly string[]; readonly name: string }
  | { readonly kind: "nullable" };

export type CsharpTargetNamedTypeRef = Extract<TargetTypeRef, { readonly kind: "target-named" }> & {
  readonly csharpRender?: CsharpTargetTypeRenderShape;
  readonly csharpThrowable?: true;
  readonly csharpTypeofRuntimeKind?: CsharpTypeofRuntimeKind;
  readonly csharpSpecialType?: "string" | "void" | "nullable";
  readonly csharpSourceDeclarationKind?: "class" | "interface" | "enum" | "struct";
  readonly csharpValueType?: true;
  readonly csharpArrayLiteralElementType?: TargetTypeRef;
  readonly csharpEnumerableElementType?: TargetTypeRef;
  readonly csharpReadOnlyIndexableElementType?: TargetTypeRef;
  readonly csharpDenseMutableElementType?: TargetTypeRef;
};

export type CsharpNullableReferenceTargetTypeRef = TargetTypeRef & {
  readonly csharpNullableReference?: true;
};

export type CsharpTargetAttributeValue =
  | { readonly kind: "null" }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "source-primitive"; readonly name: string; readonly value: string | boolean }
  | { readonly kind: "type"; readonly type: TargetTypeRef }
  | { readonly kind: "enum"; readonly type: TargetTypeRef; readonly value: string; readonly fieldName?: string }
  | { readonly kind: "array"; readonly elements: readonly CsharpTargetAttributeValue[] };

export type CsharpTargetAttributeArgument =
  | { readonly kind: "constructor"; readonly value: CsharpTargetAttributeValue }
  | { readonly kind: "named"; readonly name: string; readonly memberKind: "field" | "property"; readonly value: CsharpTargetAttributeValue };

export interface CsharpTargetAttributeFact {
  readonly id: string;
  readonly target: "type" | "constructor" | "method" | "property" | "field" | "event" | "parameter" | "return";
  readonly attributeType: TargetTypeRef;
  readonly constructorId: string;
  readonly arguments?: readonly CsharpTargetAttributeArgument[];
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetUnsupportedAttributeFact {
  readonly id: string;
  readonly target: CsharpTargetAttributeFact["target"];
  readonly attributeType?: TargetTypeRef;
  readonly constructorId?: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetUnsupportedDefaultValueFact {
  readonly kind: "unsupported-default-value";
  readonly id: string;
  readonly parameterName: string;
  readonly reason: string;
  readonly evidence?: readonly { readonly message: string }[];
}

export interface CsharpTargetParameter extends TargetParameter {
  readonly defaultValue?: unknown;
  readonly unsupportedDefaultValue?: CsharpTargetUnsupportedDefaultValueFact;
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly csharpAcceptsCheckedSourceArgument?: true;
  readonly csharpAcceptsClosedSourceArgument?: true;
  readonly csharpOmittableOptionalArgument?: true;
}

export interface CsharpTargetTypeParameter extends TargetTypeParameter {
  readonly unsupportedConstraints?: readonly unknown[];
}

export interface CsharpTargetMember extends Omit<TargetMember, "parameters" | "typeParameters"> {
  readonly parameters: readonly CsharpTargetParameter[];
  readonly typeParameters?: readonly CsharpTargetTypeParameter[];
  readonly declaringType?: TargetTypeRef;
  readonly receiverPassing?: "instance" | "first-argument";
  readonly csharpSourceOwnedCall?: true;
  readonly readonly?: boolean;
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly returnAttributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedReturnAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
}

export interface CsharpTargetConversionOperatorFact {
  readonly id: string;
  readonly conversionKind: "implicit" | "explicit";
  readonly declaringType: TargetTypeRef;
  readonly sourceType: TargetTypeRef;
  readonly targetType: TargetTypeRef;
}

export interface CsharpTargetBindingFact extends Omit<TargetBindingFact, "members" | "typeParameters"> {
  readonly csharpType?: TargetTypeRef;
  readonly csharpBaseType?: TargetTypeRef;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
  readonly typeParameters?: readonly CsharpTargetTypeParameter[];
  readonly members?: readonly CsharpTargetMember[];
  readonly attributes?: readonly CsharpTargetAttributeFact[];
  readonly unsupportedAttributes?: readonly CsharpTargetUnsupportedAttributeFact[];
  readonly conversionOperators?: readonly CsharpTargetConversionOperatorFact[];
}

export function csharpTargetBindingFact(binding: TargetBindingFact | undefined): CsharpTargetBindingFact | undefined {
  return binding as CsharpTargetBindingFact | undefined;
}

export function csharpTargetMemberFact(member: TargetMember | undefined): CsharpTargetMember | undefined {
  return member as CsharpTargetMember | undefined;
}

export function csharpTargetMemberFacts(members: readonly TargetMember[] | undefined): readonly CsharpTargetMember[] {
  return (members ?? []) as readonly CsharpTargetMember[];
}

export interface CsharpDelegateSignatureShape {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType?: TargetTypeRef;
}

export type CsharpDelegateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpDelegateSignature: CsharpDelegateSignatureShape;
};

export type CsharpTaskTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpTaskResultType: TargetTypeRef;
};

export type CsharpRuntimeUnionTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpRuntimeUnionArms: readonly TargetTypeRef[];
};
