import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { analyzeCsharpProjectEmission } from "../../../dist/analysis/project-types/emission.js";

test("project type emission queries checked reference syntax, never import containers", () => {
  // nextgen C-2542: the program goes through the Host; project emission reads TargetSourceProgramFacts (syntax + facts).
  const program = hostProgram('import type { Item as Model } from "./model.js"; export function keep(value: Model): Model { return value; }',
    { files: { "model.ts": "export class Item { value: number = 1; }" } });
  const source = Object.freeze({ syntax: program.ast, facts: program.facts, sourceFiles: program.files,
    sourceFacts: program.host.sourceFacts, documents: program.host.documents });
  const nodes = program.nodes;
  const selected = analyzeCsharpProjectEmission({ source, nodes,
    projectTypes: { definitionContainingDeclaration: () => undefined },
    factories: { classFactory: { get: () => undefined } },
    evidence: { providerVirtualDeclaration: { get: () => undefined } },
    names: { typeParameterNames: [] },
    projections: { genericProjection: { get: () => [] } },
  });
  assert.equal(selected.issues.length, 0, "checked type references are admitted before sealing");
  const clause = nodes.find(source.syntax.is.IsImportClause);
  assert.equal(clause !== undefined, true, "the source contains the exact formerly invalid checker query subject");
  assert.equal(selected.records.projectSourceReference.get(clause) === undefined, true, "an import container has no native type-reference occurrence");
  const typeReference = nodes.find(source.syntax.is.IsTypeReferenceNode);
  const declaration = selected.records.projectSourceReference.get(typeReference);
  assert.equal(declaration !== undefined, true, "the actual source type-reference occurrence retains its project declaration");
  assert.equal(source.syntax.text(source.syntax.name(declaration)), "Item", "aliasing preserves the exact declaration identity");
});
