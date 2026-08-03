import type {
  TargetArtifactDependency,
} from "@tsonic/target-api";
import type {
  CsharpArtifactContractCandidate,
  CsharpArtifactFacet,
} from "../../translate/artifacts/index.js";
import type {
  CsharpCompilationUnit,
  CsharpEnumMember,
  CsharpInterfaceMember,
  CsharpMember,
  CsharpModifier,
  CsharpNamespace,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";

export type CsharpSourceFileContractResult =
  | {
      readonly kind: "resolved";
      readonly candidate: CsharpArtifactContractCandidate;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

const maximumCanonicalDepth = 512;
const maximumCanonicalEntries = 1_048_576;
const maximumCanonicalCodeUnits = 4_194_304;

export function csharpSourceFileContractCandidate(
  owner: string,
  unit: CsharpCompilationUnit | undefined,
  dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[],
): CsharpSourceFileContractResult {
  const publicSurface = encodeCanonicalCsharpValue(
    unit === undefined ? absentSourceFileSurface : publicCompilationUnit(unit),
  );
  if (publicSurface.kind === "rejected") {
    return publicSurface;
  }
  const implementation = encodeCanonicalCsharpValue(
    unit ?? absentSourceFileSurface,
  );
  if (implementation.kind === "rejected") {
    return implementation;
  }
  return {
    kind: "resolved",
    candidate: {
      owner,
      contract: {
        facets: [
          {
            facet: "source-file-implementation",
            value: implementation.value,
          },
          {
            facet: "source-file-public-surface",
            value: publicSurface.value,
          },
        ],
      },
      dependencies,
    },
  };
}

const absentSourceFileSurface = Object.freeze({
  kind: "AbsentCsharpSourceFile",
});

function publicCompilationUnit(
  unit: CsharpCompilationUnit,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: unit.kind,
    members: Object.freeze(unit.members.map(publicMember)),
  });
}

function publicMember(member: CsharpMember): Readonly<Record<string, unknown>> {
  switch (member.kind) {
    case "NamespaceDeclaration":
      return publicNamespace(member);
    case "ClassDeclaration":
    case "StructDeclaration":
    case "InterfaceDeclaration":
    case "EnumDeclaration":
      return publicTypeDeclaration(member);
  }
}

function publicNamespace(
  namespace: CsharpNamespace,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: namespace.kind,
    name: namespace.name,
    members: Object.freeze(namespace.members.map(publicTypeDeclaration)),
  });
}

function publicTypeDeclaration(
  declaration: CsharpTypeDeclaration,
): Readonly<Record<string, unknown>> {
  const common = {
    kind: declaration.kind,
    name: declaration.name,
    modifiers: publicModifiers(declaration.modifiers),
    attributes: declaration.attributes,
  };
  switch (declaration.kind) {
    case "ClassDeclaration":
      return Object.freeze({
        ...common,
        typeParameters: declaration.typeParameters,
        baseType: declaration.baseType,
        interfaces: declaration.interfaces,
        members: Object.freeze(
          declaration.members.flatMap(publicTypeMember),
        ),
      });
    case "StructDeclaration":
      return Object.freeze({
        ...common,
        typeParameters: declaration.typeParameters,
        interfaces: declaration.interfaces,
        members: Object.freeze(
          declaration.members.flatMap(publicTypeMember),
        ),
      });
    case "InterfaceDeclaration":
      return Object.freeze({
        ...common,
        typeParameters: declaration.typeParameters,
        interfaces: declaration.interfaces,
        members: Object.freeze(
          declaration.members.map(publicInterfaceMember),
        ),
      });
    case "EnumDeclaration":
      return Object.freeze({
        ...common,
        members: Object.freeze(declaration.members.map(publicEnumMember)),
      });
  }
}

function publicTypeMember(
  member: CsharpTypeMember,
): readonly Readonly<Record<string, unknown>>[] {
  if (
    member.kind === "StaticConstructorDeclaration" ||
    !hasExternallyVisibleAccessibility(member.modifiers)
  ) {
    return Object.freeze([]);
  }
  switch (member.kind) {
    case "ConstructorDeclaration":
      return [Object.freeze({
        kind: member.kind,
        name: member.name,
        modifiers: publicModifiers(member.modifiers),
        attributes: member.attributes,
        parameters: member.parameters,
      })];
    case "MethodDeclaration":
      return [Object.freeze({
        kind: member.kind,
        name: member.name,
        modifiers: publicModifiers(member.modifiers),
        attributes: member.attributes,
        typeParameters: member.typeParameters,
        returnType: member.returnType,
        parameters: member.parameters,
      })];
    case "FieldDeclaration":
      return [Object.freeze({
        kind: member.kind,
        name: member.name,
        modifiers: publicModifiers(member.modifiers),
        attributes: member.attributes,
        type: member.type,
      })];
    case "PropertyDeclaration":
      return [Object.freeze({
        kind: member.kind,
        name: member.name,
        modifiers: publicModifiers(member.modifiers),
        attributes: member.attributes,
        type: member.type,
        getter: member.autoGetter === true || member.getter !== undefined,
        setter: member.autoSetter === true || member.setter !== undefined,
        setterModifiers: member.autoSetterModifiers,
      })];
  }
}

