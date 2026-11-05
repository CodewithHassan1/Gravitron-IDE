import { AIMessagePayload } from '../../platform/ai/AIProvider';

export interface ConversationNode {
  id: string;
  parentId: string | null;
  message: AIMessagePayload;
  childrenIds: string[];
}

export class ConversationTree {
  public id: string;
  public nodes: Map<string, ConversationNode> = new Map();
  public rootId: string | null = null;

  constructor(id: string) {
    this.id = id;
  }

  addNode(message: AIMessagePayload, parentId: string | null = null): ConversationNode {
    const id = crypto.randomUUID();
    const node: ConversationNode = { id, parentId, message, childrenIds: [] };

    this.nodes.set(id, node);

    if (parentId) {
      const parent = this.nodes.get(parentId);
      if (parent) parent.childrenIds.push(id);
    } else if (!this.rootId) {
      this.rootId = id;
    }

    return node;
  }
}

export class ConversationNavigator {
  /**
   * Retrieves the linear path of messages from the root to the specified leaf node.
   */
  static getActivePath(tree: ConversationTree, leafId: string): AIMessagePayload[] {
    const path: AIMessagePayload[] = [];
    let currentId: string | null = leafId;

    while (currentId) {
      const node = tree.nodes.get(currentId);
      if (!node) break;
      path.unshift(node.message);
      currentId = node.parentId;
    }

    return path;
  }
}
