import type { TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpClassDeclaration, CsharpExpression, CsharpParameter, CsharpTypeDeclaration, CsharpTypeMember, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";

interface ObjectShapeRegistry {
  readonly declarations: Map<string, CsharpClassDeclaration>;
}

const registries = new WeakMap<TargetCompileInput, ObjectShapeRegistry>();

export function beginObjectShapePlanning(input: TargetCompileInput): void {
  registries.set(input, { declarations: new Map() });
}

export function takeObjectShapeDeclarations(input: TargetCompileInput): readonly CsharpTypeDeclaration[] {
  const registry = registries.get(input);
  registries.delete(input);
  return registry === undefined ? [] : [...registry.declarations.values()];
}

export function csharpTypeFromObjectShapeFact(
  input: TargetCompileInput,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "IdentifierName") {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape fact must carry a renderable named target carrier type before C# emission."));
    }
    return undefined;
  }
  registerObjectShapeDeclaration(input, targetType.name, fact, diagnostics, diagnosticSubject);
  return targetType;
}

export function objectShapeStorageMemberName(objectShape: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): string {
  if (member.memberKind !== "method") {
    return member.targetName;
  }
  if (!objectShape.members.some((candidate) => candidate === member || candidate.sourceName === member.sourceName && candidate.targetName === member.targetName && candidate.memberKind === member.memberKind)) {
    throw new Error("Object-shape storage member must belong to its object-shape fact.");
  }
  const memberIndex = objectShape.members.findIndex((candidate) => candidate === member ||
    candidate.sourceName === member.sourceName &&
      candidate.targetName === member.targetName &&
      candidate.memberKind === member.memberKind);
  const baseName = `__tsonic_shape_method_${memberIndex}_${member.targetName}`;
  const reservedNames = new Set(objectShape.members.map((candidate) => candidate.targetName));
  let candidate = baseName;
  while (reservedNames.has(candidate)) {
    candidate = `_${candidate}`;
  }
  return candidate;
}

function registerObjectShapeDeclaration(
  input: TargetCompileInput,
  name: string,
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): void {
  const registry = registries.get(input);
  if (registry === undefined) {
    return;
  }
  const existing = registry.declarations.get(name);
  if (existing !== undefined) {
    if (!objectShapeDeclarationMatches(existing, fact)) {
      const message = `Object-shape carrier '${name}' was requested with incompatible finalized members. Structural carriers must have stable unique target identities.`;
      if (diagnostics !== undefined && diagnosticSubject !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
        return;
      }
      throw new Error(message);
    }
    return;
  }
  const interfaces = renderObjectShapeInterfaces(fact, diagnostics, diagnosticSubject);
  if (interfaces === undefined) {
    return;
  }
  const implementsInterface = interfaces.length > 0;
  const members = fact.members.flatMap((member) => {
    const type = csharpTypeFromTargetTypeRef(member.type);
    if (type === undefined) {
      if (diagnostics !== undefined && diagnosticSubject !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, `Object-shape member '${member.sourceName}' must carry a renderable target carrier type before C# emission.`));
      }
      return [undefined];
    }
    if (member.memberKind === "method") {
      return renderObjectShapeMethodMember(fact, member, type, diagnostics, diagnosticSubject);
    }
    if (implementsInterface) {
      return [{
        kind: "PropertyDeclaration" as const,
        name: member.targetName,
        modifiers: ["public"] as const,
        type,
        autoGetter: true,
        autoSetter: true,
      }];
    }
    return [{
      kind: "FieldDeclaration" as const,
      name: member.targetName,
      modifiers: ["public"] as const,
      type,
    }];
  });
  if (members.some((member) => member === undefined)) {
    return;
  }
  registry.declarations.set(name, {
    kind: "ClassDeclaration",
    name,
    modifiers: ["public"],
    ...(interfaces.length === 0 ? {} : { interfaces }),
    members: members as CsharpClassDeclaration["members"],
  });
}

function objectShapeDeclarationMatches(
  declaration: CsharpClassDeclaration,
  fact: CsharpObjectShapeFact,
): boolean {
  for (const member of fact.members) {
    if (member.memberKind === "method") {
      const storageName = objectShapeStorageMemberName(fact, member);
      if (!declaration.members.some((candidate) => candidate.kind === "FieldDeclaration" && candidate.name === storageName)) {
        return false;
      }
      if (!declaration.members.some((candidate) => candidate.kind === "MethodDeclaration" && candidate.name === member.targetName)) {
        return false;
      }
      continue;
    }
    const renderedType = csharpTypeFromTargetTypeRef(member.type);
    const declarationMember = declaration.members
      .filter(isObjectShapeStorageDeclaration)
      .find((candidate) => candidate.name === member.targetName);
    if (declarationMember === undefined || renderedType === undefined || !csharpTypeNodesMatch(declarationMember.type, renderedType)) {
      return false;
    }
  }
  return declaration.members.every((member) => {
    if (member.kind === "MethodDeclaration") {
      return fact.members.some((candidate) => candidate.memberKind === "method" && candidate.targetName === member.name);
    }
    if (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") {
      return fact.members.some((candidate) =>
        (candidate.memberKind === "method" ? objectShapeStorageMemberName(fact, candidate) : candidate.targetName) === member.name);
    }
    return true;
  });
}

