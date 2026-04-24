export default function commonConfig(outputName) {
  return {
    modulePathIgnorePatterns: ['<rootDir>/website'],
    testRegex: '/__tests__/(server-only\\.)?test-[^\\/]+\\.js',
    moduleNameMapper: {
      '^isomorphic-git$': '<rootDir>/src',
      '^isomorphic-git/http$': '<rootDir>/http/node',
      '^isomorphic-git/(.+)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: ['src/*.js', 'src/**/*.js'],
    coverageReporters: ['lcov', 'cobertura'],
    reporters: [
      'default',
      [
        'jest-junit',
        {
          outputDirectory: 'junit',
          outputName: `${outputName}.xml`,
        },
      ],
    ],
    testTimeout: 60000,
    workerIdleMemoryLimit: '200MB',
    transform: {},
    // Node's native module resolution for .js files
    globals: {
      'ts-jest': {
        useESM: true,
      },
    },

  }
}
