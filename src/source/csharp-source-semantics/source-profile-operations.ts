import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpSourceProfileOwnerId,
} from "./source-profile-declarations.js";
import type {
  CsharpTargetMember,
} from "./target-types.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "./target-types.js";

export interface CsharpSourceProfileMemberIdentity {
  readonly declaringName: "String" | "Array" | "ReadonlyArray";
  readonly memberName: string;
}

export function getCsharpSourceProfileMemberIdentity(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpSourceProfileMemberIdentity | undefined {
  const compiler = context.compiler;
  const declaration = asNodeSubject(declarationSubject);
  if (compiler === undefined || declaration === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  if (
    !isTsonicSourceProfileDeclarationPath(fileName, csharpSourceProfileOwnerId) &&
    !isTsonicSourceProfileDeclarationPath(fileName, csharpJsSourceProfileOwnerId)
  ) {
    return undefined;
  }
  const memberNode = ast.text(ast.name(declaration)) === ""
    ? asNodeSubject(ast.parent(declaration))
    : declaration;
  if (memberNode === undefined) {
    return undefined;
  }
  const memberName = ast.text(ast.name(memberNode));
  const declaringName = ast.text(ast.name(ast.parent(memberNode)));
  if (!isCsharpSourceProfileDeclaringName(declaringName) || memberName === "") {
    return undefined;
  }
  return { declaringName, memberName };
}

export function csharpSourceProfileCallMember(
  identity: CsharpSourceProfileMemberIdentity | undefined,
): CsharpTargetMember | undefined {
  if (identity?.declaringName !== "String") {
    return undefined;
  }
  switch (identity.memberName) {
    case "Split":
      return csharpSourceProfileMethod(identity, {
        returnType: { kind: "array", element: csharpStringTargetType() },
        parameters: [{ name: "separator", type: csharpStringTargetType() }],
      });
    case "StartsWith":
    case "EndsWith":
    case "Contains":
      return csharpSourceProfileMethod(identity, {
        returnType: csharpSourcePrimitiveTargetType("bool"),
        parameters: [{ name: "value", type: csharpStringTargetType() }],
      });
    case "Trim":
    case "ToString":
      return csharpSourceProfileMethod(identity, {
        returnType: csharpStringTargetType(),
        parameters: [],
      });
    default:
      return undefined;
  }
}

export function csharpSourceProfilePropertyMember(
  identity: CsharpSourceProfileMemberIdentity | undefined,
  receiverType: TargetTypeRef | undefined,
): CsharpTargetMember | undefined {
  if (identity?.memberName !== "Length") {
    return undefined;
  }
  if (identity.declaringName !== "String" && identity.declaringName !== "Array" && identity.declaringName !== "ReadonlyArray") {
    return undefined;
  }
  return {
    id: csharpSourceProfileMemberId(identity),
    sourceName: identity.memberName,
    targetName: identity.memberName,
    kind: "property",
    static: false,
    parameters: [],
    declaringType: identity.declaringName === "String" ? csharpStringTargetType() : receiverType,
    returnType: csharpSourcePrimitiveTargetType("int32"),
  };
}

function csharpSourceProfileMethod(
  identity: CsharpSourceProfileMemberIdentity,
  options: {
    readonly returnType: TargetTypeRef;
    readonly parameters: readonly { readonly name: string; readonly type: TargetTypeRef }[];
  },
): CsharpTargetMember {
  return {
    id: csharpSourceProfileMemberId(identity),
    sourceName: identity.memberName,
    targetName: identity.memberName,
    kind: "method",
    static: false,
    declaringType: csharpStringTargetType(),
    parameters: options.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      passingMode: "by-value",
    })),
    returnType: options.returnType,
  };
}

function csharpSourceProfileMemberId(identity: CsharpSourceProfileMemberIdentity): string {
  return `tsonic.csharp.source-profile.${identity.declaringName}.${identity.memberName}`;
}

function isCsharpSourceProfileDeclaringName(name: string): name is CsharpSourceProfileMemberIdentity["declaringName"] {
  return name === "String" || name === "Array" || name === "ReadonlyArray";
}
