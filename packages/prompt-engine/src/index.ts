import Handlebars from 'handlebars';
import { z } from 'zod';

export interface PromptTemplate<TContext, TOutput> {
  id: string;
  templateString: string;
  schema: z.ZodSchema<TOutput>;
}

export class PromptEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  registerTemplate<T, O>(prompt: PromptTemplate<T, O>) {
    const compiled = Handlebars.compile(prompt.templateString);
    this.templates.set(prompt.id, compiled);
  }

  render<T>(id: string, context: T): string {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Template not found: ${id}`);
    return template(context);
  }

  parseOutput<O>(id: string, rawOutput: string, schema: z.ZodSchema<O>): O {
    // Attempt to extract JSON from markdown fences if necessary
    const jsonMatch = rawOutput.match(/```json\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawOutput;
    
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  }
}
