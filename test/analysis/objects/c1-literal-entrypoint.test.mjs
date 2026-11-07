// Object-literal shape entrypoints (nextgen C-2542, I2, C-2479). The shape registry has no checker-Type entrypoint:
// a literal's shape is the .NET shape of its Host construction (facts.values.type(literal).construction ?? type),
// represented by the one mapping (I6).
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createCsharpTypeParameterEnvironment, isCsharpRepresented } from "../../../dist/representation/index.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";

function fixture() {
  const program = hostProgram("interface Options { value: number; } export const value: Options = { value: 1 };");
  const literal = program.nodes.find(node => program.ast.is.IsObjectLiteralExpression(node));
  assert.equal(literal !== undefined, true, "the original authored allocation is retained");
  const reads = [];
  const values = Object.freeze({ ...program.facts.values, type: node => {
    reads.push(node);
    return program.facts.values.type(node);
  } });
  const facts = Object.freeze({ ...program.facts, values });
  const services = representationServices(program, { facts });
  const unexpected = () => assert.fail("a literal shape request reads Host facts only");
  const policy = createCsharpObjectShapePolicy({
    ast: program.ast,
    sourceStorage: new Proxy({}, { get: unexpected }),
    projectTypeCatalog: services.projectTypes,
    typeParameterConstraints: createCsharpTypeParameterEnvironment(unexpected),
    representation: () => services,
  });
  return { program, policy, literal, reads, services };
}

test("the shape registry exposes no checker-Type entrypoint (I2)", () => {
  const { policy } = fixture();
  assert.equal(typeof policy.resolveType, "undefined", "no raw-Type shape endpoint");
  assert.equal(typeof policy.resolveTypeWithState, "undefined", "no checked structural endpoint");
});

test("a literal's shape is the represented Host construction of that literal, read from facts.values", () => {
  const { program, policy, literal, reads, services } = fixture();
  const outcome = program.facts.values.type(literal);
  assert.notEqual(outcome.kind, "refused", "the Host publishes the literal's construction");
  const carrier = representations(services).type(outcome.construction ?? outcome.type, literal, "storage");
  assert.equal(isCsharpRepresented(carrier), true);
  reads.length = 0;
  const shape = policy.resolveNode(literal);
  assert.equal(reads.includes(literal), true, "the registry reads the Host fact of the literal itself");
  assert.equal(shape !== undefined && targetTypeRefEquals(shape.targetType, carrier), true,
    "the shape is the .NET type of the Host construction, not a type rebuilt from the destination");
});

test("opposite: a node without an object construction has no literal shape", () => {
  const { program, policy } = fixture();
  const one = program.nodes.find(node => program.ast.is.IsNumericLiteral(node));
  assert.equal(policy.resolveNode(one), undefined, "a number value has no object shape");
});
