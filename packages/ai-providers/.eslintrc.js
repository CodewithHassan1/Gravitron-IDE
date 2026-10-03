module.exports = {
  root: true,
  extends: ['@ag/eslint-config/base'],
  rules: {
    'no-constant-condition': ['error', { checkLoops: false }],
    'prefer-const': 'off',
  },
};
