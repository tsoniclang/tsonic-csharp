import type {
  SourcePrimitiveKind,
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTypeofRuntimeKind,
} from "../csharp-facts.js";

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
};

export type CsharpNullableReferenceTargetTypeRef = TargetTypeRef & {
  readonly csharpNullableReference?: true;
};

export type CsharpTargetBindingFact = TargetBindingFact & {
  readonly csharpType?: TargetTypeRef;
  readonly csharpBaseType?: TargetTypeRef;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
};

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

export function targetMethod(
  id: string,
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
    readonly receiverPassing?: TargetMember["receiverPassing"];
  } = {},
): TargetMember {
  return {
    id,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.static !== undefined ? { static: options.static } : {}),
    ...(options.receiverPassing !== undefined ? { receiverPassing: options.receiverPassing } : {}),
  };
}

export function targetProperty(
  id: string,
  sourceName: string,
  targetName: string,
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
  } = {},
): TargetMember {
  return {
    id,
    sourceName,
    targetName,
    kind: "property",
    parameters: [],
    returnType,
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.static !== undefined ? { static: options.static } : {}),
  };
}

export function targetParameter(
  name: string,
  type: TargetTypeRef,
  options: { readonly optional?: boolean; readonly paramsArray?: boolean } = {},
): TargetParameter {
  return {
    name,
    type,
    passingMode: "by-value",
    ...(options.optional === true ? { optional: true } : {}),
    ...(options.paramsArray === true ? { paramsArray: true } : {}),
  };
}

export function csharpTargetNamedType(
  id: string,
  typeArguments?: readonly TargetTypeRef[],
  renderShape?: CsharpTargetTypeRenderShape,
  metadata: {
    readonly arrayLiteralElementType?: TargetTypeRef;
    readonly specialType?: CsharpTargetNamedTypeRef["csharpSpecialType"];
    readonly sourceDeclarationKind?: CsharpTargetNamedTypeRef["csharpSourceDeclarationKind"];
    readonly throwable?: true;
    readonly typeofRuntimeKind?: CsharpTypeofRuntimeKind;
    readonly valueType?: true;
  } = {},
): CsharpTargetNamedTypeRef {
  return {
    kind: "target-named",
    id,
    ...(typeArguments !== undefined && typeArguments.length > 0 ? { typeArguments } : {}),
    ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    ...(metadata.arrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: metadata.arrayLiteralElementType } : {}),
    ...(metadata.specialType !== undefined ? { csharpSpecialType: metadata.specialType } : {}),
    ...(metadata.sourceDeclarationKind !== undefined ? { csharpSourceDeclarationKind: metadata.sourceDeclarationKind } : {}),
    ...(metadata.throwable === true ? { csharpThrowable: true } : {}),
    ...(metadata.typeofRuntimeKind !== undefined ? { csharpTypeofRuntimeKind: metadata.typeofRuntimeKind } : {}),
    ...(metadata.valueType === true ? { csharpValueType: true } : {}),
  } satisfies CsharpTargetNamedTypeRef;
}

export function csharpStringTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.String", undefined, { kind: "predefined", name: "string" }, {
    specialType: "string",
    typeofRuntimeKind: "string",
  });
}

export function csharpVoidTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Void", undefined, { kind: "predefined", name: "void" }, {
    specialType: "void",
  });
}

export function csharpBooleanTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Boolean", undefined, { kind: "predefined", name: "bool" }, {
    typeofRuntimeKind: "boolean",
    valueType: true,
  });
}

export function csharpBigIntegerTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Numerics.BigInteger", undefined, csharpQualifiedTypeRenderShape("System.Numerics", "BigInteger"), {
    typeofRuntimeKind: "bigint",
    valueType: true,
  });
}

