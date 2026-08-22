import {
  createHash,
} from "node:crypto";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import {
  tryCsharpIdentifier,
} from "../../target-model/names/identifiers.js";
import type {
  CsharpSourceIdentityPolicy,
} from "../../policy/identities/source-nodes.js";

export type CsharpSourceNameResolution =
  | { readonly kind: "resolved"; readonly name: string }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpSourceNameResolver {
  resolve(
    nameNode: Node | undefined,
    selectedDeclaration?: Node,
  ): CsharpSourceNameResolution;
}

export interface CsharpSourceNameResolverHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
}

export function createCsharpSourceNameResolver(
  host: CsharpSourceNameResolverHost,
): CsharpSourceNameResolver {
  const privateNames = new WeakMap<Node, string>();
  const privateDeclarations = new WeakMap<Node, Node>();
  const privateNameNodes = new WeakSet<Node>();
  const resolutions = new WeakMap<Node, CsharpSourceNameResolution>();

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
    return name;
  };

  const visit = (node: Node): void => {
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

  return Object.freeze({ resolve });

  function visitNames(node: Node): void {
    if (host.ast.is.IsIdentifier(node)) {
      const sourceName = host.ast.text(node);
      const name = tryCsharpIdentifier(sourceName);
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
    return host.ast.is.IsPrivateIdentifier(declarationName);
  });
  if (selected !== undefined) {
    return selected;
  }
  const parent = host.ast.parent(nameNode);
  const parentName = host.ast.name(parent);
  return parent !== undefined &&
      host.navigation.isProjectDeclaration(parent) &&
      host.ast.is.IsPrivateIdentifier(parentName) &&
      sourceNodesEqual(host.ast, parentName, nameNode)
    ? parent
    : undefined;
}

function rejected(reason: string): CsharpSourceNameResolution {
  return { kind: "rejected", reason };
}
