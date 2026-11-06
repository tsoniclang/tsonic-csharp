import type { Node, Type } from "@tsonic/tsts";
import type { TargetSourceProgram, SourceFileSemantics } from "@tsonic/target-api/source";
import { sourceMemberOwner, sourceParameterIsProperty, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType } from "../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";

type DeclaredErrorOwner = { readonly kind: "error"; readonly declaration: Node; readonly plain: boolean }
  | { readonly kind: "unavailable"; readonly site: Node };

export function analyzeCsharpNativeErrorAdmission(source: TargetSourceProgram): {
  readonly issues: readonly TargetDiagnostic[];
  readonly nameInitializations: ReadonlySet<Node>;
} {
  const issues: TargetDiagnostic[] = [];
  const nameInitializations = new Set<Node>();
  const { ast, navigation, semantics } = source;
  const declaredErrorOwner = (declaration: Node, seen = new Set<Node>()): DeclaredErrorOwner | undefined => {
    if (seen.has(declaration)) return undefined;
    seen.add(declaration);
    if (classifyCsharpSourceProfileDeclaration(declaration, ast)?.kind === "error") {
      return { kind: "error", declaration, plain: true };
    }
    if (!ast.is.IsClassDeclaration(declaration) && !ast.is.IsClassExpression(declaration)) return undefined;
    const heritage = navigation.declaredHeritage(declaration);
    if (heritage.kind !== "resolved") return { kind: "unavailable", site: heritage.heritage };
    for (const edge of heritage.edges) {
      if (edge.kind !== "extends") continue;
      const expression = ast.as.AsExpressionWithTypeArguments(edge.heritage)?.Expression;
      const outcome = expression === undefined ? undefined : source.effectiveTypes.get(expression);
      const type = outcome === undefined || outcome.kind === "refused" || outcome.provenance.occurrence !== expression
        ? undefined : sourceTypeDescriptorStructure(outcome.type);
      const signatures = type?.kind === "shape" || type?.kind === "callable" ? type.constructs : [];
      const instance = signatures[0]?.result;
      if (instance?.kind !== "declared" || signatures.some(signature =>
        signature.result.kind !== "declared" || signature.result.declaration !== instance.declaration)) {
        return { kind: "unavailable", site: expression ?? edge.heritage };
      }
      const inherited = declaredErrorOwner(instance.declaration, seen);
      if (inherited?.kind === "unavailable") return inherited;
      if (inherited !== undefined) return { ...inherited, declaration, plain: false };
    }
    return undefined;
  };
  const errorOwner = (type: Type, queries: SourceFileSemantics, seen = new Set<Node>()):
    { readonly declaration: Node; readonly plain: boolean; readonly nativeType: Type } | undefined => {
    const present = queries.types.nonNullableType(type) ?? type;
    const identity = classifyCsharpSourceProfileType(present, queries, ast);
    const symbol = queries.declarations.typeSymbol(present);
    const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
    if (identity?.kind === "error") {
      const declaration = declarations.find(declaration => ast.is.IsInterfaceDeclaration(declaration) || ast.is.IsClassDeclaration(declaration));
      return declaration === undefined ? undefined : { declaration, plain: true, nativeType: present };
    }
    for (const declaration of declarations) {
      if ((!ast.is.IsClassDeclaration(declaration) && !ast.is.IsClassExpression(declaration)) || seen.has(declaration)) continue;
      seen.add(declaration);
      const heritage = navigation.declaredHeritage(declaration);
      if (heritage.kind !== "resolved") continue;
      for (const edge of heritage.edges) {
        if (edge.kind !== "extends") continue;
        const inherited = errorOwner(edge.selectedType, semantics.forNode(edge.heritage), seen);
        if (inherited !== undefined) return { declaration, plain: false, nativeType: inherited.nativeType };
      }
    }
    return undefined;
  };
  const refuse = (node: Node, code: string, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  const unavailable = new Set<Node>();
  const requireOwner = (owner: DeclaredErrorOwner | undefined): Extract<DeclaredErrorOwner, { readonly kind: "error" }> | undefined => {
    if (owner?.kind !== "unavailable") return owner;
    if (!unavailable.has(owner.site)) {
      unavailable.add(owner.site);
      refuse(owner.site, "CSHARP_ERROR_ANCESTRY_NOT_PROVEN",
        "Native Error admission requires one exact published instance declaration for the selected base constructor.");
    }
    return undefined;
  };
  for (const node of navigation.nodes) {
    if (!navigation.isProjectDeclaration(node)) continue;
    const queries = semantics.forNode(node);
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      const type = queries.declarations.declaredType(node);
      const owner = type === undefined ? undefined : errorOwner(type, queries);
      if (type === undefined || owner === undefined || owner.plain) continue;
      const refused = new Set<Node>();
      for (const inherited of queries.types.propertyInfos(owner.nativeType)) {
        const declarations = [...new Set([inherited.symbol, ...inherited.rootSymbols]
          .flatMap(symbol => queries.declarations.symbolDeclarations(symbol)))];
        for (const declaration of declarations) {
          const identity = csharpSourceProfileDeclarationIdentity(ast, queries, source.sourceFacts, declaration);
          if (identity?.kind !== "member" || identity.declaringName !== "Error") continue;
          const pair = queries.types.structuralMember(type, owner.nativeType, declaration, "correspondence");
          if (pair?.kind !== "present") continue;
          for (const own of pair.source.declarations) {
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
      const outcome = source.effectiveTypes.get(node);
      let descriptor = outcome === undefined || outcome.kind === "refused" ? undefined : outcome.type;
      while (descriptor?.kind === "optional") descriptor = descriptor.value;
      const owner = requireOwner(descriptor?.kind !== "declared" ? undefined : declaredErrorOwner(descriptor.declaration));
      if (owner !== undefined) refuse(node,
        "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED", "An Error is a native C# exception, not a structural object literal; construct a new Error instead.");
      continue;
    }
    const property = queries.operations.propertyAccess(node);
    if (property === undefined || property.accessMode === "read") continue;
    const declaration = property.selectedWriteDeclaration ?? property.selectedDeclaration;
    const identity = csharpSourceProfileDeclarationIdentity(ast, queries, source.sourceFacts, declaration);
    if (identity?.kind !== "member" || identity.declaringName !== "Error") continue;
    const owner = errorOwner(property.receiver.type, queries);
    if (owner === undefined) continue;
    const assignment = ast.parent(node);
    const binary = assignment === undefined ? undefined : ast.as.AsBinaryExpression(assignment);
    const statement = assignment === undefined ? undefined : ast.parent(assignment);
    const className = ast.name(owner.declaration);
    if (identity.name === "name" && !owner.plain && ast.kindName(property.receiver.expression) === "KindThisKeyword" &&
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
