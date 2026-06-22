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
    ...(knownCsharpThrowableTypeIds.has(id) ? { csharpThrowable: true } : {}),
    ...knownCsharpSpecialType(id),
    ...knownCsharpTypeofRuntimeKind(id),
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
    const renderShape = knownCsharpTargetTypeRenderShape(declaredType.id) ??
      (declaredType as CsharpTargetNamedTypeRef).csharpRender;
    return {
      ...declaredType,
      ...(typeArguments.length > 0 ? { typeArguments } : {}),
      ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    };
  }
  if (declaredType !== undefined) {
    return typeArguments.length === 0 ? declaredType : undefined;
  }
  const renderShape = knownCsharpTargetTypeRenderShape(binding.id) ??
    (binding as CsharpTargetBindingFact).csharpRender;
  const known = csharpTargetNamedType(binding.id, typeArguments, renderShape);
  if (csharpRenderShapeForTargetNamedType(known) !== undefined) {
    return known;
  }
  const providerRenderShape = csharpRenderShapeFromProviderTargetName(binding.targetName);
  return providerRenderShape === undefined
    ? undefined
    : csharpTargetNamedType(binding.id, typeArguments, providerRenderShape);
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

function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }),
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
  if (type?.kind !== "target-named" || (type as CsharpTargetNamedTypeRef).csharpSpecialType !== "nullable") {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  return typeArguments.length === 1 ? typeArguments[0] : undefined;
}

export function getCsharpArrayLiteralElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (
    type?.kind !== "target-named" ||
    !knownCsharpArrayLiteralAssignableTargetIds.has(type.id) ||
    (type as CsharpTargetNamedTypeRef).csharpRender === undefined
  ) {
    return undefined;
  }
  return type.typeArguments?.[0];
}

export function csharpQualifiedTypeRenderShape(namespaceName: string, name: string): CsharpTargetTypeRenderShape {
  return {
    kind: "named",
    namespace: namespaceName.split(".").filter((part) => part.length > 0),
    name,
  };
}

function csharpRenderShapeFromProviderTargetName(targetName: string): CsharpTargetTypeRenderShape | undefined {
  const lastSeparator = targetName.lastIndexOf(".");
  const name = stripCsharpGenericArity(lastSeparator < 0 ? targetName : targetName.slice(lastSeparator + 1));
  if (name.length === 0) {
    return undefined;
  }
  return lastSeparator < 0
    ? { kind: "named", name }
    : csharpQualifiedTypeRenderShape(targetName.slice(0, lastSeparator), name);
}

function stripCsharpGenericArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
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
  ["System.Func`1", { kind: "named", name: "Func" }],
  ["System.Func`2", { kind: "named", name: "Func" }],
  ["System.Func`3", { kind: "named", name: "Func" }],
  ["System.Func`4", { kind: "named", name: "Func" }],
  ["System.Func`5", { kind: "named", name: "Func" }],
  ["System.Action", { kind: "named", name: "Action" }],
  ["System.Action`1", { kind: "named", name: "Action" }],
  ["System.Action`2", { kind: "named", name: "Action" }],
  ["System.Action`3", { kind: "named", name: "Action" }],
  ["System.Action`4", { kind: "named", name: "Action" }],
  ["System.Predicate`1", { kind: "named", name: "Predicate" }],
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

const knownCsharpThrowableTypeIds = new Set<string>([
  "System.Exception",
]);

function knownCsharpTypeofRuntimeKind(id: string): { readonly csharpTypeofRuntimeKind: CsharpTypeofRuntimeKind } | {} {
  switch (id) {
    case "System.String":
      return { csharpTypeofRuntimeKind: "string" };
    case "System.Boolean":
      return { csharpTypeofRuntimeKind: "boolean" };
    case "System.Numerics.BigInteger":
      return { csharpTypeofRuntimeKind: "bigint" };
    default:
      return {};
  }
}

function knownCsharpSpecialType(id: string): { readonly csharpSpecialType: CsharpTargetNamedTypeRef["csharpSpecialType"] } | {} {
  switch (id) {
    case "System.String":
      return { csharpSpecialType: "string" };
    case "System.Void":
      return { csharpSpecialType: "void" };
    case "System.Nullable`1":
      return { csharpSpecialType: "nullable" };
    default:
      return {};
  }
}

const knownCsharpArrayLiteralAssignableTargetIds = new Set<string>([
  "System.Collections.Generic.IEnumerable`1",
  "System.Collections.Generic.IReadOnlyCollection`1",
  "System.Collections.Generic.IReadOnlyList`1",
  "System.Collections.Generic.ICollection`1",
  "System.Collections.Generic.IList`1",
  "System.Collections.Generic.List`1",
]);
