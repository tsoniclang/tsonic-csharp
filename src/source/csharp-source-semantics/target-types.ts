import type {
  SourcePrimitiveKind,
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";

export type CsharpTargetTypeRenderShape =
  | { readonly kind: "predefined"; readonly name: string }
  | { readonly kind: "named"; readonly namespace?: readonly string[]; readonly name: string }
  | { readonly kind: "nullable" };

export type CsharpTargetNamedTypeRef = Extract<TargetTypeRef, { readonly kind: "target-named" }> & {
  readonly csharpRender?: CsharpTargetTypeRenderShape;
};

export type CsharpTargetBindingFact = TargetBindingFact & {
  readonly csharpType?: TargetTypeRef;
  readonly csharpRender?: CsharpTargetTypeRenderShape;
};

export interface CsharpDelegateSignatureShape {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType?: TargetTypeRef;
}

export type CsharpDelegateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpDelegateSignature: CsharpDelegateSignatureShape;
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
  renderShape: CsharpTargetTypeRenderShape | undefined = knownCsharpTargetTypeRenderShape(id),
): CsharpTargetNamedTypeRef {
  return {
    kind: "target-named",
    id,
    ...(typeArguments !== undefined && typeArguments.length > 0 ? { typeArguments } : {}),
    ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
  } satisfies CsharpTargetNamedTypeRef;
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
    return {
      ...declaredType,
      ...(typeArguments.length > 0 ? { typeArguments } : {}),
    };
  }
  if (declaredType !== undefined) {
    return typeArguments.length === 0 ? declaredType : undefined;
  }
  return csharpTargetNamedType(
    binding.id,
    typeArguments,
    (binding as CsharpTargetBindingFact).csharpRender ??
      csharpTargetDisplayNameRenderShape(binding.targetName) ??
      knownCsharpTargetTypeRenderShape(binding.id),
  );
}

