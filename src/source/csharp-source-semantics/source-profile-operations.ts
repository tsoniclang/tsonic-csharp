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

interface CsharpSourceProfileMethodRow {
  readonly declaringName: CsharpSourceProfileMemberIdentity["declaringName"];
  readonly memberName: string;
  readonly returnType: TargetTypeRef;
  readonly parameters: readonly { readonly name: string; readonly type: TargetTypeRef }[];
}

interface CsharpSourceProfilePropertyRow {
  readonly declaringNames: readonly CsharpSourceProfileMemberIdentity["declaringName"][];
  readonly memberName: string;
  readonly returnType: TargetTypeRef;
}

const sourceProfileMethodRows: readonly CsharpSourceProfileMethodRow[] = [
  {
    declaringName: "String",
    memberName: "Split",
    returnType: { kind: "array", element: csharpStringTargetType() },
    parameters: [{ name: "separator", type: csharpStringTargetType() }],
  },
  ...["StartsWith", "EndsWith", "Contains"].map((memberName): CsharpSourceProfileMethodRow => ({
    declaringName: "String",
    memberName,
    returnType: csharpSourcePrimitiveTargetType("bool"),
    parameters: [{ name: "value", type: csharpStringTargetType() }],
  })),
  ...["Trim", "ToString"].map((memberName): CsharpSourceProfileMethodRow => ({
    declaringName: "String",
    memberName,
    returnType: csharpStringTargetType(),
    parameters: [],
  })),
];

const sourceProfilePropertyRows: readonly CsharpSourceProfilePropertyRow[] = [
  {
    declaringNames: ["String", "Array", "ReadonlyArray"],
    memberName: "Length",
    returnType: csharpSourcePrimitiveTargetType("int32"),
  },
];

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
  if (identity === undefined) {
    return undefined;
  }
  const row = sourceProfileMethodRows.find((candidate) =>
    candidate.declaringName === identity.declaringName &&
    candidate.memberName === identity.memberName
  );
  return row === undefined ? undefined : csharpSourceProfileMethod(identity, row);
}

export function csharpSourceProfilePropertyMember(
  identity: CsharpSourceProfileMemberIdentity | undefined,
  receiverType: TargetTypeRef | undefined,
): CsharpTargetMember | undefined {
  if (identity === undefined) {
    return undefined;
  }
  const row = sourceProfilePropertyRows.find((candidate) =>
    candidate.memberName === identity.memberName &&
    candidate.declaringNames.includes(identity.declaringName)
  );
  if (row === undefined) {
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
    returnType: row.returnType,
  };
}

function csharpSourceProfileMethod(
  identity: CsharpSourceProfileMemberIdentity,
  row: CsharpSourceProfileMethodRow,
): CsharpTargetMember {
  return {
    id: csharpSourceProfileMemberId(identity),
    sourceName: identity.memberName,
    targetName: identity.memberName,
    kind: "method",
    static: false,
    declaringType: csharpStringTargetType(),
    parameters: row.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      passingMode: "by-value",
    })),
    returnType: row.returnType,
  };
}

function csharpSourceProfileMemberId(identity: CsharpSourceProfileMemberIdentity): string {
  return `tsonic.csharp.source-profile.${identity.declaringName}.${identity.memberName}`;
}

function isCsharpSourceProfileDeclaringName(name: string): name is CsharpSourceProfileMemberIdentity["declaringName"] {
  return name === "String" || name === "Array" || name === "ReadonlyArray";
}
