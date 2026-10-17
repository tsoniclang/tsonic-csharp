import {
  createHash,
} from "node:crypto";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { ObjectLiteralProperty_SourceName, sourceNodesEqual } from "@tsonic/target-api/source";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import { objectShapeMemberTargetName } from "../../policy/types/objects/object-shape-policy/construction.js";
import {
  tryCsharpIdentifier,
} from "../../target-model/names/identifiers.js";
import type {
  CsharpSourceIdentityPolicy,
} from "../../policy/identities/source-nodes.js";
import type {
  CsharpNamePlan,
  CsharpSourceNameResolution,
} from "../../target-model/names/model.js";
import { csharpSourceTypeParameter, csharpSourceTypeParameters } from "../../target-model/names/type-parameters.js";

export interface CsharpSourceNameResolver {
  temporaryName(preferred: string): string;
  resolve(
    nameNode: Node | undefined,
    selectedDeclaration?: Node,
  ): CsharpSourceNameResolution;
}

export interface CsharpSourceNameBuilder extends CsharpSourceNameResolver {
  seal(): CsharpNamePlan;
}

export interface CsharpSourceNameResolverHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  semanticsFor(node: Node): SourceFileSemantics;
}

export function createCsharpSourceNameBuilder(
  host: CsharpSourceNameResolverHost,
): CsharpSourceNameBuilder {
  const privateNames = new WeakMap<Node, string>();
  const privateDeclarations = new WeakMap<Node, Node>();
  const privateNameNodes = new WeakSet<Node>();
  const resolutions = new WeakMap<Node, CsharpSourceNameResolution>();
  const sourceNames = new Set<string>();
  const typeParameterResolutions = new WeakMap<Node, CsharpSourceNameResolution>();
  const typeParameterNames: { readonly identity: string; readonly name: string }[] = [];

  const allocatePrivateName = (declaration: Node): string | undefined => {
    const existing = privateNames.get(declaration);
    if (existing !== undefined) {
      return existing;
    }
    const identity = host.sourceIdentities.node(declaration);
    if (identity === undefined) {
      return undefined;
    }
    const name = `__tsonic_private_${
      createHash("sha256").update(identity).digest("hex")
    }`;
    privateNames.set(declaration, name);
    sourceNames.add(name);
    return name;
  };

  const visit = (node: Node): void => {
    if (host.ast.is.IsMethodDeclaration(node) || host.ast.is.IsMethodSignatureDeclaration(node) ||
      host.ast.is.IsFunctionDeclaration(node) || host.ast.is.IsFunctionExpression(node) || host.ast.is.IsArrowFunction(node)) {
      const valueNames = new Set(host.ast.parameters(node).flatMap(parameter => {
        const name = host.ast.name(parameter);
        return name !== undefined && host.ast.is.IsIdentifier(name) ? [host.ast.text(name)] : [];
      }));
      const parameters = host.ast.typeParameters(node).flatMap(declaration => {
        const parameter = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, host.ast);
        return declaration === undefined || parameter === undefined ? [] : [{ declaration, parameter }];
      });
      const reserved = new Set([...valueNames, ...parameters.map(({ parameter }) => parameter.name)]);
      for (let owner = host.ast.parent(node); owner !== undefined; owner = host.ast.parent(owner)) {
        for (const declaration of csharpSourceTypeParameters(owner, host.ast)) {
          const name = host.ast.name(declaration);
          if (name !== undefined) reserved.add(host.ast.text(name));
        }
      }
      for (const { declaration, parameter } of parameters) {
        if (!valueNames.has(parameter.name)) continue;
        let suffix = 1;
        while (reserved.has(`${parameter.name}${suffix}`)) suffix += 1;
        const name = `${parameter.name}${suffix}`;
        reserved.add(name);
        typeParameterResolutions.set(declaration, Object.freeze({ kind: "resolved", name }));
        typeParameterNames.push(Object.freeze({ identity: parameter.identity, name }));
      }
    }
    if (host.ast.is.IsPrivateIdentifier(node)) {
      const declaration = exactPrivateDeclaration(host, node, undefined);
      if (declaration !== undefined) {
        privateDeclarations.set(node, declaration);
        allocatePrivateName(declaration);
      }
    }
    host.ast.forEachChild(node, (child) => {
      if (child !== undefined) visit(child);
    });
  };
  host.sourceFiles.forEach(visit);
  host.sourceFiles.forEach(visitNames);

  function resolve(
    nameNode: Node | undefined,
    selectedDeclaration?: Node,
  ): CsharpSourceNameResolution {
    if (nameNode === undefined) {
      return rejected("The source declaration has no name node.");
    }
    const typeParameter = selectedDeclaration === undefined ? undefined : typeParameterResolutions.get(selectedDeclaration);
    if (typeParameter !== undefined) return typeParameter;
    const selectedName = !privateNameNodes.has(nameNode) ||
        selectedDeclaration === undefined
      ? undefined
      : privateNames.get(selectedDeclaration);
    if (selectedName !== undefined) {
      return { kind: "resolved", name: selectedName };
    }
    return resolutions.get(nameNode) ?? rejected(
      "The source name is outside the sealed C# target-name classification index.",
    );
  }

  let sealed: CsharpNamePlan | undefined;
  return Object.freeze({
    resolve,
    temporaryName(preferred: string): string {
      if (sealed !== undefined) throw new Error("C# source name analysis is sealed.");
      let name = preferred;
      while (sourceNames.has(name)) name = `_${name}`;
      sourceNames.add(name);
      return name;
    },
    seal(): CsharpNamePlan {
      sealed ??= Object.freeze({ reservedNames: Object.freeze([...sourceNames]),
        typeParameterNames: Object.freeze([...typeParameterNames]), resolve });
      return sealed;
    },
  });

  function visitNames(node: Node): void {
    if (host.ast.is.IsIdentifier(node)) {
      const sourceName = host.ast.text(node);
      const parent = host.ast.parent(node);
      const declaration = parent !== undefined && host.ast.is.IsTypeParameterDeclaration(parent) && host.ast.name(parent) === node
        ? parent : host.navigation.sourceReferenceFor(node)?.declaration;
      const typeParameter = declaration === undefined ? undefined : typeParameterResolutions.get(declaration);
      const name = tryCsharpIdentifier(typeParameter?.kind === "resolved" ? typeParameter.name : sourceName);
      if (name !== undefined) sourceNames.add(name);
      resolutions.set(
        node,
        name === undefined
          ? rejected(
              `Source name '${sourceName}' is not a valid C# identifier and has no explicit target-name policy.`,
            )
          : Object.freeze({ kind: "resolved", name }),
      );
    } else if (host.ast.is.IsPrivateIdentifier(node)) {
      privateNameNodes.add(node);
      const declaration = privateDeclarations.get(node);
      const name = declaration === undefined
        ? undefined
        : privateNames.get(declaration);
      resolutions.set(
        node,
        declaration === undefined
          ? rejected(
              "A JavaScript private identifier requires one exact project declaration before C# target-name allocation.",
            )
          : name === undefined
            ? rejected(
                "The selected JavaScript private declaration had no sealed C# target-name identity.",
              )
            : Object.freeze({ kind: "resolved", name }),
      );
    } else if (host.ast.is.IsComputedPropertyName(node)) {
      const selected = host.semanticsFor(node).propertyNames.get(node);
      const name = selected?.kind === "resolved" ? objectShapeMemberTargetName(selected.name) : undefined;
      if (name !== undefined) sourceNames.add(name);
      resolutions.set(node, name === undefined
        ? rejected("The computed source name has no admitted static C# field identity.")
        : Object.freeze({ kind: "resolved", name }));
    } else if ((host.ast.is.IsStringLiteral(node) || host.ast.is.IsNumericLiteral(node)) &&
      host.ast.name(host.ast.parent(node)) === node) {
      const sourceName = host.ast.is.IsNumericLiteral(node)
        ? host.semanticsFor(node).propertyNames.get(node)
        : ObjectLiteralProperty_SourceName(host.ast, host.ast.parent(node));
      const name = sourceName?.kind === "resolved" ? objectShapeMemberTargetName(sourceName.name) : undefined;
      if (name !== undefined) sourceNames.add(name);
      resolutions.set(node, name === undefined
        ? rejected("The literal source name has no exact C# field identity.")
        : Object.freeze({ kind: "resolved", name }));
    } else {
      resolutions.set(
        node,
        rejected(
          `Source name kind '${host.ast.kindName(node)}' has no direct C# declaration-name policy.`,
        ),
      );
    }
    host.ast.forEachChild(node, (child) => {
      if (child !== undefined) visitNames(child);
    });
  }
}

function exactPrivateDeclaration(
  host: CsharpSourceNameResolverHost,
  nameNode: Node,
  selectedDeclaration: Node | undefined,
): Node | undefined {
  const selectedCandidates = [
    selectedDeclaration,
    host.navigation.referenceFor(nameNode)?.declaration,
  ];
  const selected = selectedCandidates.find((candidate) => {
    if (
      candidate === undefined ||
      !host.navigation.isProjectDeclaration(candidate)
    ) {
      return false;
    }
    const declarationName = host.ast.name(candidate);
    return declarationName !== undefined && host.ast.is.IsPrivateIdentifier(declarationName);
  });
  if (selected !== undefined) {
    return selected;
  }
  const parent = host.ast.parent(nameNode);
  const parentName = host.ast.name(parent);
  return parent !== undefined &&
      host.navigation.isProjectDeclaration(parent) &&
      parentName !== undefined &&
      host.ast.is.IsPrivateIdentifier(parentName) &&
      sourceNodesEqual(host.ast, parentName, nameNode)
    ? parent
    : undefined;
}

function rejected(reason: string): CsharpSourceNameResolution {
  return { kind: "rejected", reason };
}
