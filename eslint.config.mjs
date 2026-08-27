import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'convex/_generated/**', 'outputs/**'],
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

export default config;