export function csharpNullableValueTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Nullable`1", [elementType], { kind: "nullable" }, {
    specialType: "nullable",
    valueType: true,
  });
}

export function csharpExceptionTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Exception", undefined, csharpQualifiedTypeRenderShape("System", "Exception"), {
    throwable: true,
  });
}

export function csharpTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[] = [],
): TargetTypeRef | undefined {
  if (binding.target !== "csharp") {
    return undefined;
  }
  const declaredType = (binding as CsharpTargetBindingFact).csharpType;
  if (declaredType?.kind === "target-named") {
    const renderShape = (declaredType as CsharpTargetNamedTypeRef).csharpRender;
    const withArguments = {
      ...declaredType,
      ...(typeArguments.length > 0 ? { typeArguments } : {}),
      ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    };
    return typeArguments.length === 0
      ? withArguments
      : substituteTargetTypeParameters(withArguments, targetBindingTypeArgumentMap(binding, typeArguments));
  }
  if (declaredType !== undefined) {
    return typeArguments.length === 0
      ? declaredType
      : substituteTargetTypeParameters(declaredType, targetBindingTypeArgumentMap(binding, typeArguments));
  }
  const renderShape = (binding as CsharpTargetBindingFact).csharpRender;
  return renderShape === undefined
    ? undefined
    : csharpTargetNamedType(binding.id, typeArguments, renderShape);
}

function targetBindingTypeArgumentMap(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  const substitutions = new Map<string, TargetTypeRef>();
  const typeParameters = binding.typeParameters ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  return substitutions;
}

export function csharpBaseTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[] = [],
): TargetTypeRef | undefined {
  const baseType = (binding as CsharpTargetBindingFact).csharpBaseType;
  if (baseType === undefined) {
    return undefined;
  }
  return substituteTargetTypeParameters(
    baseType,
    new Map((binding.typeParameters ?? [])
      .map((parameter, index) => {
        const typeArgument = typeArguments[index];
        return typeArgument === undefined ? undefined : [parameter.name, typeArgument] as const;
      })
      .filter((entry): entry is readonly [string, TargetTypeRef] => entry !== undefined)),
  );
}

export function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      const arrayLiteralElementType = (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType;
      const taskResultType = (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType;
      const runtimeUnionArms = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms;
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }),
        ...(arrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeParameters(arrayLiteralElementType, substitutions) }),
        ...(taskResultType === undefined
          ? {}
          : { csharpTaskResultType: substituteTargetTypeParameters(taskResultType, substitutions) }),
        ...(runtimeUnionArms === undefined
          ? {}
          : { csharpRuntimeUnionArms: runtimeUnionArms.map((arm) => substituteTargetTypeParameters(arm, substitutions)) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameters(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameters(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameters(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameters(argument, substitutions)),
        result: substituteTargetTypeParameters(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameters(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

export function csharpRenderShapeForTargetNamedType(
  type: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
): CsharpTargetTypeRenderShape | undefined {
  return (type as CsharpTargetNamedTypeRef).csharpRender;
}

export function csharpDelegateTargetType(
  kind: "System.Action" | "System.Func",
  parameters: readonly TargetTypeRef[],
  returnType?: TargetTypeRef,
): CsharpDelegateTargetTypeRef {
  const typeArguments = returnType === undefined
    ? parameters
    : [...parameters, returnType];
  const id = kind === "System.Action"
    ? parameters.length === 0 ? "System.Action" : `System.Action\`${parameters.length}`
    : `System.Func\`${parameters.length + 1}`;
  const targetType = csharpTargetNamedType(id, typeArguments, { kind: "named", name: kind === "System.Action" ? "Action" : "Func" });
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpDelegateSignature: {
      parameters,
      ...(returnType !== undefined ? { returnType } : {}),
    },
  } satisfies CsharpDelegateTargetTypeRef;
}

export function csharpTaskTargetType(resultType: TargetTypeRef): CsharpTaskTargetTypeRef {
  const targetType = isCsharpVoidTargetType(resultType)
    ? csharpTargetNamedType("System.Threading.Tasks.Task", undefined, csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"))
    : csharpTargetNamedType("System.Threading.Tasks.Task`1", [resultType], csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"));
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpTaskResultType: resultType,
  } satisfies CsharpTaskTargetTypeRef;
}

export function csharpEnumerableTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.IEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IEnumerable"),
    { arrayLiteralElementType: elementType },
  );
}

export function csharpReadOnlyListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.IReadOnlyList`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IReadOnlyList"),
    { arrayLiteralElementType: elementType },
  );
}

export function csharpListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.List`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "List"),
    { arrayLiteralElementType: elementType },
  );
}

export function getCsharpCollectionElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type.element;
  }
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const id = type.id;
  if (
    id !== "System.Collections.Generic.IEnumerable`1" &&
    id !== "System.Collections.Generic.IReadOnlyList`1" &&
    id !== "System.Collections.Generic.IList`1" &&
    id !== "System.Collections.Generic.List`1"
  ) {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  return typeArguments.length === 1 ? typeArguments[0] : undefined;
}

export function isCsharpReadOnlyIndexableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "array" ||
    (type?.kind === "target-named" &&
      (
        type.id === "System.Collections.Generic.IReadOnlyList`1" ||
        type.id === "System.Collections.Generic.IList`1" ||
        type.id === "System.Collections.Generic.List`1"
      ));
}

