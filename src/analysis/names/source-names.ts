import {
  createHash,
} from "node:crypto";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { AsBindingPattern, ObjectLiteralProperty_SourceName, sourceBindingWriteAtReference, sourceNodesEqual } from "@tsonic/target-api/source";
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
  seal(requiredBindingRoots: readonly Node[]): CsharpNamePlan;
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
  const callableTypeParameters = new Map<Node, readonly Node[]>();
  const bindings: { readonly declaration: Node; readonly name: Node; readonly root: Node; readonly iteration?: Node }[] = [];
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
      const parameters = csharpSourceTypeParameters(node, host.ast).filter((declaration): declaration is Node => declaration !== undefined);
      if (parameters.length > 0) callableTypeParameters.set(node, parameters);
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
  let sealedBindingRoots: ReadonlySet<Node> | undefined;
  return Object.freeze({
    resolve,
    temporaryName(preferred: string): string {
      if (sealed !== undefined) throw new Error("C# source name analysis is sealed.");
      let name = preferred;
      while (sourceNames.has(name)) name = `_${name}`;
      sourceNames.add(name);
      return name;
    },
    seal(requiredBindingRoots: readonly Node[]): CsharpNamePlan {
      const required = new Set<Node>();
      for (const root of requiredBindingRoots) {
        if (!resolutions.has(root)) throw new Error("A C# native binding root is outside the checked source name inventory.");
        required.add(root);
      }
      if (sealed !== undefined) {
        const previous = sealedBindingRoots;
        if (previous === undefined || previous.size !== required.size || [...required].some(root => !previous.has(root))) {
          throw new Error("C# source names are already sealed for a different native binding domain.");
        }
        return sealed;
      }
      const valueNames = new Map<Node, Set<string>>();
      for (const binding of bindings) {
        const retained = required.has(binding.root) || binding.iteration !== undefined && required.has(binding.iteration) ||
          host.navigation.referencesToDeclaration(binding.declaration).some(reference => {
            const write = sourceBindingWriteAtReference(host.ast, reference);
            return write !== undefined && required.has(write.operation);
          });
        if (!retained) continue;
        const name = resolutions.get(binding.name);
        if (name?.kind !== "resolved") continue;
        for (let owner = host.ast.parent(binding.declaration); owner !== undefined; owner = host.ast.parent(owner)) {
          if (!callableTypeParameters.has(owner)) continue;
          const names = valueNames.get(owner) ?? new Set<string>();
          names.add(name.name);
          valueNames.set(owner, names);
        }
      }
      for (const [owner, declarations] of callableTypeParameters) {
        const names = valueNames.get(owner);
        if (names === undefined) continue;
        for (const declaration of declarations) {
          const parameter = csharpSourceTypeParameter(declaration, host.ast);
          const originalName = parameter === undefined ? undefined : tryCsharpIdentifier(parameter.name);
          if (parameter === undefined || originalName === undefined || !names.has(originalName)) continue;
          let suffix = 1;
          while (sourceNames.has(`${parameter.name}${suffix}`)) suffix += 1;
          const name = `${parameter.name}${suffix}`;
          sourceNames.add(name);
          const selected = Object.freeze({ kind: "resolved" as const, name });
          const nameNode = host.ast.name(declaration);
          if (nameNode !== undefined) resolutions.set(nameNode, selected);
          for (const reference of host.navigation.referencesToDeclaration(declaration)) {
            if (host.ast.is.IsIdentifier(reference) && resolutions.has(reference)) resolutions.set(reference, selected);
          }
          typeParameterNames.push(Object.freeze({ identity: parameter.identity, name }));
        }
      }
      sealedBindingRoots = required;
      sealed = Object.freeze({ reservedNames: Object.freeze([...sourceNames]),
        typeParameterNames: Object.freeze([...typeParameterNames]), resolve });
      return sealed;
    },
  });

  function visitNames(node: Node): void {
    if (host.ast.is.IsIdentifier(node)) {
      const sourceName = host.ast.text(node);
      const parent = host.ast.parent(node);
      const name = tryCsharpIdentifier(sourceName);
      if (parent !== undefined && host.ast.name(parent) === node &&
        (host.ast.is.IsParameterDeclaration(parent) || host.ast.is.IsVariableDeclaration(parent) ||
          host.ast.is.IsBindingElement(parent) || host.ast.is.IsFunctionDeclaration(parent))) {
        let root: Node | undefined = parent;
        while (root !== undefined && host.ast.is.IsBindingElement(root)) {
          const pattern = host.ast.parent(root);
          root = AsBindingPattern(host.ast, pattern) === undefined ? undefined : host.ast.parent(pattern);
        }
        if (root !== undefined && (host.ast.is.IsParameterDeclaration(root) || host.ast.is.IsVariableDeclaration(root) ||
          host.ast.is.IsFunctionDeclaration(root))) {
          const list = host.ast.parent(root);
          const owner = list === undefined ? undefined : host.ast.parent(list);
          const iteration = list !== undefined && host.ast.is.IsVariableDeclarationList(list) && owner !== undefined &&
            (host.ast.is.IsForOfStatement(owner) || host.ast.is.IsForInStatement(owner)) &&
            host.ast.as.AsForInOrOfStatement(owner)?.Initializer === list ? owner : undefined;
          bindings.push({ declaration: parent, name: node, root, ...(iteration === undefined ? {} : { iteration }) });
        }
      }
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
