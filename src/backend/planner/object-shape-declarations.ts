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
  CsharpTypeParameter,
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
import {
  tryCsharpIdentifier,
} from "./identifiers.js";

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
  const typeParameters = renderObjectShapeTypeParameters(fact, undefined, undefined);
  if (typeParameters === undefined || !objectShapeTypeParametersMatch(declaration.typeParameters, typeParameters)) {
    return false;
  }
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

export function renderObjectShapeTypeParameters(
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly CsharpTypeParameter[] | undefined {
  if (fact.targetType.kind !== "target-named") {
    return [];
  }
  const declaredTypeParameters: CsharpTypeParameter[] = [];
  const declaredNames = new Set<string>();
  for (const typeArgument of fact.targetType.typeArguments ?? []) {
    if (typeArgument.kind !== "type-parameter") {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' may only declare type-parameter target arguments.`,
      );
      return undefined;
    }
    const name = tryCsharpIdentifier(typeArgument.name);
    if (name === undefined) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' type parameter '${typeArgument.name}' must be a valid C# identifier.`,
      );
      return undefined;
    }
    if (!declaredNames.has(typeArgument.name)) {
      declaredNames.add(typeArgument.name);
      declaredTypeParameters.push({ name });
    }
  }
  const usedTypeParameters = collectObjectShapeTypeParameterNames(fact);
  for (const usedName of usedTypeParameters) {
    if (!declaredNames.has(usedName)) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' uses type parameter '${usedName}' without declaring it in the finalized target carrier type.`,
      );
      return undefined;
    }
  }
  return declaredTypeParameters;
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

function objectShapeTypeParametersMatch(
  actual: readonly CsharpTypeParameter[] | undefined,
  expected: readonly CsharpTypeParameter[],
): boolean {
  const actualParameters = actual ?? [];
  return actualParameters.length === expected.length &&
    actualParameters.every((parameter, index) => parameter.name === expected[index]?.name);
}

function pushObjectShapeDeclarationDiagnostic(
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
  message: string,
): void {
  if (diagnostics !== undefined && diagnosticSubject !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
  }
}

function collectObjectShapeTypeParameterNames(
  fact: CsharpObjectShapeFact,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const member of fact.members) {
    collectTargetTypeParameterNames(member.type, names);
  }
  for (const implementedType of fact.implements ?? []) {
    collectTargetTypeParameterNames(implementedType, names);
  }
  return names;
}

function collectTargetTypeParameterNames(
  type: TargetTypeRef,
  names: Set<string>,
): void {
  switch (type.kind) {
    case "type-parameter":
      names.add(type.name);
      return;
    case "target-named":
      for (const typeArgument of type.typeArguments ?? []) {
        collectTargetTypeParameterNames(typeArgument, names);
      }
      return;
    case "array":
      collectTargetTypeParameterNames(type.element, names);
      return;
    case "tuple":
      for (const element of type.elements) {
        collectTargetTypeParameterNames(element, names);
      }
      return;
    case "pointer":
      collectTargetTypeParameterNames(type.pointee, names);
      return;
    case "function-pointer":
      for (const argument of type.args) {
        collectTargetTypeParameterNames(argument, names);
      }
      collectTargetTypeParameterNames(type.result, names);
      return;
    case "associated-type":
      collectTargetTypeParameterNames(type.owner, names);
      return;
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return;
  }
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

interface CsharpDelegateSignatureMetadata {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType?: TargetTypeRef;
}

function csharpDelegateSignatureFromTargetTypeRef(type: TargetTypeRef): { readonly parameters: readonly CsharpTypeNode[]; readonly returnType?: CsharpTypeNode } | undefined {
  const metadata = (type as { readonly csharpDelegateSignature?: CsharpDelegateSignatureMetadata }).csharpDelegateSignature;
  if (metadata === undefined) {
    return undefined;
  }
  const parameters = metadata.parameters.map(csharpTypeFromTargetTypeRef);
  const returnType = metadata.returnType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(metadata.returnType);
  return parameters.some((parameter) => parameter === undefined) || (metadata.returnType !== undefined && returnType === undefined)
    ? undefined
    : {
        parameters: parameters as readonly CsharpTypeNode[],
        ...(returnType !== undefined ? { returnType } : {}),
      };
}
