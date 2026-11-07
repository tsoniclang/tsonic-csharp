// The deleted resolution/source-evidence.ts listed the fact subjects of a reference (the node, then the declaration
// it selects) so extension facts on the declaration reached its references. The Host role model now publishes the
// referenced declaration (facts.navigation.identity.target), and the value of a reference is the Host descriptor that
// already carries the declaration's markers (nextgen C-2542 §2, R2, I2).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const sourceText = `
import type { int64 } from "@tsonic/core/types.js";
export const limit: int64 = 5n;
export function read(): int64 { return limit; }
export function size(text: string): number { return text.length; }
`;

test("a project reference selects its exact declaration, with its file and project role", () => {
  const program = hostProgram(sourceText);
  const declaration = program.named("limit");
  const reference = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "limit" &&
    program.ast.is.IsReturnStatement(program.ast.parent(node)));
  const target = program.facts.navigation.identity.target(reference);
  assert.equal(target?.declaration === declaration, true, "the declaration-only selection is the authored declaration");
  assert.equal(target.project === true && target.sourceFile === program.ast.getSourceFile(declaration), true);
  assert.equal(Object.isFrozen(target), true);
});

test("a reference to a library declaration is selected without a project role", () => {
  const program = hostProgram(sourceText);
  const access = program.nodes.find(node => program.ast.is.IsPropertyAccessExpression(node) && program.ast.text(node) === "text.length");
  const target = program.facts.navigation.identity.target(program.ast.name(access));
  assert.equal(target !== undefined && target.project === false, true, "String.length is declared outside the project");
  assert.equal(program.facts.navigation.identity.isProjectDeclaration(target.declaration), false);
});

test("the declaration's native-width marker reaches its reference through the Host descriptor", () => {
  const program = hostProgram(sourceText);
  const at = representations(representationServices(program));
  const reference = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "limit" &&
    program.ast.is.IsReturnStatement(program.ast.parent(node)));
  const int64 = csharpSourcePrimitiveTargetType("int64");
  assert.equal(targetTypeRefEquals(represented(at.slot(program.named("limit"))), int64), true);
  assert.equal(targetTypeRefEquals(represented(at.value(reference)), int64), true,
    "the reference reads the declaration's int64, not an erased number or bigint");
});
