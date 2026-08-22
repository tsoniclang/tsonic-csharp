import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpClassDeclaration,
  CsharpExpression,
  CsharpParameter,
  CsharpTypeMember,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
  objectShapeMethodStorageTargetType,
  objectShapeStorageMemberName,
} from "../object-shape-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  canonicalCsharpObjectShapeMembers,
  csharpObjectShapeMemberContractKey,
  csharpDelegateTargetType,
  isCsharpVoidTargetType,
} from "../../../../target-model/types/index.js";

export function renderObjectShapeMembers(
  fact: CsharpObjectShapeFact,
  implementsInterface: boolean,
  receiverBoundMethodKeys: ReadonlySet<string>,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): CsharpClassDeclaration["members"] | undefined {
  const members = canonicalCsharpObjectShapeMembers(fact.members).flatMap((member) => {
    const type = csharpTypeFromTargetTypeRef(member.type);
    if (type === undefined) {
      if (diagnostics !== undefined && diagnosticSubject !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, `Object-shape member '${member.sourceName}' must carry a renderable target carrier type before C# emission.`));
      }
      return [undefined];
    }
    if (member.memberKind === "method") {
      return renderObjectShapeMethodMember(
        fact,
        member,
        receiverBoundMethodKeys.has(
          csharpObjectShapeMemberContractKey(member),
        ),
        diagnostics,
        diagnosticSubject,
      );
    }
    if (member.accessor !== undefined) {
      return renderObjectShapeAccessorMember(
        fact,
        member,
        type,
        diagnostics,
        diagnosticSubject,
      );
    }
    if (implementsInterface) {
      return [{
        kind: "PropertyDeclaration" as const,
        name: member.targetName,
        modifiers: member.optional === true
          ? ["public"] as const
          : ["public", "required"] as const,
        type,
        autoGetter: true,
        autoSetter: true,
      }];
    }
    return [{
      kind: "FieldDeclaration" as const,
      name: member.targetName,
      modifiers: member.optional === true
        ? ["public"] as const
        : ["public", "required"] as const,
      type,
    }];
  });
  return members.some((member) => member === undefined)
    ? undefined
    : members as CsharpClassDeclaration["members"];
}

function renderObjectShapeAccessorMember(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  type: CsharpTypeNode,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly (CsharpTypeMember | undefined)[] {
  const selfType = csharpTypeFromTargetTypeRef(objectShape.targetType);
  const getterType = csharpTypeFromTargetTypeRef(
    csharpDelegateTargetType("System.Func", [objectShape.targetType], member.type),
  );
  const setterType = member.accessor?.setter === true
    ? csharpTypeFromTargetTypeRef(
        csharpDelegateTargetType(
          "System.Action",
          [objectShape.targetType, member.type],
        ),
      )
    : undefined;
  if (selfType === undefined || getterType === undefined ||
    (member.accessor?.setter === true && setterType === undefined)) {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        diagnosticSubject,
        `Object-shape accessor '${member.sourceName}' has no exact renderable self/getter/setter delegate contract.`,
      ));
    }
    return [undefined];
  }
  const getterName = objectShapeAccessorGetterStorageMemberName(
    objectShape,
    member,
  );
  const setterName = objectShapeAccessorSetterStorageMemberName(
    objectShape,
    member,
  );
  const property: CsharpTypeMember = {
    kind: "PropertyDeclaration",
    name: member.targetName,
    modifiers: ["public"],
    type,
    getter: {
      kind: "Block",
      statements: [{
        kind: "ReturnStatement",
        expression: invokeAccessor(getterName, [
          { kind: "IdentifierName", name: "this" },
        ]),
      }],
    },
    ...(member.accessor?.setter !== true
      ? {}
      : {
          setter: {
            kind: "Block" as const,
            statements: [{
              kind: "ExpressionStatement" as const,
              expression: invokeAccessor(setterName, [
                { kind: "IdentifierName", name: "this" },
                { kind: "IdentifierName", name: "value" },
              ]),
            }],
          },
        }),
  };
  return [{
    kind: "FieldDeclaration",
    name: getterName,
    modifiers: ["public", "required"],
    type: getterType,
  }, ...(setterType === undefined
    ? []
    : [{
        kind: "FieldDeclaration" as const,
        name: setterName,
        modifiers: ["public", "required"] as const,
        type: setterType,
      }]), property];
}

function invokeAccessor(
  name: string,
  arguments_: readonly CsharpExpression[],
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name },
    arguments: arguments_.map((expression) => ({
      kind: "Argument",
      expression,
    })),
  };
}

function renderObjectShapeMethodMember(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  receiverBound: boolean,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly (CsharpTypeMember | undefined)[] {
  const signature = csharpDelegateSignatureFromTargetTypeRef(member.type);
  const storageTargetType = objectShapeMethodStorageTargetType(
    objectShape,
    member,
    receiverBound,
  );
  const storageType = storageTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(storageTargetType);
  if (signature === undefined || storageType === undefined) {
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
    arguments: [
      ...(receiverBound
        ? [{
            kind: "Argument" as const,
            expression: {
              kind: "IdentifierName" as const,
              name: "this",
            },
          }]
        : []),
      ...parameters.map((parameter) => ({
        kind: "Argument" as const,
        expression: {
          kind: "IdentifierName" as const,
          name: parameter.name,
        },
      })),
    ],
  };
  return [{
    kind: "FieldDeclaration",
    name: backingName,
    modifiers: member.optional === true ? ["public"] : ["public", "required"],
    type: storageType,
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
