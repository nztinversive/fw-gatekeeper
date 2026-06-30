import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['.next/**', 'convex/_generated/**', 'node_modules/**'] },
  ...nextVitals,
  {
    rules: {
      '@next/next/no-assign-module-variable': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
