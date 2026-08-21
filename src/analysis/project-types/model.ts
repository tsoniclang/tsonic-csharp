import type { Node } from "@tsonic/tsts";
import type {
  CsharpProjectForwardingConstructor,
  CsharpProjectTypeDefinition,
  CsharpProjectTypeHeritage,
  CsharpProjectTypeIssue,
} from "../../policy/types/index.js";

export interface CsharpProjectTypeClassifications {
  readonly issues: readonly CsharpProjectTypeIssue[];
  definitionContainingDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  heritageForDeclaration(
    declaration: Node,
  ): CsharpProjectTypeHeritage | undefined;
  implicitConstructorsForDeclaration(
    declaration: Node,
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
}
