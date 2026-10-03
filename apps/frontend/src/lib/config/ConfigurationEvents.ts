export enum ConfigurationEvents {
  BeforeConfigurationChanged = 'config:beforeChanged',
  ConfigurationValidated = 'config:validated',
  ConfigurationChanged = 'config:changed',
  ConfigurationPersisted = 'config:persisted',

  ThemeChanged = 'theme:changed',
  ProfileChanged = 'profile:changed',
  WorkspaceSettingsChanged = 'workspaceSettings:changed',
  MachineSettingsChanged = 'machineSettings:changed',
  
  SettingsImported = 'settings:imported',
  SettingsExported = 'settings:exported',
}
