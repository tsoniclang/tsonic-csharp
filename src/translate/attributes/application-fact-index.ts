import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import {
  tsonicAttributeBuilderFactKey,
  type TsonicAttributeApplicationFact,
} from "@tsonic/source-core";

export interface CsharpAttributeApplicationFactIndex {
  readonly all: readonly TsonicAttributeApplicationFact[];
  forSourceFile(sourceFile: SourceFile): readonly TsonicAttributeApplicationFact[];
}

export interface CsharpAttributeApplicationFactIndexInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
}

export function createCsharpAttributeApplicationFactIndex(
  input: CsharpAttributeApplicationFactIndexInput,
): CsharpAttributeApplicationFactIndex {
  if (input.sourceFacts === undefined) {
    return emptyAttributeApplicationFactIndex;
  }
  const all: TsonicAttributeApplicationFact[] = [];
  const bySourceFile = new Map<SourceFile, readonly TsonicAttributeApplicationFact[]>();
  for (const sourceFile of input.sourceFiles) {
    const facts = collectSourceFileAttributeApplications(
      sourceFile,
      input.ast,
      input.sourceFacts,
    );
    bySourceFile.set(sourceFile, facts);
    all.push(...facts);
  }
  const frozenAll = Object.freeze(all);
  return Object.freeze({
    all: frozenAll,
    forSourceFile(sourceFile: SourceFile): readonly TsonicAttributeApplicationFact[] {
      return bySourceFile.get(sourceFile) ?? emptyAttributeApplications;
    },
  });
}

function collectSourceFileAttributeApplications(
  sourceFile: SourceFile,
  ast: AstReader,
  sourceFacts: ReadonlySourceFactResolver,
): readonly TsonicAttributeApplicationFact[] {
  const facts: TsonicAttributeApplicationFact[] = [];
  const pending: Node[] = [sourceFile];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    const fact = sourceFacts.getFact(node, tsonicAttributeBuilderFactKey);
    if (fact?.kind === "application") {
      facts.push(fact);
    }
    const children: Node[] = [];
    ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        children.push(child);
      }
    });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
  return Object.freeze(facts);
}

const emptyAttributeApplications = Object.freeze([]) as readonly TsonicAttributeApplicationFact[];

const emptyAttributeApplicationFactIndex: CsharpAttributeApplicationFactIndex = Object.freeze({
  all: emptyAttributeApplications,
  forSourceFile(): readonly TsonicAttributeApplicationFact[] {
    return emptyAttributeApplications;
  },
});