function publicInterfaceMember(
  member: CsharpInterfaceMember,
): Readonly<Record<string, unknown>> {
  switch (member.kind) {
    case "MethodDeclaration":
      return Object.freeze({
        kind: member.kind,
        name: member.name,
        attributes: member.attributes,
        typeParameters: member.typeParameters,
        returnType: member.returnType,
        parameters: member.parameters,
      });
    case "PropertyDeclaration":
      return Object.freeze({
        kind: member.kind,
        name: member.name,
        attributes: member.attributes,
        type: member.type,
      });
    case "IndexerDeclaration":
      return Object.freeze({
        kind: member.kind,
        attributes: member.attributes,
        keyName: member.keyName,
        keyType: member.keyType,
        valueType: member.valueType,
      });
  }
}

function publicEnumMember(
  member: CsharpEnumMember,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    kind: member.kind,
    name: member.name,
    value: member.value,
  });
}

function hasExternallyVisibleAccessibility(
  modifiers: readonly CsharpModifier[],
): boolean {
  return modifiers.includes("public") || modifiers.includes("internal");
}

function publicModifiers(
  modifiers: readonly CsharpModifier[],
): readonly CsharpModifier[] {
  return Object.freeze(modifiers.filter((modifier) => modifier !== "async"));
}

type CanonicalCsharpValueResult =
  | { readonly kind: "resolved"; readonly value: string }
  | { readonly kind: "rejected"; readonly reason: string };

interface CanonicalCsharpValueState {
  readonly active: WeakSet<object>;
  entryCount: number;
  codeUnits: number;
  reason?: string;
}

function encodeCanonicalCsharpValue(
  value: unknown,
): CanonicalCsharpValueResult {
  const state: CanonicalCsharpValueState = {
    active: new WeakSet(),
    entryCount: 0,
    codeUnits: 0,
  };
  const encoded = encodeCanonicalValue(value, state, 0);
  return encoded === undefined
    ? {
        kind: "rejected",
        reason: state.reason ??
          "C# target artifact contract could not be encoded canonically.",
      }
    : { kind: "resolved", value: encoded };
}

function encodeCanonicalValue(
  value: unknown,
  state: CanonicalCsharpValueState,
  depth: number,
): string | undefined {
  if (depth > maximumCanonicalDepth) {
    state.reason =
      `C# target artifact contract exceeds its finite ${maximumCanonicalDepth}-level canonical depth budget.`;
    return undefined;
  }
  state.entryCount += 1;
  if (state.entryCount > maximumCanonicalEntries) {
    state.reason =
      `C# target artifact contract exceeds its finite ${maximumCanonicalEntries}-entry canonical size budget.`;
    return undefined;
  }
  if (value === null) {
    return reserveCanonicalToken("n", state);
  }
  switch (typeof value) {
    case "string":
      return reserveCanonicalToken(`s${value.length}:${value}`, state);
    case "boolean":
      return reserveCanonicalToken(value ? "b1" : "b0", state);
    case "number": {
      if (!Number.isFinite(value)) {
        state.reason = "C# target artifact contract contains a non-finite number.";
        return undefined;
      }
      const text = Object.is(value, -0) ? "-0" : String(value);
      return reserveCanonicalToken(`d${text.length}:${text}`, state);
    }
    case "object":
      return encodeCanonicalObject(value, state, depth);
    default:
      state.reason =
        `C# target artifact contract contains unsupported '${typeof value}' data.`;
      return undefined;
  }
}

function encodeCanonicalObject(
  value: object,
  state: CanonicalCsharpValueState,
  depth: number,
): string | undefined {
  if (state.active.has(value)) {
    state.reason = "C# target artifact contract contains a cyclic target AST value.";
    return undefined;
  }
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const elements: string[] = [];
      for (const element of value) {
        const encoded = encodeCanonicalValue(element, state, depth + 1);
        if (encoded === undefined) {
          return undefined;
        }
        elements.push(encoded);
      }
      const prefix = reserveCanonicalToken(`a${elements.length}:`, state);
      return prefix === undefined ? undefined : `${prefix}${elements.join("")}`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      state.reason =
        "C# target artifact contract contains a non-record target AST value.";
      return undefined;
    }
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    const encodedFields: string[] = [];
    for (const [name, field] of fields) {
      const encoded = encodeCanonicalValue(field, state, depth + 1);
      if (encoded === undefined) {
        return undefined;
      }
      const key = reserveCanonicalToken(`k${name.length}:${name}`, state);
      if (key === undefined) {
        return undefined;
      }
      encodedFields.push(`${key}${encoded}`);
    }
    const prefix = reserveCanonicalToken(`o${encodedFields.length}:`, state);
    return prefix === undefined
      ? undefined
      : `${prefix}${encodedFields.join("")}`;
  } finally {
    state.active.delete(value);
  }
}

function reserveCanonicalToken(
  token: string,
  state: CanonicalCsharpValueState,
): string | undefined {
  const nextCodeUnits = state.codeUnits + token.length;
  if (
    !Number.isSafeInteger(nextCodeUnits) ||
    nextCodeUnits > maximumCanonicalCodeUnits
  ) {
    state.reason =
      `C# target artifact contract exceeds its finite ${maximumCanonicalCodeUnits}-code-unit canonical value budget.`;
    return undefined;
  }
  state.codeUnits = nextCodeUnits;
  return token;
}
