import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const appFiles = ['src/**/*.{js,jsx,ts,tsx}'];

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'convex/_generated/**'],
  },
  ...nextCoreWebVitals.map((config) => {
    if (config.ignores) {
      return config;
    }

    return {
      ...config,
      files: appFiles,
      rules: {
        ...config.rules,
        'react-hooks/refs': 'off',
        'react-hooks/set-state-in-effect': 'off',
      },
    };
  }),
];
