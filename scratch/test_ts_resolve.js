const fs = require('fs');
const path = require('path');
const tmpDir = path.resolve('scratch/test_ts_resolve');
fs.mkdirSync(path.join(tmpDir, 'node_modules/@ag/proto/dist/gen/ts/auth/v1'), { recursive: true });
fs.mkdirSync(path.join(tmpDir, 'node_modules/@ag/proto/gen/ts/auth/v1'), { recursive: true });

fs.writeFileSync(
  path.join(tmpDir, 'node_modules/@ag/proto/package.json'),
  JSON.stringify(
    {
      name: '@ag/proto',
      version: '1.0.0',
      main: 'dist/index.js',
      types: 'src/index.ts',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
        './gen/*.js': {
          types: './dist/gen/*.d.ts',
          default: './dist/gen/*.js',
        },
        './gen/*': {
          types: './dist/gen/*.d.ts',
          default: './dist/gen/*.js',
        },
      },
    },
    null,
    2
  )
);

// In the monorepo, gen/ts/auth/v1/auth_connect.ts is generated source
fs.writeFileSync(
  path.join(tmpDir, 'node_modules/@ag/proto/gen/ts/auth/v1/auth_connect.ts'),
  'export const AuthService = { name: "AuthService" };\n'
);
fs.writeFileSync(
  path.join(tmpDir, 'node_modules/@ag/proto/dist/gen/ts/auth/v1/auth_connect.d.ts'),
  'export declare const AuthService: { readonly name: string };\n'
);
fs.writeFileSync(
  path.join(tmpDir, 'node_modules/@ag/proto/dist/gen/ts/auth/v1/auth_connect.js'),
  'exports.AuthService = { name: "AuthService" };\n'
);

// Test 1: Monorepo config (CommonJS + node)
fs.writeFileSync(
  path.join(tmpDir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2022',
        module: 'commonjs',
        moduleResolution: 'node',
        strict: true,
      },
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(tmpDir, 'test.ts'),
  'import { AuthService } from "@ag/proto/gen/ts/auth/v1/auth_connect"; console.log(AuthService.name);\n'
);

const { execSync } = require('child_process');
try {
  const out = execSync('npx tsc --noEmit', { cwd: tmpDir, encoding: 'utf8' });
  console.log('Test 1 (monorepo config - CommonJS/node) TSC SUCCESS:', out || '(clean exit 0)');
} catch (e) {
  console.log('Test 1 (monorepo config - CommonJS/node) TSC ERROR:', e.stdout, e.stderr);
}

// Test 2: Node runtime execution (evaluating compiled test.js)
fs.writeFileSync(
  path.join(tmpDir, 'test.js'),
  'const { AuthService } = require("@ag/proto/gen/ts/auth/v1/auth_connect"); console.log("NODE RUNTIME SUCCESS:", AuthService.name);\n'
);
try {
  const out = execSync('node test.js', { cwd: tmpDir, encoding: 'utf8' });
  console.log(out.trim());
} catch (e) {
  console.log('NODE RUNTIME ERROR:', e.stdout, e.stderr);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
