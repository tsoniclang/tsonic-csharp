import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpSourceProfileDeclarationFact,
} from "../csharp-facts.js";
import {
  csharpSourceProfileDeclarationFactKey,
} from "../csharp-facts.js";
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
  readonly kind: "named" | "indexer";
  readonly ownerId: typeof csharpSourceProfileOwnerId | typeof csharpJsSourceProfileOwnerId;
  readonly declaringName: "String" | "Array" | "ReadonlyArray";
  readonly memberName?: string;
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
  if (declarationSubject === undefined) {
    return undefined;
  }
  const declaration = getCsharpSourceProfileDeclarationFact(declarationSubject, context);
  if (
    declaration === undefined ||
    (declaration.ownerId !== csharpSourceProfileOwnerId && declaration.ownerId !== csharpJsSourceProfileOwnerId) ||
    !isCsharpSourceProfileDeclaringName(declaration.declaringName)
  ) {
    return undefined;
  }
  if (declaration.kind === "indexer") {
    return declaration.declaringName === "Array" || declaration.declaringName === "ReadonlyArray"
      ? { kind: "indexer", ownerId: declaration.ownerId, declaringName: declaration.declaringName }
      : undefined;
  }
  if (declaration.kind !== "member" || declaration.name === "") {
    return undefined;
  }
  return {
    kind: "named",
    ownerId: declaration.ownerId,
    declaringName: declaration.declaringName,
    memberName: declaration.name,
  };
}

export function getCsharpSourceProfileDeclarationFact(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpSourceProfileDeclarationFact | undefined {
  return declarationSubject === undefined
    ? undefined
    : context.factResolver.resolve(declarationSubject, csharpSourceProfileDeclarationFactKey) ??
      context.facts.get(declarationSubject, csharpSourceProfileDeclarationFactKey);
}

export function csharpSourceProfileCallMember(
  identity: CsharpSourceProfileMemberIdentity | undefined,
): CsharpTargetMember | undefined {
  if (
    identity === undefined ||
    identity.ownerId !== csharpSourceProfileOwnerId ||
    identity.kind !== "named" ||
    identity.memberName === undefined
  ) {
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
): CsharpTargetMember | undefined {
  if (
    identity === undefined ||
    identity.ownerId !== csharpSourceProfileOwnerId ||
    identity.kind !== "named" ||
    identity.memberName === undefined
  ) {
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
    sourceName: row.memberName,
    targetName: row.memberName,
    kind: "property",
    static: false,
    parameters: [],
    ...(identity.declaringName === "String" ? { declaringType: csharpStringTargetType() } : {}),
    returnType: row.returnType,
  };
}

export function csharpSourceProfileIndexerMember(
  identity: CsharpSourceProfileMemberIdentity | undefined,
  resultType: TargetTypeRef,
): CsharpTargetMember | undefined {
  if (
    identity?.kind !== "indexer" ||
    identity.ownerId !== csharpSourceProfileOwnerId ||
    (identity.declaringName !== "Array" && identity.declaringName !== "ReadonlyArray")
  ) {
    return undefined;
  }
  return {
    id: `tsonic.csharp.source-profile.${identity.declaringName}.indexer`,
    sourceName: "Item",
    targetName: "Item",
    kind: "indexer",
    static: false,
    parameters: [{
      name: "index",
      type: csharpSourcePrimitiveTargetType("int32"),
      passingMode: "by-value",
    }],
    returnType: resultType,
  };
}

function csharpSourceProfileMethod(
  identity: CsharpSourceProfileMemberIdentity,
  row: CsharpSourceProfileMethodRow,
): CsharpTargetMember {
  return {
    id: csharpSourceProfileMemberId(identity),
    sourceName: row.memberName,
    targetName: row.memberName,
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
  return `tsonic.csharp.source-profile.${identity.declaringName}.${identity.memberName ?? "indexer"}`;
}

function isCsharpSourceProfileDeclaringName(name: string | undefined): name is CsharpSourceProfileMemberIdentity["declaringName"] {
  return name === "String" || name === "Array" || name === "ReadonlyArray";
}
