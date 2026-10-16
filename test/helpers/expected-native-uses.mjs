import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpExpectedTypes } from "../../dist/analysis/expected-types/analyze.js";

export function createExpectedNativeUseOwner(compiled) {
  const program = compiled.result.program;
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const contracts = nodes.flatMap(node => {
    const declared = records.returnContract.get(node);
    const returnType = records.generatorTargetType.get(node) ?? (declared?.kind === "resolved" ? declared.type : undefined);
    return returnType === undefined ? [] : [{ sourceDeclaration: node, returnType }];
  });
  const policy = { ast, sourceFiles: program.sourceFiles,
    literalValues: analyzeSourceLiteralValues(ast, program.sourceFiles),
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode,
    typeDefinitions: program.typeDefinitions };
  const input = { policy, evidence: records, operations: records, objectShapes: program.objectShapes,
    callables: { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    valueReadStages: { get: node => {
      const read = records.valueRead.get(node);
      return read === undefined ? undefined : {
        literalTarget: read.selectedOperation ?? read.source,
        operationValue: read.selectedOperation ?? read.source,
      };
    } }, declarations: records };
  const analysis = analyzeCsharpExpectedTypes(policy, records, records, input.objectShapes,
    input.callables, input.valueReadStages, records);
  return { analysis, input, program, source, nodes };
}
