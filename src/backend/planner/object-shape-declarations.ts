import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpExpression,
  CsharpParameter,
  CsharpTypeMember,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  sameCsharpType,
} from "./csharp-types.js";
import {
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";

export function renderObjectShapeMembers(
  fact: CsharpObjectShapeFact,
  implementsInterface: boolean,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): CsharpClassDeclaration["members"] | undefined {
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
  return members.some((member) => member === undefined)
    ? undefined
    : members as CsharpClassDeclaration["members"];
}

export function objectShapeDeclarationMatches(
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
    if (declarationMember === undefined || renderedType === undefined || !sameCsharpType(declarationMember.type, renderedType)) {
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

export function renderObjectShapeInterfaces(
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