function csharpTypeNodesMatch(left: CsharpTypeNode, right: CsharpTypeNode): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "PredefinedType":
      return right.kind === "PredefinedType" && left.name === right.name;
    case "InvalidType":
      return right.kind === "InvalidType" && left.reason === right.reason;
    case "IdentifierName":
      return right.kind === "IdentifierName" &&
        left.name === right.name &&
        csharpTypeNodeListsMatch(left.typeArguments ?? [], right.typeArguments ?? []);
    case "QualifiedName":
      return right.kind === "QualifiedName" &&
        left.name === right.name &&
        csharpTypeNodesMatch(left.left, right.left) &&
        csharpTypeNodeListsMatch(left.typeArguments ?? [], right.typeArguments ?? []);
    case "ArrayType":
      return right.kind === "ArrayType" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        csharpTypeNodesMatch(left.elementType, right.elementType);
    case "TupleType":
      return right.kind === "TupleType" && csharpTypeNodeListsMatch(left.elements, right.elements);
    case "NullableType":
      return right.kind === "NullableType" && csharpTypeNodesMatch(left.inner, right.inner);
    case "PointerType":
      return right.kind === "PointerType" && csharpTypeNodesMatch(left.pointee, right.pointee);
    case "FunctionPointerType":
      return right.kind === "FunctionPointerType" &&
        csharpTypeNodeListsMatch(left.parameters, right.parameters) &&
        csharpTypeNodesMatch(left.returnType, right.returnType);
  }
}

function csharpTypeNodeListsMatch(left: readonly CsharpTypeNode[], right: readonly CsharpTypeNode[]): boolean {
  return left.length === right.length &&
    left.every((item, index) => csharpTypeNodesMatch(item, right[index]!));
}

function isObjectShapeStorageDeclaration(
  member: CsharpTypeMember,
): member is Extract<CsharpTypeMember, { readonly kind: "FieldDeclaration" | "PropertyDeclaration" }> {
  return member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration";
}

function renderObjectShapeMethodMember(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  delegateType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly (CsharpTypeMember | undefined)[] {
  const signature = csharpDelegateSignatureFromTargetTypeRef(member.type);
  if (signature === undefined) {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, `Object-shape method '${member.sourceName}' must carry a Func/Action delegate target type before C# emission.`));
    }
    return [undefined];
  }
  const backingName = objectShapeStorageMemberName(objectShape, member);
  const parameters: CsharpParameter[] = signature.parameters.map((type, index) => ({
    name: `arg${index}`,
    type,
  }));
  const call: CsharpExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "IdentifierName",
      name: backingName,
    },
    arguments: parameters.map((parameter) => ({
      kind: "Argument",
      expression: {
        kind: "IdentifierName",
        name: parameter.name,
      },
    })),
  };
  return [{
    kind: "FieldDeclaration",
    name: backingName,
    modifiers: ["public"],
    type: delegateType,
  }, {
    kind: "MethodDeclaration",
    name: member.targetName,
    modifiers: ["public"],
    returnType: signature.returnType ?? { kind: "PredefinedType", name: "void" },
    parameters,
    body: {
      kind: "Block",
      statements: signature.returnType === undefined
        ? [{ kind: "ExpressionStatement", expression: call }]
        : [{ kind: "ReturnStatement", expression: call }],
    },
  }];
}

function csharpDelegateSignatureFromTargetTypeRef(type: TargetTypeRef): { readonly parameters: readonly CsharpTypeNode[]; readonly returnType?: CsharpTypeNode } | undefined {
  if (type.kind !== "target-named") {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  if (type.id.startsWith("System.Action`") || type.id === "System.Action") {
    const parameters = typeArguments.map(csharpTypeFromTargetTypeRef);
    return parameters.some((parameter) => parameter === undefined)
      ? undefined
      : { parameters: parameters as readonly CsharpTypeNode[] };
  }
  if (!type.id.startsWith("System.Func`")) {
    return undefined;
  }
  if (typeArguments.length === 0) {
    return undefined;
  }
  const parameters = typeArguments.slice(0, -1).map(csharpTypeFromTargetTypeRef);
  const returnType = csharpTypeFromTargetTypeRef(typeArguments[typeArguments.length - 1]!);
  return parameters.some((parameter) => parameter === undefined) || returnType === undefined
    ? undefined
    : { parameters: parameters as readonly CsharpTypeNode[], returnType };
}

function renderObjectShapeInterfaces(
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly CsharpTypeNode[] | undefined {
  const rendered = (fact.implements ?? []).map((contract) => csharpTypeFromTargetTypeRef(contract));
  if (rendered.some((contract) => contract === undefined)) {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape implemented contracts must carry renderable target type references before C# emission."));
    }
    return undefined;
  }
  return rendered as readonly CsharpTypeNode[];
}
