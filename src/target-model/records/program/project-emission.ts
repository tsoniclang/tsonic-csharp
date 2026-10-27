import type { Node } from "@tsonic/tsts";
import type { CsharpProjectTypeDefinition } from "../types/project-types.js";

export interface CsharpProjectSourceType {
  readonly name: Node | undefined;
  readonly scopeName: string | undefined;
}

export interface CsharpProjectEmissionRecords {
  readonly projectTypeParameterNames: { readonly get: (node: Node) => readonly (readonly [string, string])[] | undefined };
  readonly projectDeclaration: { readonly get: (node: Node | undefined) => CsharpProjectTypeDefinition | undefined };
  readonly projectSourceReference: { readonly get: (node: Node) => Node | undefined };
  readonly projectSourceType: { readonly get: (node: Node) => CsharpProjectSourceType | undefined };
}
