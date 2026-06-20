import type { ObjectShapeFact, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpClassDeclaration, CsharpExpression, CsharpParameter, CsharpTypeDeclaration, CsharpTypeMember, CsharpTypeNode } from "../ast/csharp-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
  fact: ObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "named") {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape fact must carry a renderable named target carrier type before C# emission."));
    }
    return undefined;
  }
  registerObjectShapeDeclaration(input, targetType.name, fact, diagnostics, diagnosticSubject);
  return targetType;
}

export function objectShapeStorageMemberName(objectShape: ObjectShapeFact, member: ObjectShapeFact["members"][number]): string {
  if (member.memberKind !== "method") {
    return member.targetName;
  }
  const memberIndex = objectShape.members.indexOf(member);
  if (memberIndex < 0) {
    throw new Error("Object-shape storage member must belong to its object-shape fact.");
  }
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
  fact: ObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): void {
  const registry = registries.get(input);
  if (registry === undefined || registry.declarations.has(name)) {
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
        kind: "property" as const,
        name: member.targetName,
        modifiers: ["public"] as const,
        type,
        autoGetter: true,
        autoSetter: true,
      }];
    }
    return [{
      kind: "field" as const,
      name: member.targetName,
      modifiers: ["public"] as const,
      type,
    }];
  });
  if (members.some((member) => member === undefined)) {
    return;
  }
  registry.declarations.set(name, {
    kind: "class",
    name,
    modifiers: ["public"],
    ...(interfaces.length === 0 ? {} : { interfaces }),
    members: members as CsharpClassDeclaration["members"],
  });
}

function renderObjectShapeMethodMember(
  objectShape: ObjectShapeFact,
  member: ObjectShapeFact["members"][number],
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
    kind: "call",
    callee: {
      kind: "identifier",
      name: backingName,
    },
    arguments: parameters.map((parameter) => ({
      expression: {
        kind: "identifier",
        name: parameter.name,
      },
    })),
  };
  return [{
    kind: "field",
    name: backingName,
    modifiers: ["public"],
    type: delegateType,
  }, {
    kind: "method",
    name: member.targetName,
    modifiers: ["public"],
    returnType: signature.returnType ?? { kind: "predefined", name: "void" },
    parameters,
    body: {
      statements: signature.returnType === undefined
        ? [{ kind: "expression", expression: call }]
        : [{ kind: "return", expression: call }],
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
  fact: ObjectShapeFact,
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
