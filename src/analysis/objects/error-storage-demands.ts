import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { sourceMemberOwner, sourceParameterIsProperty } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { classifyCsharpSourceProfileDeclaration } from "../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { csharpSourceNodes } from "../program/source-nodes.js";

/** `error` is the native Error declaration; `plain` is true when the declaration is that Error itself. */
type ErrorOwner = { readonly declaration: Node; readonly plain: boolean; readonly error: Node };

function membersOf(facts: SourceProgramFacts, type: SourceTypeDescriptor, site: Node) {
  const members = facts.objects.members(type);
  return "code" in members ? failTargetAnalysisInvariant("tsonic-csharp",
    "Object members are a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", site) : members;
}

/** The self application of a declared class or interface: its own type parameters as arguments (authored syntax). */
function selfType(ast: TargetSourceProgramFacts["syntax"], declaration: Node): SourceTypeDescriptor {
  return { kind: "declared", declaration, typeArguments: ast.typeParameters(declaration)
    .flatMap((parameter): SourceTypeDescriptor[] => parameter === undefined ? [] : [{ kind: "declared", declaration: parameter, typeArguments: [] }]) };
}

function heritageEdges(facts: SourceProgramFacts, declaration: Node) {
  const heritage = facts.objects.heritage(declaration);
  return "code" in heritage ? failTargetAnalysisInvariant("tsonic-csharp",
    "Class heritage is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", declaration) : heritage;
}

/** Native Error admission (.NET exceptions): Error subtypes, Error object literals and Error member writes. */
export function analyzeCsharpNativeErrorAdmission(source: TargetSourceProgramFacts): {
  readonly issues: readonly TargetDiagnostic[];
  readonly nameInitializations: ReadonlySet<Node>;
} {
  const issues: TargetDiagnostic[] = [];
  const nameInitializations = new Set<Node>();
  const { syntax: ast, facts } = source;
  // The Error class a declaration is, or extends through published heritage edges (objects.heritage).
  const declaredErrorOwner = (declaration: Node, seen = new Set<Node>()): ErrorOwner | undefined => {
    if (seen.has(declaration)) return undefined;
    seen.add(declaration);
    if (classifyCsharpSourceProfileDeclaration(declaration, ast)?.kind === "error") return { declaration, plain: true, error: declaration };
    if (!ast.is.IsClassDeclaration(declaration) && !ast.is.IsClassExpression(declaration)) return undefined;
    for (const edge of heritageEdges(facts, declaration)) {
      if (edge.kind !== "extends") continue;
      const inherited = declaredErrorOwner(edge.target, seen);
      if (inherited !== undefined) return { declaration, plain: false, error: inherited.error };
    }
    return undefined;
  };
  const errorOwner = (type: SourceTypeDescriptor): ErrorOwner | undefined => {
    let present = type;
    while (present.kind === "optional") present = present.value;
    return present.kind === "declared" ? declaredErrorOwner(present.declaration) : undefined;
  };
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  for (const node of csharpSourceNodes(ast, source.sourceFiles)) {
    if (!facts.navigation.identity.isProjectDeclaration(node)) continue;
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      const owner = declaredErrorOwner(node);
      if (owner === undefined || owner.plain) continue;
      const refused = new Set<Node>();
      // Each native Error member (objects.members of Error) and the class member under the same key (objects.member):
      // an own property or accessor declaration of that key redeclares the inherited native member.
      const classType = selfType(ast, node);
      for (const inherited of membersOf(facts, selfType(ast, owner.error), node)) {
        if (!inherited.declarations.some(declaration => {
          const identity = csharpSourceProfileDeclarationIdentity(ast, facts, source.sourceFacts, declaration);
          return identity?.kind === "member" && identity.declaringName === "Error";
        })) continue;
        const member = facts.objects.member(classType, inherited.key);
        if (member === undefined) continue;
        {
          for (const own of member.declarations) {
            if (sourceMemberOwner(ast, own) !== node || refused.has(own) ||
              !ast.is.IsPropertyDeclaration(own) && !ast.is.IsGetAccessorDeclaration(own) &&
              !ast.is.IsSetAccessorDeclaration(own) && !sourceParameterIsProperty(ast, own)) continue;
            refused.add(own);
            refuse(own, "CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED",
              "A project Error subtype cannot redeclare an inherited native Error member; pass its native value to super or use a differently named project field.");
          }
        }
      }
      continue;
    }
    if (ast.is.IsObjectLiteralExpression(node)) {
      const outcome = facts.values.type(node);
      if (outcome.kind === "refused") failTargetAnalysisInvariant("tsonic-csharp",
        "An object literal type is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", node);
      if (errorOwner(outcome.type) !== undefined) refuse(node,
        "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED", "An Error is a native C# exception, not a structural object literal; construct a new Error instead.");
      continue;
    }
    const property = facts.selections.memberAccess(node);
    if (property === undefined || property.access === "read" || property.access === "call" || property.selected.kind !== "member") continue;
    const declaration = property.selected.declarations[0];
    const identity = csharpSourceProfileDeclarationIdentity(ast, facts, source.sourceFacts, declaration);
    if (identity?.kind !== "member" || identity.declaringName !== "Error") continue;
    const owner = errorOwner(property.receiverType);
    if (owner === undefined) continue;
    const assignment = ast.parent(node);
    const binary = assignment === undefined ? undefined : ast.as.AsBinaryExpression(assignment);
    const statement = assignment === undefined ? undefined : ast.parent(assignment);
    const className = ast.name(owner.declaration);
    if (identity.name === "name" && !owner.plain && ast.kindName(property.receiver) === "KindThisKeyword" &&
      binary?.Left === node && sourceOperatorFromKindName(ast.operatorKindName(assignment!)) === "=" &&
      ast.is.IsStringLiteral(binary.Right) && className !== undefined && ast.text(binary.Right) === ast.text(className) &&
      statement !== undefined && ast.is.IsExpressionStatement(statement)) {
      nameInitializations.add(statement);
      continue;
    }
    refuse(node, "CSHARP_ERROR_READONLY_STORAGE",
      "C# exceptions are immutable after construction; create a new Error or pass the message to super instead.");
  }
  return Object.freeze({ issues: Object.freeze(issues), nameInitializations: Object.freeze(nameInitializations) });
}
