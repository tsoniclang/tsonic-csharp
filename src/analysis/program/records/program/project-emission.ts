import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeDefinition } from "../../../../target-model/records/types/project-types.js";
import type { CsharpProjectEmissionRecords, CsharpProjectSourceType } from "../../../../target-model/records/program/project-emission.js";

export function createCsharpProjectEmissionProducer() {
  let open = true;
  const declarations = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const references = new WeakMap<Node, Node>();
  const types = new WeakMap<Node, CsharpProjectSourceType>();
  const typeParameterNames = new WeakMap<Node, readonly (readonly [string, string])[]>();
  const requireOpen = (node: Node): void => {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native project emission is written only before its seal.", node);
  };
  return Object.freeze({
    names(node: Node, value: readonly (readonly [string, string])[]): void {
      requireOpen(node);
      if (typeParameterNames.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native project generic scope has one naming owner.", node);
      typeParameterNames.set(node, Object.freeze(value));
    },
    declaration(node: Node, value: CsharpProjectTypeDefinition): void {
      requireOpen(node);
      if (declarations.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native project declaration has one source owner.", node);
      declarations.set(node, value);
    },
    reference(node: Node, declaration: Node): void {
      requireOpen(node);
      if (references.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native source type reference has one checked identity.", node);
      references.set(node, declaration);
    },
    type(node: Node, value: CsharpProjectSourceType): void {
      requireOpen(node);
      if (types.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native source type has one emitted identity.", node);
      types.set(node, Object.freeze(value));
    },
    seal(): CsharpProjectEmissionRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native project emission seals exactly once.");
      open = false;
      return Object.freeze({ projectTypeParameterNames: Object.freeze({ get: (node: Node) => typeParameterNames.get(node) }),
        projectDeclaration: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : declarations.get(node) }),
        projectSourceReference: Object.freeze({ get: (node: Node) => references.get(node) }),
        projectSourceType: Object.freeze({ get: (node: Node) => types.get(node) }) });
    },
  });
}
