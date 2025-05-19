module.exports = {
  logLevel: 'debug',
  targetDir: '/data',
  maxProcesses: 6,
  solrRequestsConcurrency: 4,
  solrUrl: [],
  webarchivesCollection: 'webarchives',
  basicAuth: { user: null, pass: null },
  frontendUrl: 'http://host.docker.internal:8088',
  pywbBaseUrl: 'http://host.docker.internal:8099',
  accessUser: null,
  accessPassword: null,
};
