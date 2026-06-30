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
} from "../../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  objectShapeStorageMemberName,
} from "../object-shape-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  isCsharpVoidTargetType,
} from "../../../source/csharp-source-semantics/target-types.js";

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
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, `Object-shape method '${member.sourceName}' must carry a Func/Action delegate target type with explicit return facts before C# emission.`));
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
    returnType: signature.returnType,
    parameters,
    body: {
      kind: "Block",
      statements: signature.returnsVoid
        ? [{ kind: "ExpressionStatement", expression: call }]
        : [{ kind: "ReturnStatement", expression: call }],
    },
  }];
}

interface CsharpDelegateSignatureMetadata {
  readonly parameters: readonly TargetTypeRef[];
  readonly returnType?: TargetTypeRef;
}

function csharpDelegateSignatureFromTargetTypeRef(type: TargetTypeRef): { readonly parameters: readonly CsharpTypeNode[]; readonly returnType: CsharpTypeNode; readonly returnsVoid: boolean } | undefined {
  const metadata = (type as { readonly csharpDelegateSignature?: CsharpDelegateSignatureMetadata }).csharpDelegateSignature;
  if (metadata?.returnType === undefined) {
    return undefined;
  }
  const parameters = metadata.parameters.map(csharpTypeFromTargetTypeRef);
  const returnType = csharpTypeFromTargetTypeRef(metadata.returnType);
  return parameters.some((parameter) => parameter === undefined) || returnType === undefined
    ? undefined
    : {
        parameters: parameters as readonly CsharpTypeNode[],
        returnType,
        returnsVoid: isCsharpVoidTargetType(metadata.returnType),
      };
}
