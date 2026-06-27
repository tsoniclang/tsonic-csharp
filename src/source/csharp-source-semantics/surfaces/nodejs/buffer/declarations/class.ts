import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeBufferExportName,
  nodeBufferTargetType,
} from "../identities.js";
import {
  nodeBufferInstanceMemberDeclarations,
} from "./instance-members.js";
import {
  nodeBufferStaticMemberDeclarations,
} from "./static-members.js";

export function nodeBufferClassExport(): ProviderExportDeclaration {
  return {
    id: "node:buffer.Buffer",
    name: nodeBufferExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: nodeBufferTargetType.id,
      displayName: "Tsonic.CSharp.Node.Buffer",
    },
    members: [
      ...nodeBufferStaticMemberDeclarations(),
      ...nodeBufferInstanceMemberDeclarations(),
    ],
  };
}
