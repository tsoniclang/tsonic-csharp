import type {
  ProviderMemberDeclaration,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type { DotnetExportDeclaration } from "../model.js";
import { tryDotnetTypeRefToProviderType } from "../model.js";
import { dotnetSignatureToProviderSignature } from "./signatures.js";

export function dotnetExportToNamespaceMember(declaration: DotnetExportDeclaration): ProviderMemberDeclaration | undefined {
  switch (declaration.kind) {
    case "type": {
      const sourceType = declaration.sourceShape === undefined
        ? undefined
        : tryDotnetTypeRefToProviderType(declaration.sourceShape, `${declaration.targetId}.sourceShape`);
      if (sourceType === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: sourceType,
      };
    }
    case "function": {
      const signatures = declaration.signatures
        .map((signature) => dotnetSignatureToProviderSignature(signature))
        .filter((signature): signature is ProviderSignatureDeclaration => signature !== undefined);
      if (signatures.length === 0) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "method",
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type, `${declaration.targetId}.type`);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type,
      };
    }
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: { kind: "object" },
      };
  }
}
