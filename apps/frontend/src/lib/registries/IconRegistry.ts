import React from 'react';
import {
  FileIcon,
  FolderIcon,
  FolderOpen,
  FileCode,
  FileText,
  Image,
  FileJson,
  TerminalSquare,
  GitBranch,
  FileCode2,
} from 'lucide-react';

export interface IconDefinition {
  id: string;
  match: (name: string, isDirectory: boolean, expanded?: boolean) => boolean;
  component: React.ComponentType<any>;
  priority: number;
}

class IconRegistryImpl {
  private icons: IconDefinition[] = [];

  register(icon: IconDefinition) {
    this.icons.push(icon);
    this.icons.sort((a, b) => b.priority - a.priority); // Highest priority first
  }

  getIcon(name: string, isDirectory: boolean, expanded?: boolean): React.ComponentType<any> {
    for (const icon of this.icons) {
      if (icon.match(name, isDirectory, expanded)) {
        return icon.component;
      }
    }
    // Fallbacks
    return isDirectory ? (expanded ? FolderOpen : FolderIcon) : FileIcon;
  }
}

export const IconRegistry = new IconRegistryImpl();

// Default registrations
IconRegistry.register({
  id: 'ts-icon',
  match: (name, isDirectory) => !isDirectory && (name.endsWith('.ts') || name.endsWith('.tsx')),
  component: FileCode,
  priority: 10,
});

IconRegistry.register({
  id: 'js-icon',
  match: (name, isDirectory) => !isDirectory && (name.endsWith('.js') || name.endsWith('.jsx')),
  component: FileCode2,
  priority: 10,
});

IconRegistry.register({
  id: 'json-icon',
  match: (name, isDirectory) => !isDirectory && name.endsWith('.json'),
  component: FileJson,
  priority: 10,
});

IconRegistry.register({
  id: 'md-icon',
  match: (name, isDirectory) => !isDirectory && name.endsWith('.md'),
  component: FileText,
  priority: 10,
});

IconRegistry.register({
  id: 'png-icon',
  match: (name, isDirectory) =>
    !isDirectory && (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')),
  component: Image,
  priority: 10,
});

IconRegistry.register({
  id: 'terminal-icon',
  match: (name, isDirectory) => !isDirectory && (name === 'Terminal' || name.endsWith('.sh')),
  component: TerminalSquare,
  priority: 10,
});

IconRegistry.register({
  id: 'git-icon',
  match: (name, isDirectory) => !isDirectory && name === '.gitignore',
  component: GitBranch,
  priority: 10,
});

const customSvgIcons: Record<string, string> = {
  node_modules: '01_node_modules.svg',
  '.agents': '02_.agents.svg',
  skills: '03_skills.svg',
  mcp: '04_mcp.svg',
  prompts: '05_prompts.svg',
  tasks: '06_tasks.svg',
  artifacts: '07_artifacts.svg',
  '.vscode': '08_.vscode.svg',
  '.github': '09_.github.svg',
  src: '10_src.svg',
  app: '11_app.svg',
  assets: '12_assets.svg',
  styles: '14_styles.svg',
  public: '15_public.svg',
  tests: '17_tests.svg',
  __tests__: '17_tests.svg',
  test: '17_tests.svg',
  api: '21_api.svg',
  logs: '42_logs.svg',
  modules: '57_modules.svg',
  nginx: '69_nginx.svg',
  apache: '70_apache.svg',
  deploy: '72_deploy.svg',
  deployments: '73_deployments.svg',
  environment: '74_environment.svg',
  env: '74_environment.svg',
  '.env': '74_environment.svg',
  media: '98_media.svg',
  audio: '100_audio.svg',
  fixtures: '104_fixtures.svg',
  coverage: '105_coverage.svg',
  snapshots: '107_ snapshot.svg',
  __snapshots__: '107_ snapshot.svg',
  webpack: '110_webpack.svg',
  '.eslintrc': '113_eslint.svg',
  '.eslintrc.js': '113_eslint.svg',
  '.eslintrc.json': '113_eslint.svg',
  secrets: '125_secrets.svg',
  monitoring: '126_monitoring.svg',
  analytics: '127_analytics.svg',
  notifications: '128_notifications.svg',
  routes: 'routes.svg',
};

Object.entries(customSvgIcons).forEach(([name, filename]) => {
  IconRegistry.register({
    id: `custom-icon-${name}`,
    match: (itemName, isDirectory) => itemName.toLowerCase() === name.toLowerCase(),
    component: ({ className }) =>
      React.createElement('img', {
        src: `/icons/${filename}`,
        className,
        style: { objectFit: 'contain', margin: 0, background: 'transparent' },
        alt: `${name} icon`,
      }),
    priority: 20,
  });
});