export function csharpRenderShapeForTargetNamedType(
  type: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
): CsharpTargetTypeRenderShape | undefined {
  return (type as CsharpTargetNamedTypeRef).csharpRender ?? knownCsharpTargetTypeRenderShape(type.id);
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
  const targetType = csharpTargetNamedType(id, typeArguments);
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

export function csharpSourcePrimitiveTargetType(kind: SourcePrimitiveKind): TargetTypeRef {
  return { kind: "source-primitive", name: kind };
}

export function csharpQualifiedTypeRenderShape(namespaceName: string, name: string): CsharpTargetTypeRenderShape {
  return {
    kind: "named",
    namespace: namespaceName.split(".").filter((part) => part.length > 0),
    name,
  };
}

function csharpTargetDisplayNameRenderShape(displayName: string): CsharpTargetTypeRenderShape | undefined {
  if (displayName.includes("`") || displayName.includes("<") || displayName.includes(">")) {
    return undefined;
  }
  const parts = displayName.split(".");
  if (parts.length === 0 || !parts.every(isCsharpIdentifierPart)) {
    return undefined;
  }
  const name = parts[parts.length - 1]!;
  const namespace = parts.slice(0, -1);
  return {
    kind: "named",
    ...(namespace.length > 0 ? { namespace } : {}),
    name,
  };
}

function isCsharpIdentifierPart(part: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(part);
}

function knownCsharpTargetTypeRenderShape(id: string): CsharpTargetTypeRenderShape | undefined {
  const predefined = predefinedRenderShapes.get(id);
  if (predefined !== undefined) {
    return predefined;
  }
  const generic = genericRenderShapes.get(id);
  if (generic !== undefined) {
    return generic;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
    return { kind: "named", name: id };
  }
  return undefined;
}

const predefinedRenderShapes = new Map<string, CsharpTargetTypeRenderShape>([
  ["System.Boolean", { kind: "predefined", name: "bool" }],
  ["System.Char", { kind: "predefined", name: "char" }],
  ["System.SByte", { kind: "predefined", name: "sbyte" }],
  ["System.Byte", { kind: "predefined", name: "byte" }],
  ["System.Int16", { kind: "predefined", name: "short" }],
  ["System.UInt16", { kind: "predefined", name: "ushort" }],
  ["System.Int32", { kind: "predefined", name: "int" }],
  ["System.UInt32", { kind: "predefined", name: "uint" }],
  ["System.Int64", { kind: "predefined", name: "long" }],
  ["System.UInt64", { kind: "predefined", name: "ulong" }],
  ["System.IntPtr", { kind: "predefined", name: "nint" }],
  ["System.UIntPtr", { kind: "predefined", name: "nuint" }],
  ["System.Half", { kind: "named", name: "Half" }],
  ["System.Single", { kind: "predefined", name: "float" }],
  ["System.Double", { kind: "predefined", name: "double" }],
  ["System.Decimal", { kind: "predefined", name: "decimal" }],
  ["System.Int128", { kind: "named", name: "Int128" }],
  ["System.UInt128", { kind: "named", name: "UInt128" }],
  ["System.String", { kind: "predefined", name: "string" }],
  ["System.Object", { kind: "predefined", name: "object" }],
  ["System.Void", { kind: "predefined", name: "void" }],
  ["System.Nullable`1", { kind: "nullable" }],
]);

const genericRenderShapes = new Map<string, CsharpTargetTypeRenderShape>([
  ["System.Numerics.BigInteger", { kind: "named", namespace: ["System", "Numerics"], name: "BigInteger" }],
  ["System.Numerics.INumber`1", { kind: "named", namespace: ["System", "Numerics"], name: "INumber" }],
  ["System.Func`1", { kind: "named", namespace: ["System"], name: "Func" }],
  ["System.Func`2", { kind: "named", namespace: ["System"], name: "Func" }],
  ["System.Func`3", { kind: "named", namespace: ["System"], name: "Func" }],
  ["System.Func`4", { kind: "named", namespace: ["System"], name: "Func" }],
  ["System.Func`5", { kind: "named", namespace: ["System"], name: "Func" }],
  ["System.Action", { kind: "named", namespace: ["System"], name: "Action" }],
  ["System.Action`1", { kind: "named", namespace: ["System"], name: "Action" }],
  ["System.Action`2", { kind: "named", namespace: ["System"], name: "Action" }],
  ["System.Action`3", { kind: "named", namespace: ["System"], name: "Action" }],
  ["System.Action`4", { kind: "named", namespace: ["System"], name: "Action" }],
  ["System.Predicate`1", { kind: "named", namespace: ["System"], name: "Predicate" }],
  ["System.Threading.Tasks.Task", { kind: "named", namespace: ["System", "Threading", "Tasks"], name: "Task" }],
  ["System.Threading.Tasks.Task`1", { kind: "named", namespace: ["System", "Threading", "Tasks"], name: "Task" }],
  ["System.Convert", { kind: "named", namespace: ["System"], name: "Convert" }],
  ["System.Math", { kind: "named", namespace: ["System"], name: "Math" }],
  ["System.Exception", { kind: "named", namespace: ["System"], name: "Exception" }],
  ["Tsonic.CSharp.Runtime.ArrayHelpers", { kind: "named", namespace: ["Tsonic", "CSharp", "Runtime"], name: "ArrayHelpers" }],
  ["Tsonic.CSharp.Js.RegExp", { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "RegExp" }],
  ["Tsonic.CSharp.Js.String", { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "String" }],
  ["Tsonic.CSharp.Node.crypto", { kind: "named", namespace: ["Tsonic", "CSharp", "Node"], name: "crypto" }],
  ["Tsonic.CSharp.Node.fs", { kind: "named", namespace: ["Tsonic", "CSharp", "Node"], name: "fs" }],
  ["Tsonic.CSharp.Node.os", { kind: "named", namespace: ["Tsonic", "CSharp", "Node"], name: "os" }],
  ["Tsonic.CSharp.Node.path", { kind: "named", namespace: ["Tsonic", "CSharp", "Node"], name: "path" }],
  ["Tsonic.CSharp.Node.process", { kind: "named", namespace: ["Tsonic", "CSharp", "Node"], name: "process" }],
]);
