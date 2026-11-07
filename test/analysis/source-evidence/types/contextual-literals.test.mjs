// Empty literals in a typed context (nextgen C-2542). The Host publishes the contextual type of an empty literal
// (facts.values.type); C# has no contextual-carrier chooser of its own. The literal's carrier is the one mapping of
// that published type (I6), so it is the exact sibling collection carrier of its slot and never a scalar invention.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const sourceText = `
  import type { uint64 } from "@tsonic/core/types.js";
  const texts: string[] = [];
  const wide: uint64[] = [];
  const frozen: readonly uint64[] = [];
  const unit: [] = [];
  const filled: uint64[] = [1 as uint64];
`;

for (const surface of ["native", "js"]) {
  test(`${surface}: an empty literal is represented with its slot's exact collection carrier`, () => {
    const program = hostProgram(sourceText, { surface });
    const represent = representations(representationServices(program, { profile: surface }));
    for (const name of ["texts", "wide", "frozen", "unit"]) {
      const declaration = program.named(name, node => program.ast.is.IsVariableDeclaration(node));
      const literal = program.nodes.find(node => program.ast.is.IsArrayLiteralExpression(node) && program.ast.parent(node) === declaration);
      assert.equal(program.ast.elements(literal).length, 0, name);
      const carrier = represented(represent.value(literal));
      assert.equal(targetTypeRefEquals(carrier, represented(represent.slot(declaration))), true,
        `${name}: the published contextual type keeps the sibling carrier and native element width`);
      if (name === "unit") assert.equal(carrier.kind === "tuple" && carrier.elements.length === 0, true,
        "an empty tuple context stays an empty tuple, never a scalar or collection");
      else assert.notEqual(carrier.kind, "source-primitive", `${name}: no scalar is invented`);
    }
    const filled = program.named("filled", node => program.ast.is.IsVariableDeclaration(node));
    const nonempty = program.nodes.find(node => program.ast.is.IsArrayLiteralExpression(node) && program.ast.parent(node) === filled);
    assert.equal(program.type(nonempty).kind, "array", "a nonempty literal has its own Host publication, not a contextual default");
  });
}
