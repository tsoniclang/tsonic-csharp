import {
  createHash,
} from "node:crypto";
import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  sourceNodesEqual,
} from "@tsonic/target-api";
import type {
  SourceProgramNavigation,
} from "@tsonic/target-api";
import {
  tryCsharpIdentifier,
} from "../../csharp-identifiers.js";
import type {
  CsharpSourceOutputIdentityPlanner,
} from "../artifacts/index.js";

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
  readonly outputIdentities: CsharpSourceOutputIdentityPlanner;
}

export function createCsharpSourceNameResolver(
  host: CsharpSourceNameResolverHost,
): CsharpSourceNameResolver {
  const privateNames = new WeakMap<Node, string>();

  function resolve(
    nameNode: Node | undefined,
    selectedDeclaration?: Node,
  ): CsharpSourceNameResolution {
    if (nameNode === undefined) {
      return rejected("The source declaration has no name node.");
    }
    if (host.ast.is.IsIdentifier(nameNode)) {
      const name = tryCsharpIdentifier(host.ast.text(nameNode));
      return name === undefined
        ? rejected(
            `Source name '${host.ast.text(nameNode)}' is not a valid C# identifier and has no explicit target-name policy.`,
          )
        : { kind: "resolved", name };
    }
    if (!host.ast.is.IsPrivateIdentifier(nameNode)) {
      return rejected(
        `Source name kind '${host.ast.kindName(nameNode)}' has no direct C# declaration-name policy.`,
      );
    }
    const declaration = exactPrivateDeclaration(
      host,
      nameNode,
      selectedDeclaration,
    );
    if (declaration === undefined) {
      return rejected(
        "A JavaScript private identifier requires one exact project declaration before C# target-name allocation.",
      );
    }
    const existing = privateNames.get(declaration);
    if (existing !== undefined) {
      return { kind: "resolved", name: existing };
    }
    const sourceFile = host.ast.getSourceFile(declaration);
    if (sourceFile === undefined) {
      return rejected(
        "The selected JavaScript private declaration has no checked source-file identity.",
      );
    }
    const outputIdentity = host.outputIdentities.resolveRequired(
      host.ast.getFileName(sourceFile),
    );
    const declarationKind = host.ast.kind(declaration);
    if (declarationKind === undefined) {
      return rejected(
        "The selected JavaScript private declaration has no exact AST kind.",
      );
    }
    const identity = [
      outputIdentity.artifactPath,
      declarationKind,
      host.ast.pos(declaration),
      host.ast.end(declaration),
    ].join("\u0000");
    const name = `__tsonic_private_${
      createHash("sha256").update(identity).digest("hex")
    }`;
    privateNames.set(declaration, name);
    return { kind: "resolved", name };
  }

  return Object.freeze({ resolve });
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
