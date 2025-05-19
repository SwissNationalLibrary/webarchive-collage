const axios = require('axios');
const { promisify } = require('util');
const path = require('path');
const recursive = promisify(require('recursive-readdir'));
const rateLimit = require('axios-rate-limit');
const querystring = require('querystring');
const conf = require('./conf');
const crypto = require('crypto');
const json = require('big-json');
const fs = require('fs');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const { webarchivesCollection } = require('./conf');
const mkdirp = require('mkdirp');
const { exit } = require('process');
const logger = require('./lib/logging')('EHELV-ACCESS-COLLAGE:FETCH');

logger.info('running');
logger.debug('checking command line arguments');

const getSolrHost = () => {
  return conf.solrUrl[Math.floor(Math.random() * conf.solrUrl.length)];
};

const optionDefinitions = [
  { name: 'outfile', alias: 'o', type: String },
  { name: 'collection', alias: 'c', type: String },
  { name: 'limit', type: Number },
  {
    name: 'query',
    alias: 'q',
    type: String,
    defaultValue:
      'ehs_group:* AND NOT (ehs_collection:wikipedia OR ehs_publication_format:webarticle)',
  },
  { name: 'help', alias: 'h', type: Boolean },
];
const options = commandLineArgs(optionDefinitions);
const sections = [
  {
    header: 'e-Helvetica Access webarchive-collage metadata fetcher',
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
        name: 'collection',
        typeLabel: 'name',
        description: '(reserved for future use)',
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

const AXIOS_REQ_TIMEOUT = 60000;
logger.debug(`setting axios timeout=${AXIOS_REQ_TIMEOUT}`);
axios.defaults.timeout = AXIOS_REQ_TIMEOUT;

const outfile = options.outfile;
const collection = options.collection || null;

// see https://stackoverflow.com/questions/57863342/how-to-resolve-a-promise-once-a-json-stringify-writestream-has-completed
function saveStreamPromise(filePath, obj) {
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

const search = async (q, params) => {
  const options = {
    q: q || 'ehs_group:*',
    wt: 'json',
    rows: '10',
    start: '0',
    sort: 'ehs_group asc',
    fq: ['ehs_searchable:true', ...(params.fq || [])],
    group: 'on',
    'group.field': 'ehs_group',
    'group.limit': 1,
    'group.ngroups': true,
    // 'facet': 'on',
    // 'facet.pivot': 'ehs_group,ehs_urn_id',
    // 'facet.field': 'ehs_urn_id',
    //rows: 0,
    ...params,
  };
  return axios.get(
    `${getSolrHost()}/solr/${
      conf.webarchivesCollection
    }/select?${new URLSearchParams(options).toString()}`
  );
};

/**
 * Fetches a list of webarchive groups (=domains) from Solr.
 * Note: pagesize is limited to avoid overloading memory in the Solr Cloud
 *
 * @param {string} query in solr querystring syntax
 * @returns
 */
const fetchWebarchiveGroups = async (query, groupLimit = 3) => {
  const groups = [];
  const pageSize = Math.min(groupLimit, 500);
  let start = 0;
  let hasMore = true;
  while (hasMore) {
    logger.debug(`fetching domains offset=${start}`);
    const response = await search('', {
      q: query,
      fl: 'id,ehs_group,ehs_title,ehs_urn_id,ehs_domain,wayback_date',
      rows: pageSize,
      start,
    });

    let numWebarchives = Math.min(
      groupLimit,
      response.data.grouped.ehs_group.ngroups
    );
    //numWebarchives = 1;
    const results = response.data.grouped.ehs_group.groups;
    for (let i = 0; i < results.length; i++) {
      const g = results[i].doclist.docs[0];
      g._groupValue = results[i].groupValue;
      groups.push(g);
    }

    start += pageSize;
    hasMore = start < numWebarchives;
  }
  return groups;
};

/**
 * Fetches the list of snapshots for a single group from Solr.
 * @param {full solr group record} group
 */
const fetchAndStoreSnapshots = async (group) => {
  const domain = group.ehs_domain;
  logger.debug(`fetching group ${group.id}, ${group._groupValue}, ${domain}`);
  // test retries: if (domain === 'http://www.abcd.ch') throw new Error('test exceptions');

  const response = await search('', {
    q: `ehs_group:"${group._groupValue}"`,
    fq: `ehs_group:"${group._groupValue}"`,
    fl: 'id,ehs_group,ehs_urn_id,ehs_title_short,ehs_collection,ehs_domain,ehs_start_url,ehs_harvest_date,ehs_wayback_date,ehs_start_url,ehs_archival_date,ehs_unit_sort,index_time',
    sort: 'ehs_urn_id asc',
    rows: 1000,
    'group.field': 'ehs_urn_id',
    'group.limit': '1',
  });

  group.snapshots = response.data.grouped.ehs_urn_id.groups.map(
    (g) => g.doclist.docs[0]
  );

  logger.trace(`${domain} - ${group.snapshots.length} snapshots`);
};

let snapshotsCount = 0;
let groupCount = 0;
const NUM_RETRIES = 3;

(async () => {
  const pLimit = await import('p-limit').then((m) => m.default);
  logger.debug(`collecting snapshots metadata`);

  // fetch list of all webarchive domains (group by ehs_group) -> ca. 15'000 (in 2021)
  const groups = await fetchWebarchiveGroups(
    options.query,
    options.limit ?? 10
  );

  // fetch list of all snapshots of each individual group -> ca. 1-5 per group
  // and enqueue snapshots
  snapshotsCount = 0;
  groupCount = 0;

  logger.debug(
    `fetching snapshots metadata for each of the ${groups.length} groups`
  );

  // fetch list of all snapshots of each individual group -> ca. 1-5 per group
  // snapshots metadata is stored withing the group
  const limit = pLimit(conf.solrRequestsConcurrency ?? 2);
  let retries = [];
  const responses = [];
  let pendingList = groups;
  let retryCount = 0;
  let groupIndex = 0;

  while (pendingList.length > 0 && retryCount < NUM_RETRIES) {
    logger.info(
      `fetching metadata for ${pendingList.length} snapshots, retryCount=${retryCount}`
    );
    for (const group of pendingList) {
      group.groupIndex = group.groupIndex ?? groupIndex++;
      responses.push(
        limit(() => {
          logger.debug(`group ${group.groupIndex} SNAPSHOT #${snapshotsCount}`);
          return fetchAndStoreSnapshots(group).catch((reason) => {
            // handle errors on fetching (e.g. ETIMEDOUT) - requeue
            logger.error(reason);
            retries.push(group);
          });
        })
      );
      groupCount += 1;
    }

    // wait until all snapshots have been retrieved
    await Promise.all(responses);
    pendingList = [...retries];
    if (retries.length > 0) {
      logger.warn(`${retries.length} request(s) failed`);
    }

    retryCount++;
    if (retryCount < NUM_RETRIES) {
      retries = [];
    }
  }

  if (retries.length > 0) {
    logger.error(
      `${retries.length} requests finally failed (after retrying ${NUM_RETRIES} times)`
    );
    logger.error(retries);
  }

  logger.info(`writing snapshots metadata to ${outfile}`);

  // ensure target directory exists
  await fs.promises.mkdir(path.dirname(outfile), { recursive: true });
  // write groups/snapshot listings file (webarchives.json)
  await saveStreamPromise(outfile, groups);
})().then(() => {
  logger.info(`fetching finished`);
});
