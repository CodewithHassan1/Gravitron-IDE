export abstract class ContextExpression {
  abstract evaluate(context: Map<string, any>): boolean;

  static parse(expression: string): ContextExpression {
    if (!expression || !expression.trim()) {
      return new TrueExpression();
    }

    // Simple parsing for AND, OR, NOT, ==, !=, >, <
    // We'll split by || first, then &&
    const orGroups = expression.split('||').map((s) => s.trim());

    if (orGroups.length > 1) {
      return new OrExpression(orGroups.map((g) => this.parse(g)));
    }

    const andGroups = expression.split('&&').map((s) => s.trim());
    if (andGroups.length > 1) {
      return new AndExpression(andGroups.map((g) => this.parse(g)));
    }

    // Single condition
    let condition = expression.trim();
    if (condition.startsWith('!')) {
      return new NotExpression(this.parse(condition.substring(1)));
    }

    // Check for operators: ==, !=, >, <, >=, <=
    const match = condition.match(/^([\w\.]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
    if (match) {
      const [, key, op, valueStr] = match;
      let value: any = valueStr.trim();

      // Basic type parsing
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value))) value = Number(value);
      else if (value.startsWith('"') && value.endsWith('"'))
        value = value.substring(1, value.length - 1);
      else if (value.startsWith("'") && value.endsWith("'"))
        value = value.substring(1, value.length - 1);

      return new OperatorExpression(key, op, value);
    }

    // Bare key (truthy check)
    return new KeyExpression(condition);
  }
}

export class TrueExpression extends ContextExpression {
  evaluate() {
    return true;
  }
}

export class FalseExpression extends ContextExpression {
  evaluate() {
    return false;
  }
}

export class OrExpression extends ContextExpression {
  constructor(public exprs: ContextExpression[]) {
    super();
  }
  evaluate(context: Map<string, any>) {
    return this.exprs.some((e) => e.evaluate(context));
  }
}

export class AndExpression extends ContextExpression {
  constructor(public exprs: ContextExpression[]) {
    super();
  }
  evaluate(context: Map<string, any>) {
    return this.exprs.every((e) => e.evaluate(context));
  }
}

export class NotExpression extends ContextExpression {
  constructor(public expr: ContextExpression) {
    super();
  }
  evaluate(context: Map<string, any>) {
    return !this.expr.evaluate(context);
  }
}

export class KeyExpression extends ContextExpression {
  constructor(public key: string) {
    super();
  }
  evaluate(context: Map<string, any>) {
    return !!context.get(this.key);
  }
}

export class OperatorExpression extends ContextExpression {
  constructor(
    public key: string,
    public op: string,
    public value: any
  ) {
    super();
  }

  evaluate(context: Map<string, any>) {
    const ctxVal = context.get(this.key);
    switch (this.op) {
      case '==':
        return ctxVal === this.value;
      case '!=':
        return ctxVal !== this.value;
      case '>':
        return ctxVal > this.value;
      case '<':
        return ctxVal < this.value;
      case '>=':
        return ctxVal >= this.value;
      case '<=':
        return ctxVal <= this.value;
      default:
        return false;
    }
  }
}
