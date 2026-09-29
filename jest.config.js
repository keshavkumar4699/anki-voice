// Unit tests cover the pure core (src/core) only; they run in plain Node.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/core'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { isolatedModules: true, rootDir: '.', module: 'commonjs', moduleResolution: 'node10', ignoreDeprecations: '6.0', verbatimModuleSyntax: false } },
    ],
  },
};
