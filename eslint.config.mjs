import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  {
    ignores: ['convex/_generated/**', 'outputs/**'],
  },
  {
    rules: {
      '@next/next/no-assign-module-variable': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
