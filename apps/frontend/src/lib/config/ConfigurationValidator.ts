import { IConfigurationPropertySchema } from './ConfigurationSchema';

export class ConfigurationValidator {
  static validate(schema: IConfigurationPropertySchema, value: any): { valid: boolean; error?: string } {
    if (schema.validator) {
      const result = schema.validator(value);
      if (typeof result === 'string') {
        return { valid: false, error: result };
      }
      if (!result) {
        return { valid: false, error: 'Custom validation failed.' };
      }
    }

    switch (schema.type) {
      case 'boolean':
        if (typeof value !== 'boolean') return { valid: false, error: 'Value must be a boolean.' };
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) return { valid: false, error: 'Value must be a valid number.' };
        break;
      case 'string':
      case 'color':
      case 'keybinding':
        if (typeof value !== 'string') return { valid: false, error: 'Value must be a string.' };
        break;
      case 'enum':
        if (!schema.enum?.includes(value)) {
          return { valid: false, error: `Value must be one of: ${schema.enum?.join(', ')}` };
        }
        break;
      case 'array':
        if (!Array.isArray(value)) return { valid: false, error: 'Value must be an array.' };
        break;
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { valid: false, error: 'Value must be a JSON object.' };
        }
        break;
    }

    return { valid: true };
  }
}
