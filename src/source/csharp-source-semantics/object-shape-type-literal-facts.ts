import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  getNodeNameText,
  isTypeLiteralLikeNode,
} from "./ast-utils.js";
import {
  createObjectShapeTargetType,
} from "./object-shape-identity.js";
import {
  generatedObjectShapeMemberName,
} from "./target-ref-utils.js";
import {
  csharpNullableTargetType,
} from "./target-types.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function deriveCsharpObjectShapeFactForSubject(
  node: Node | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolver?: CsharpRecursiveTargetTypeResolver,
): CsharpObjectShapeFact | undefined {
  if (node === undefined || !isTypeLiteralLikeNode(node)) {
    return undefined;
  }
  const members = getNodeList(getNodeField(node, "Members"));
  if (members.length === 0) {
    return undefined;
  }
  const shapeMembers = members
    .map((member) => deriveCsharpObjectShapeMemberFactForSubject(member, context, host, resolver))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return undefined;
  }
  return {
    targetType: createObjectShapeTargetType("__TsonicShape", shapeMembers),
    members: shapeMembers,
  };
}

function deriveCsharpObjectShapeMemberFactForSubject(
  member: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolver?: CsharpRecursiveTargetTypeResolver,
): CsharpObjectShapeMemberFact | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const sourceName = getNodeNameText(ast, member);
  if (sourceName.length === 0) {
    return undefined;
  }
  const memberKind = getNodeList(getNodeField(member, "Parameters")).length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? host.getFunctionTargetTypeRefFromSignatureLikeSubject(member, context, {}, resolver)
    : host.getTargetTypeRefForSubject(asNodeSubject(getNodeField(member, "Type")), context, {}, resolver);
  if (type === undefined) {
    return undefined;
  }
  const optional = getNodeField(member, "QuestionToken") !== undefined;
  return {
    sourceName,
    sourceSubjects: [member],
    targetName: generatedObjectShapeMemberName(sourceName),
    memberKind,
    type: optional ? csharpNullableTargetType(type) : type,
    ...(optional ? { optional: true } : {}),
  };
}
