import { IndexServiceImpl } from '../search/IndexService';
import { SettingsRegistry } from '../../lib/registries/SettingsRegistry';

export class SettingsSearchProvider {
  constructor(private readonly indexService: IndexServiceImpl) {}

  registerSettingsToIndex() {
    const properties = SettingsRegistry.getAllProperties();
    properties.forEach((prop) => {
      // Reuse the fuzzy engine / indexing service for settings
      // Example implementation integrating with a theoretical indexService API:
      // this.indexService.addDocument({
      //   id: prop.id,
      //   type: 'setting',
      //   content: `${prop.title} ${prop.description} ${prop.tags?.join(' ')} ${prop.category}`
      // });
    });
  }
}
