const { promisify } = require('util');
const path = require('path');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const fs = require('fs/promises');
const conf = require('./conf');
const logger = require('./lib/logging')('EHELV-ACCESS-COLLAGE:patch');

logger.info('patching collage config');

const optionDefinitions = [
  { name: 'path', type: String, required: true },
  { name: 'config', type: String, required: true },
  { name: 'dst', type: String },
  { name: 'uri', type: String, required: true },
  { name: 'cacheBuster', type: String },
  //{ name: 'delegateConfig', type: String },
  { name: 'help', alias: 'h', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
const sections = [
  {
    header: 'e-Helvetica Access webarchive collage: patch configs',
    content:
      'Patches a frontend configuration file (dst) to match a given collage config (src). ' +
      'Updates the required scale constraint ratio in a ruby file for use with the delegate ' +
      'script.',
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'path',
        typeLabel: 'file',
        description: 'Source collage path',
      },
      {
        name: 'config',
        typeLabel: 'file',
        description: 'Frontend configuration file to apply patch to',
      },
      {
        name: 'cacheBuster',
        typeLabel: 'string',
        description: 'Cache buster suffix for collage images',
      },
      // {
      //   name: 'delegateConfig',
      //   typeLabel: 'file',
      //   description: 'Text file to write the scale constraints to',
      // },
      {
        name: 'dst',
        typeLabel: 'file',
        description: 'Destination file (if omitted: same as config file)',
      },
      {
        name: 'uri',
        typeLabel: 'URI',
        description: 'public (browser) path of collage',
      },
    ],
  },
];

if (!options.path || !options.config || options.help) {
  const usage = commandLineUsage(sections);
  return console.log(usage);
}

const readJSON = async (filename) => {
  try {
    const content = await fs.readFile(filename, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    logger.error(e);
    throw new Error(e);
  }
};

const getConfigs = async () => {
  // read frontend configuration
  logger.debug(`reading frontend config from ${options.config}`);
  const frontendConfig = await readJSON(options.config);
  logger.debug(frontendConfig);

  // logger.debug(
  //   `reading delegate config text file from ${options.delegateConfig}`
  // );
  // const delegateConfig = await fs.readFile(options.delegateConfig, 'utf8');
  // logger.debug(delegateConfig);

  logger.debug(
    `reading collage config from ${options.path}/meta/webarchives.config.json`
  );
  const collageConfig = await readJSON(
    `${options.path}/meta/webarchives.config.json`
  );
  logger.debug(collageConfig);

  return {
    frontendConfig,
    collageConfig,
  };
};

(async () => {
  const { frontendConfig, collageConfig } = await getConfigs();
  frontendConfig.collages = frontendConfig.collages ?? [];
  let collage = frontendConfig.collages.find(
    (collage) => collage.id === collageConfig.id
  );
  if (!collage) {
    collage = {
      id: collageConfig.id,
    };
    frontendConfig.collages.push(collage);
  }

  // adjust config
  const collagePath = options.path ?? '/data/collages';
  collage.metadataUri = `${options.uri}/meta/${collageConfig.metadataUri}`;
  collage.spatialIndexUri = `${options.uri}/meta/${collageConfig.spatialIndexUri}`;
  collage.itemsPerRow = collageConfig.itemsPerRow;
  collage.numRows = collageConfig.numRows;
  collage.subRows = collageConfig.subRows;
  collage.cacheBuster = options.cacheBuster ?? '';
  collage.snapshotCount = collageConfig.snapshotCount;

  // write back
  logger.debug(`writing config to ${options.dst ?? options.config}`);
  logger.trace(frontendConfig);
  await fs.writeFile(
    options.dst ?? options.config,
    JSON.stringify(frontendConfig, null, 2),
    'utf8'
  );
})();