export function isCsharpDenseMutableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type.id === "System.Collections.Generic.List`1" || type.id === "System.Collections.Generic.IList`1");
}

export function getCsharpTaskResultTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType
    : undefined;
}

export function csharpSourcePrimitiveTargetType(kind: SourcePrimitiveKind): TargetTypeRef {
  return { kind: "source-primitive", name: kind };
}

export function csharpAnyRuntimeCarrier(): TargetTypeRef {
  return { kind: "opaque", id: "any" };
}

export function csharpRuntimeUnionTargetType(arms: readonly TargetTypeRef[]): CsharpRuntimeUnionTargetTypeRef | undefined {
  if (arms.length < 2 || arms.length > 8) {
    return undefined;
  }
  const targetType = csharpTargetNamedType(
    `Tsonic.CSharp.Runtime.Union\`${arms.length}`,
    arms,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Union"),
  );
  return {
    kind: "target-named",
    id: targetType.id,
    typeArguments: arms,
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpRuntimeUnionArms: arms,
  } satisfies CsharpRuntimeUnionTargetTypeRef;
}

export function isCsharpAnyRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "opaque" && type.id === "any";
}

export function isCsharpClosedCompatRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (
      type.id === "Tsonic.CSharp.Js.TsValue" ||
      type.id === "Tsonic.CSharp.Js.TsObject" ||
      type.id === "Tsonic.CSharp.Js.TsArray" ||
      type.id === "Tsonic.CSharp.Js.TsFunction"
    );
}

export function isCsharpRuntimeUnionTargetType(type: TargetTypeRef | undefined): type is CsharpRuntimeUnionTargetTypeRef {
  return type?.kind === "target-named" &&
    typeof type.id === "string" &&
    type.id.startsWith("Tsonic.CSharp.Runtime.Union`") &&
    Array.isArray((type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms);
}

export function getCsharpRuntimeUnionArms(type: TargetTypeRef | undefined): readonly TargetTypeRef[] | undefined {
  return isCsharpRuntimeUnionTargetType(type)
    ? type.csharpRuntimeUnionArms
    : undefined;
}

export function isCsharpThrowableTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpThrowable === true;
}

export function getCsharpTypeofRuntimeKindForTargetType(type: TargetTypeRef | undefined): CsharpTypeofRuntimeKind | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpTypeofRuntimeKind
    : undefined;
}

export function isCsharpStringTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpSpecialType === "string";
}

export function isCsharpVoidTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpSpecialType === "void";
}

export function getCsharpNullableElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (isCsharpNullableReferenceTargetType(type)) {
    return withoutCsharpNullableReference(type);
  }
  if (type?.kind !== "target-named" || (type as CsharpTargetNamedTypeRef).csharpSpecialType !== "nullable") {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  return typeArguments.length === 1 ? typeArguments[0] : undefined;
}

export function csharpNullableTargetType(type: TargetTypeRef): TargetTypeRef {
  if (getCsharpNullableElementTargetType(type) !== undefined) {
    return type;
  }
  if (isCsharpValueTypeTargetType(type)) {
    return csharpNullableValueTargetType(type);
  }
  const nullableReference: CsharpNullableReferenceTargetTypeRef = {
    ...type,
    csharpNullableReference: true,
  };
  return nullableReference;
}

export function isCsharpNullableReferenceTargetType(type: TargetTypeRef | undefined): type is CsharpNullableReferenceTargetTypeRef {
  return (type as { readonly csharpNullableReference?: unknown } | undefined)?.csharpNullableReference === true;
}

export function withoutCsharpNullableReference(type: CsharpNullableReferenceTargetTypeRef): TargetTypeRef {
  const { csharpNullableReference: _csharpNullableReference, ...baseType } = type;
  return baseType;
}

export function isCsharpValueTypeTargetType(type: TargetTypeRef): boolean {
  if (type.kind === "source-primitive" || type.kind === "pointer" || type.kind === "function-pointer" || type.kind === "tuple") {
    return true;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  const csharpType = type as CsharpTargetNamedTypeRef;
  return csharpType.csharpSpecialType === "nullable" ||
    csharpType.csharpValueType === true ||
    csharpType.csharpSourceDeclarationKind === "enum" ||
    csharpType.csharpSourceDeclarationKind === "struct";
}

export function getCsharpArrayLiteralElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType
    : undefined;
}

export function csharpQualifiedTypeRenderShape(namespaceName: string, name: string): CsharpTargetTypeRenderShape {
  return {
    kind: "named",
    namespace: namespaceName.split(".").filter((part) => part.length > 0),
    name,
  };
}
