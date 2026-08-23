// Client version info fallback from build define or default
export const BUILD_VERSION = typeof __APP_VERSION_INFO__ !== 'undefined'
  ? __APP_VERSION_INFO__
  : {
      version: '1.0.0',
      commit: 'dev',
      fullCommit: '',
      branch: 'main',
      date: new Date().toISOString().split('T')[0],
      message: '',
      commitCount: 0,
      repoUrl: 'https://github.com/Hoaxr/Atlas'
    };
