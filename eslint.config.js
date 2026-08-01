const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'convex/_generated/**'],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      '@next/next/no-assign-module-variable': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
