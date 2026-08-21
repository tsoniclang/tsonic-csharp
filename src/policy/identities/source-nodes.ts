import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  projectSourceNodeIdentity,
} from "@tsonic/target-api/source";

export interface CsharpSourceIdentityPolicy {
  node(node: Node | undefined): string | undefined;
}

export function createCsharpSourceIdentityPolicy(
  ast: AstReader,
  projectRoot: string,
): CsharpSourceIdentityPolicy {
  return Object.freeze({
    node(node: Node | undefined): string | undefined {
      return projectSourceNodeIdentity(ast, node, projectRoot);
    },
  });
}
