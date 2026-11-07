import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { sourceMemberOwner, sourceParameterIsProperty } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { classifyCsharpSourceProfileDeclaration } from "../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";

/** `error` is the native Error type (its Host descriptor); `plain` is true when the declaration is that Error itself. */
type ErrorOwner = { readonly declaration: Node; readonly plain: boolean; readonly error: SourceTypeDescriptor };
/** An extends edge whose Host base type is not one declared instance type: the ancestry is not proven at `site`. */
type ErrorAncestryUnavailable = { readonly unavailable: Node };

function membersOf(facts: SourceProgramFacts, type: SourceTypeDescriptor, site: Node) {
  const members = facts.objects.members(type);
  return "code" in members ? failTargetAnalysisInvariant("tsonic-csharp",
    "Object members are a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", site) : members;
}

function selfTypeOf(facts: SourceProgramFacts, declaration: Node): SourceTypeDescriptor {
  const type = facts.objects.selfType(declaration);
  return "code" in type ? failTargetAnalysisInvariant("tsonic-csharp",
    "A class self type is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", declaration) : type;
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
  // The Error type a declared type is, or extends through published heritage edges (objects.heritage). An extends
  // edge's `type` is the Host descriptor of the base constructor's instance type (for `extends Error`, the Error
  // interface the ErrorConstructor constructs), never the heritage symbol's primary declaration (R4 #52, R4 #18).
  const declaredErrorOwner = (type: SourceTypeDescriptor & { readonly kind: "declared" }, seen = new Set<Node>()):
    ErrorOwner | ErrorAncestryUnavailable | undefined => {
    const { declaration } = type;
    if (seen.has(declaration)) return undefined;
    seen.add(declaration);
    if (classifyCsharpSourceProfileDeclaration(declaration, ast, facts.profile)?.kind === "error") return { declaration, plain: true, error: type };
    if (!ast.is.IsClassDeclaration(declaration) && !ast.is.IsClassExpression(declaration)) return undefined;
    for (const edge of heritageEdges(facts, declaration)) {
      if (edge.kind !== "extends") continue;
      // A base whose Host instance type is not one declared type (a structural mixin result, several constructor
      // results) gives no proven ancestry (baseline: CSHARP_ERROR_ANCESTRY_NOT_PROVEN at the base expression, Q94).
      if (edge.type.kind !== "declared") {
        return { unavailable: ast.as.AsExpressionWithTypeArguments(edge.heritage)?.Expression ?? edge.heritage };
      }
      const inherited = declaredErrorOwner(edge.type, seen);
      if (inherited !== undefined && "unavailable" in inherited) return inherited;
      if (inherited !== undefined) return { declaration, plain: false, error: inherited.error };
    }
    return undefined;
  };
  const errorAncestry = (type: SourceTypeDescriptor): ErrorOwner | ErrorAncestryUnavailable | undefined => {
    let present = type;
    while (present.kind === "optional") present = present.value;
    return present.kind === "declared" ? declaredErrorOwner(present) : undefined;
  };
  /** The Error owner of a type; an unproven ancestry is not the Error family here (baseline refused only literals). */
  const errorOwner = (type: SourceTypeDescriptor): ErrorOwner | undefined => {
    const ancestry = errorAncestry(type);
    return ancestry === undefined || "unavailable" in ancestry ? undefined : ancestry;
  };
  const unavailable = new Set<Node>();
  const refuse = (node: Node, code: `CSHARP_${string}`, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  // The Host node inventory, in its order (facts.navigation.nodesForFiles; R4 #31).
  for (const node of facts.navigation.nodesForFiles(source.sourceFiles)) {
    if (!facts.navigation.identity.isProjectDeclaration(node)) continue;
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      // The class's own instance type, Host-published (objects.selfType); C# builds no descriptor (I6, R4 #18).
      const classType = selfTypeOf(facts, node);
      const owner = errorOwner(classType);
      if (owner === undefined || owner.plain) continue;
      const refused = new Set<Node>();
      // Each native Error member (objects.members of Error) and the class member under the same key (objects.member):
      // an own property or accessor declaration of that key redeclares the inherited native member.
      for (const inherited of membersOf(facts, owner.error, node)) {
        if (!inherited.declarations.some(declaration => {
          const identity = csharpSourceProfileDeclarationIdentity(ast, facts, declaration);
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
      const ancestry = errorAncestry(outcome.type);
      if (ancestry !== undefined && "unavailable" in ancestry) {
        if (!unavailable.has(ancestry.unavailable)) {
          unavailable.add(ancestry.unavailable);
          refuse(ancestry.unavailable, "CSHARP_ERROR_ANCESTRY_NOT_PROVEN",
            "Native Error admission requires one exact published instance declaration for the selected base constructor.");
        }
      } else if (ancestry !== undefined) refuse(node,
        "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED", "An Error is a native C# exception, not a structural object literal; construct a new Error instead.");
      continue;
    }
    const property = facts.selections.memberAccess(node);
    if (property === undefined || property.access === "read" || property.access === "call" || property.selected.kind !== "member") continue;
    const declaration = property.selected.declarations[0];
    const identity = csharpSourceProfileDeclarationIdentity(ast, facts, declaration);
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
