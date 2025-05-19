const { promisify } = require('util');
const path = require('path');
const json = require('big-json');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const mkdirp = require('mkdirp');
const { exit } = require('process');
const logger = require('./lib/logging')('EHELV-ACCESS-COLLAGE:BUILD');
const fs = require('fs');
const readline = require('readline');
const events = require('events');

logger.info('running');
logger.debug('checking command line arguments');

// example calls
// ./bin/build.sh --outfile /data/nl200.json --dir /screenshots --list /data/top-nl-100.txt

/**
 * Builds data file from screenshots (IA)
 */

const optionDefinitions = [
  { name: 'outfile', alias: 'o', type: String, required: true },
  { name: 'dir', alias: 'd', type: String, required: true },
  { name: 'list', alias: 'l', type: String, required: true },
  { name: 'limit', type: Number },
  { name: 'help', alias: 'h', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
const sections = [
  {
    header: 'webarchive-collage metadata builder',
    content:
      'Fetches the current set of domains (groups) and their snapshots metadata and ' +
      'writes the result to a file for further processing.',
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'outfile',
        typeLabel: 'filename',
        description:
          'Filename/Path where to store (e.g. /tmp/webarchives.json)',
      },
      {
        name: 'dir',
        typeLabel: 'name',
        description: 'source directory containing screenshots',
      },
      {
        name: 'list',
        typeLabel: 'name',
        description: 'text file containing list of wayback urls',
      },
      {
        name: 'limit',
        typeLabel: 'name',
        description:
          'Limit number of groups (domains) - default: query all groups',
      },
    ],
  },
];
if (options.help || !options.outfile) {
  const usage = commandLineUsage(sections);
  return console.log(usage);
}

const outfile = options.outfile;

// see https://stackoverflow.com/questions/57863342/how-to-resolve-a-promise-once-a-json-stringify-writestream-has-completed
function saveStreamPromise(filePath, obj) {
  logger.debug(`writing to ${filePath}`);
  return new Promise((resolve, reject) => {
    let stream = fs.createWriteStream(filePath, { flag: 'w+' });
    const stringifyStream = json.createStringifyStream({ body: obj });
    stringifyStream.pipe(stream);

    stream.on('error', reject).on('close', function () {
      resolve('object saved!');
    });
    stringifyStream.on('error', reject);
  });
}

async function readWaybackList(filename) {
  try {
    const urlToArchiveLookup = {};
    const rl = readline.createInterface({
      input: fs.createReadStream(filename),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      logger.debug(line);
      const url = line.replace(
        /https?:\/\/web.archive.org\/web\/(.*?)\/(.*)/,
        '$2'
      );
      urlToArchiveLookup[new URL(url).toString()] = line;
    });
    await events.once(rl, 'close');
    return urlToArchiveLookup;
  } catch (err) {
    logger.error(err);
  }
}

(async () => {
  logger.debug(
    `reading screenshots from ${options.dir} / timestamps from ${options.list}`
  );

  const waybackUrls = await readWaybackList(options.list);
  logger.debug(waybackUrls);
  // list of available screenshots (=> list of urls)
  const files = fs
    .readdirSync(options.dir)
    .filter((file) => file.match(/webp|jpg|jpeg|png|avif/))
    .map((file) =>
      new URL(
        decodeURIComponent(file)?.replace(/\.jpg$|\.webp$/, '')
      ).toString()
    );

  logger.debug(files);
  const result = files.map((filename) => {
    const waybackUrl = waybackUrls[filename];
    const waybackDate = waybackUrl?.replace(
      /https?:\/\/web.archive.org\/web\/(.*?)\/(.*)/,
      '$1'
    );
    return {
      id: waybackUrl ?? filename,
      ehs_group: filename,
      ehs_urn_id: filename,
      ehs_domain: filename,
      wayback_date: waybackDate,
      snapshots: [
        {
          id: waybackUrl ?? filename,
          ehs_start_url: filename,
          ehs_urn_id: filename,
          ehs_wayback_date: waybackDate,
        },
      ],
    };
  });

  logger.info(`writing snapshots metadata to ${outfile}`);

  // ensure target directory exists
  await fs.promises.mkdir(path.dirname(outfile), { recursive: true });

  // write groups/snapshot listings file (webarchives.json)
  await saveStreamPromise(outfile, result);
})().then(() => {
  logger.info(`build finished`);
});
