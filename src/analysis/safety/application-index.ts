import type { CsharpSafetyApplication, CsharpSafetyApplicationFactIndex } from "../../target-model/records/storage/safety.js";
import type {
  AstReader,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { createTargetSafetyApplicationIndex } from "@tsonic/target-api/analysis";
import {
  readCsharpSourceSafetyBuilder,
  readCsharpSourceUnsafeContext,
} from "../../source/extension/explicit-safety.js";

export interface CsharpSafetyApplicationFactIndexInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly facts: SourceProgramFacts;
}

export function createCsharpSafetyApplicationFactIndex(
  input: CsharpSafetyApplicationFactIndexInput,
): CsharpSafetyApplicationFactIndex {
  const sourceFacts = input.sourceFacts;
  if (sourceFacts === undefined) {
    return emptyIndex;
  }
  const index = createTargetSafetyApplicationIndex({
    ast: input.ast,
    sourceFiles: input.sourceFiles,
    // The safety application index walks declarations through the published role model (request R-F5-B5).
    navigation: input.facts.navigation,
    readUnsafeContext: (subject) => readCsharpSourceUnsafeContext(sourceFacts, subject),
    readSafetyBuilder: (subject) => readCsharpSourceSafetyBuilder(sourceFacts, subject),
  });
  return Object.freeze({
    all: index.all,
    sourceSafetyApplication: Object.freeze({ get: index.forSourceFile }),
    safetyApplication: Object.freeze({ get: index.forDeclaration }),
    safetyOperation: Object.freeze({ get: index.operationForExpression }),
  });
}

const emptyApplications = Object.freeze([]) as readonly CsharpSafetyApplication[];
const emptyIndex: CsharpSafetyApplicationFactIndex = Object.freeze({
  all: emptyApplications,
  sourceSafetyApplication: Object.freeze({ get: () => emptyApplications }),
  safetyApplication: Object.freeze({ get: () => emptyApplications }),
  safetyOperation: Object.freeze({ get: () => undefined }),
});
