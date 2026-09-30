import type { CsharpPlanningContext } from "../context.js";
import type { CsharpOutputSourceFile } from "../../artifact-model/output.js";
import type { CsharpExpression, CsharpStructDeclaration, CsharpTypeMember, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRuntimeUnionTargetType } from "../../../target-model/types/runtime-carriers.js";
import { finalizeCsharpCompilationUnit } from "../program/compilation-unit.js";
import { readNamespace } from "../project/project-artifacts.js";

export function planCsharpSourceUnionFile(input: CsharpPlanningContext):
  { readonly source: CsharpOutputSourceFile; readonly requiresUnsafe: boolean } | undefined {
  const declarations: CsharpStructDeclaration[] = [];
  for (const definition of input.program.typeDefinitions.sourceUnions()) {
    const parameters = definition.carrier.typeArguments ?? [];
    if (parameters.some(parameter => parameter.kind !== "type-parameter")) {
      throw new Error("C# source union declarations require their exact generic template.");
    }
    const names = new Map(parameters.flatMap(parameter => parameter.kind === "type-parameter" ? [[parameter.identity, parameter.name] as const] : []));
    const type = csharpTypeFromTargetTypeRef(definition.carrier, names);
    const single = definition.arms.length === 1;
    const storage = single ? definition.arms[0] : csharpRuntimeUnionTargetType(definition.arms);
    const storageType = storage === undefined ? undefined : csharpTypeFromTargetTypeRef(storage, names);
    if (type?.kind !== "IdentifierName" || storageType === undefined) throw new Error("C# source union has no closed native storage type.");
    const receiver: CsharpExpression = { kind: "IdentifierName", name: "value" };
    const members: CsharpTypeMember[] = [
      { kind: "FieldDeclaration", modifiers: ["private", "readonly"], name: "value", type: storageType },
      { kind: "ConstructorDeclaration", modifiers: ["private"], name: type.name,
        parameters: [{ name: "storage", type: storageType }],
        body: { kind: "Block", statements: [{ kind: "ExpressionStatement", expression: {
          kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
          left: receiver, right: { kind: "IdentifierName", name: "storage" },
        } }] } },
    ];
    for (const [index, arm] of definition.arms.entries()) {
      const armType = csharpTypeFromTargetTypeRef(arm, names);
      if (armType === undefined) throw new Error("C# source union arm has no closed native type.");
      const suffix = index + 1;
      const storedValue: CsharpExpression = single ? receiver : {
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: storageType, name: `From${suffix}` },
        arguments: [{ kind: "Argument", expression: receiver }],
      };
      members.push({ kind: "MethodDeclaration", modifiers: ["public", "static"], name: `From${suffix}`, returnType: type,
        parameters: [{ name: "value", type: armType }], body: { kind: "Block", statements: [{ kind: "ReturnStatement",
          expression: { kind: "ObjectCreationExpression", type, arguments: [{ kind: "Argument", expression: storedValue }] },
        }] } });
      for (const operation of ["Is", "As"] as const) members.push({
        kind: "MethodDeclaration", modifiers: ["public"], name: `${operation}${suffix}`,
        returnType: operation === "Is" ? { kind: "PredefinedType", name: "bool" } : armType,
        parameters: [], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: single
          ? operation === "Is" ? { kind: "LiteralExpression", value: true } : receiver : {
          kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name: `${operation}${suffix}` }, arguments: [],
        } }] },
      });
    }
    let resultName = "TResult";
    while ([...names.values()].includes(resultName)) resultName = `_${resultName}`;
    const resultType: CsharpTypeNode = { kind: "IdentifierName", name: resultName };
    members.push({ kind: "MethodDeclaration", modifiers: ["public"], name: "AsReference", returnType: resultType,
      typeParameters: [{ name: resultName, constraints: [{ kind: "KeywordConstraint", keyword: "class" }] }],
      parameters: [], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: single ? {
        kind: "CastExpression", type: resultType, expression: { kind: "CastExpression", type: { kind: "PredefinedType", name: "object" }, expression: receiver },
      } : { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name: "AsReference", typeArguments: [resultType] }, arguments: [] } }] },
    });
    const comparer: CsharpExpression = { kind: "SimpleMemberAccessExpression", name: "Default",
      receiver: { kind: "IdentifierName", name: "System.Collections.Generic.EqualityComparer", typeArguments: [storageType] } };
    const otherValue: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "other" }, name: "value" };
    members.push({ kind: "MethodDeclaration", modifiers: ["public"], name: "Equals", returnType: { kind: "PredefinedType", name: "bool" },
      parameters: [{ name: "other", type }], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: {
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: comparer, name: "Equals" },
        arguments: [{ kind: "Argument", expression: receiver }, { kind: "Argument", expression: otherValue }],
      } }] } }, { kind: "MethodDeclaration", modifiers: ["public", "override"], name: "GetHashCode", returnType: { kind: "PredefinedType", name: "int" },
      parameters: [], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: {
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: comparer, name: "GetHashCode" },
        arguments: [{ kind: "Argument", expression: receiver }],
      } }] } });
    declarations.push({ kind: "StructDeclaration", name: type.name, modifiers: ["public", "readonly"], members,
      typeParameters: parameters.flatMap(parameter => parameter.kind === "type-parameter" ? [{ name: parameter.name }] : []),
      interfaces: [{ kind: "IdentifierName", name: "System.IEquatable", typeArguments: [type] }],
    });
  }
  if (declarations.length === 0) return undefined;
  const finalized = finalizeCsharpCompilationUnit({ kind: "CompilationUnit", usings: [],
    members: [{ kind: "NamespaceDeclaration", name: readNamespace(input), members: declarations }],
  }, input.program.configuration.languageDialect);
  return { source: { path: "generated/TsonicSourceUnions.cs", unit: finalized.unit }, requiresUnsafe: finalized.requiresUnsafe };
}
