const path = require('path');
const recursive = require('recursive-readdir');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const mkdirp = require('mkdirp');
const { saveStreamPromise } = require('./utils');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { createReadStream, fstat } = require('fs');
const conf = require('./conf');
const logger = require('./lib/logging')('EHELV-ACCESS-COLLAGE:MONTAGE');
const { pythonArrayJoin } = require('./lib/exec');
const logging = require('./lib/logging');

// node src/montage.js /data/helv-web/webarchives data/out
// node src/montage.js --blockSize 100 --tile 10 /data/helv-web/webarchives data/out

logger.info('running montage');
logger.debug('checking command line arguments');

const optionDefinitions = [
  { name: 'files', multiple: true, defaultOption: true },
  { name: 'dataFilename', alias: 'f', type: String, required: true },
  { name: 'dataOutDir', alias: 'o', type: String, required: true },
  { name: 'offset', type: Number },
  { name: 'count', type: Number },
  { name: 'blockSize', type: Number },
  { name: 'blocksPerRow', type: Number },
  { name: 'superRowSize', type: Number },
  { name: 'columnsPerBlock', type: Number },
  { name: 'resolution', type: String },
  { name: 'dry-run', alias: 'd', type: Boolean },
  { name: 'help', alias: 'h', type: Boolean },
  { name: 'id', type: String },
  { name: 'rowSize', type: Number },
];
const options = commandLineArgs(optionDefinitions);
const sections = [
  {
    header: 'e-Helvetica Access webarchive collage: image montage',
    content:
      'Creates a super-image of all the individual screenshot images ' +
      'and writes 1) a series of pyramidal tiff, 2) an spatial index file and' +
      '3) ... to the output folder.',
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'id',
        typeLabel: 'string',
        description:
          'Unique name which identifies this collage in the frontend config.json',
      },
      {
        name: 'files',
        typeLabel: 'src dest',
        description:
          'Source directory with screenshot images and destination directory for collage images',
      },
      {
        name: 'dataFilename',
        typeLabel: 'filename',
        description:
          'Filename/Path to the file containing the metadata and list of webarchives to process. ' +
          'This is usually the output of the fetch script. Example: /tmp/webarchives.json.',
      },
      {
        name: 'blocksPerRow',
        typeLabel: 'number',
        description:
          'Number of blocks per row. Will be calculated automatically for 4:3 screens if ' +
          'not specified',
      },
      {
        name: 'superRowSize',
        typeLabel: 'number',
        description: 'Number of block rows to compose a super row',
      },
      {
        name: 'dataOutDir',
        typeLabel: 'string',
        description:
          'Output directory for data files (collage config, snapshot listing, spatial index)',
      },
      {
        name: 'blockSize',
        typeLabel: 'number',
        description:
          'Size of each block. Each will consist of <blockSize> x <blockSize> screenshots. ' +
          'This is limited by the memory VIPS uses for composition. A value of 10 is reasonable for 16GB RAM',
      },
      {
        name: 'dry-run',
        typeLabel: 'flag',
        description:
          'If set, only outputs the commands that would be executed (helpful in debugging)',
      },
    ],
  },
];

if (!options.dataFilename || options.help) {
  const usage = commandLineUsage(sections);
  return console.log(usage);
}
const dataFilename = options['dataFilename'];

/**
 * Calculates the set of files for a specific tile.
 * @param {} files
 * @param {*} blockSize
 * @param {*} blockX
 * @param {*} blockY
 * @param {*} blocksPerRow
 * @param {*} columnsPerBlock
 * @returns
 */
const pickFiles = (
  files,
  blockSize,
  blockX,
  blockY,
  blocksPerRow,
  columnsPerBlock
) => {
  const lineStep = blocksPerRow * columnsPerBlock;
  let result = [];
  let startIndex = blockX * columnsPerBlock + blockY * blocksPerRow * blockSize;

  for (let y = 0; y < Math.round(blockSize / columnsPerBlock); y++) {
    const selection = files.slice(
      startIndex + y * lineStep,
      startIndex + y * lineStep + columnsPerBlock
    );
    result = result.concat(selection);
  }
  //logger.trace(result);
  return result;
};

/**
 * Read and process the list and metadata of webarchives.
 *
 * @param {} filename
 * @returns
 */
const readData = async (filename) => {
  const webarchivesByGroup = {};
  const snapshotsByUrn = {};

  const promise = new Promise((resolve, reject) => {
    // read json with webarchives metadata
    const pipeline = chain([
      createReadStream(`${dataFilename}`),
      //zlib.createGunzip(),
      parser(),
      //pick({filter: 'data'}),
      //ignore({filter: /\b_meta\b/i}),
      streamArray(),
    ]);

    pipeline.on('data', (data) => {
      // build snapshot data
      for (let i = 0; i < data.value.snapshots.length; i++) {
        if (snapshotsByUrn[data.value.snapshots[i].ehs_urn_id]) {
          logger.warn(
            `source file contains duplicate urn ids: ${data.value.snapshots[i].ehs_urn_id}`
          );
        }
        snapshotsByUrn[data.value.snapshots[i].ehs_urn_id] = {
          ...data.value.snapshots[i],
        };
        // reduce snapshot footprint for group listing
        delete data.value.snapshots[i].ehs_archival_date;
        delete data.value.snapshots[i].ehs_harvest_date;
        delete data.value.snapshots[i].ehs_unit_sort;
        delete data.value.snapshots[i].index_time;

        // @TODO: clarify usage group/snapshot values
        // // these values are already present on group level
        // delete data.value.snapshots[i].ehs_group;
        // delete data.value.snapshots[i].ehs_domain;

        // // push values up to group level (should be the same)
        // data.value.ehs_title_short = data.value.snapshots[i].ehs_title_short;
        // delete data.value.snapshots[i].ehs_title_short;
      }

      // remove unused metadata
      delete data.value._groupValue;
      delete data.value.groupIndex;

      webarchivesByGroup[data.value.ehs_group] = data.value;
    });

    pipeline.on('end', () => {
      resolve();
    });

    pipeline.on('error', (e) => {
      reject(e);
    });
  });
  await promise;
  return { webarchivesByGroup, snapshotsByUrn };
};

const getUrnKeysSorted = (snapshotsByUrn) => {
  // get list of urns and filter undefined snapshot date values (sorting!)
  logger.debug(`filtering ${Object.keys(snapshotsByUrn).length} snapshots`);
  let urnKeys = Object.keys(snapshotsByUrn).filter(
    (k) => snapshotsByUrn[k].ehs_wayback_date
  );
  logger.debug(
    `using ${urnKeys.length} snapshots after ehs_wayback_date filtering`
  );

  // sort snapshot urn keys by snapshot date
  urnKeys = urnKeys.sort((a, b) => {
    // "ehs_wayback_date":20170710133425
    const strA = '' + snapshotsByUrn[a].ehs_wayback_date;
    const dateA = new Date(
      `${strA.substr(0, 4)}-${strA.substr(4, 2)}-${strA.substr(
        6,
        2
      )} ${strA.substr(8, 2)}:${strA.substr(10, 2)}:${strA.substr(12, 2)}`
    );
    const strB = '' + snapshotsByUrn[b].ehs_wayback_date;
    const dateB = new Date(
      `${strB.substr(0, 4)}-${strB.substr(4, 2)}-${strB.substr(
        6,
        2
      )} ${strB.substr(8, 2)}:${strB.substr(10, 2)}:${strB.substr(12, 2)}`
    );
    return dateA - dateB;
  });
  return urnKeys;
};

const getUrnIdFromFilename = (filename) => {
  return path.basename(filename.replace(/(.*?)-[\!|\-http|\-nb|!]+.*/, '$1'));
};

/**
 * Matches screenshot filenames to their snapshot snapshot object.
 * @param {*} files
 * @param {*} snapshotsByUrn
 */
const matchSnapshotUrns = (files, snapshotsByUrn) => {
  // KJ 20200311 - match urn keys and files -> add filename to each snapshot record
  const resultFiles = [];
  files.forEach((filename) => {
    // match new and old scheme files
    // new: bel-1389570-nb-webarchive%2F20190911104851%2Fhttps%3A%2F%2Fmuseumsnachtsg.ch.jpg
    // old: bel-1377198-http%3A%2F%2Fpywb.ehelvetica.localhost%3A8088%2Fnb-webarchive%2F20190901163213%2Fhttps%3A%2F%2Fwww.arcinfo.ch.jpg
    //const fileUrn = path.basename(filename); //.replace(/.*\/\.webp|\.jpg$/, '$1');
    const fileUrn = decodeURIComponent(path.basename(filename))?.replace(
      /\.webp|\.jpg/,
      ''
    );
    let waybackUrl;
    try {
      waybackUrl = decodeURIComponent(fileUrn);
    } catch (e) {
      logger.warn(e);
      waybackUrl = filename;
    }
    // if (!fileUrn.match(/^bel-.*/)) {
    //   logger.error(
    //     `filename ${filename} (waybackUrl=${waybackUrl}) does not match pattern bel-.* - maybe exclude?`
    //   );
    // }

    const snapshot = snapshotsByUrn[fileUrn];
    if (!snapshot) {
      logger.warn(`no snapshot found for ${fileUrn} (delete ${filename}?)`);
      //TODO: delete file await fstat.unlink(filename);
    } else if (snapshot.filename) {
      logger.warn(
        `duplicate urn detected ${snapshot.filename} (${waybackUrl})`
      );
      if (snapshot.ehs_start_url === waybackUrl) {
        logger.warn(`- keeping url ${waybackUrl}`);
        snapshot.filename = filename;
        resultFiles.push(filename);
      }
    } else {
      snapshot.filename = filename;
      resultFiles.push(filename);
    }
  });

  return resultFiles;
};

//
// MAIN PROCESSING LOOP
//
(async () => {
  logger.info(`reading webarchive metadata from ${dataFilename}`);
  const { webarchivesByGroup, snapshotsByUrn } = await readData(dataFilename);

  logger.debug(
    `processing data for ${
      Object.keys(webarchivesByGroup).length
    } webarchive groups`
  );
  const urnKeys = getUrnKeysSorted(snapshotsByUrn);
  logger.debug(`number of snapshots (unique urn) = ${urnKeys.length}`);

  // list all files in specified directory
  const srcDir = options.files[0];
  const dstDir = options.files[1];
  logger.info(`using srcDir=${srcDir} and dstDir=${dstDir}`);

  // create target dir if not exists
  logger.trace(
    `creating target directories ${dstDir} and ${dstDir}/intermediate`
  );
  await mkdirp(dstDir);

  // get recursive listing of source file
  logger.trace(`listing all files in source directory ${srcDir}`);
  let files = await recursive(srcDir, ['failed']);
  files = files.filter(
    (f) => f.match(/\.jpe?g|\.webp/) && !f.match(/\.DS_Store|^undefined|~$/)
  );

  logger.debug(`matching ${files?.length} files with their metadata record`);
  files = matchSnapshotUrns(files, snapshotsByUrn);
  logger.debug(`using ${files?.length} files after matching`);

  // start at offset, end at offset + count
  const count = options.count ?? 99999999;
  let offset = options.offset ?? 0;

  files = [];
  urnKeys.forEach((urn) => {
    // add snapshots if thumbnail is available
    if (snapshotsByUrn[urn].filename) {
      files.push(snapshotsByUrn[urn].filename);
    }
  });
  logger.debug(
    `processing ${files?.length} files after filtering out snapshots with no files`
  );
  files = files.slice(offset, count);
  logger.debug(`starting at offset ${offset}, total ${files.length} files`);

  // default: work in 20x20
  const resolution = options.resolution || '2724x2048';
  const tileSizeX = +resolution.split('x')[0];
  const tileSizeY = +resolution.split('x')[1];

  let superRowCount = 0;

  const spatialIndex = [];
  const spatialIndexByUrn = {};
  let filesRemaining = files.length;
  let block = 0;

  // number of screenshots per row
  const IMAGES_PER_SUPERROW = 5000;
  const rowSize = +(options.rowSize ?? Math.ceil(Math.sqrt(files.length)));
  const superRowSize = +(
    options.superRowSize ?? Math.ceil(IMAGES_PER_SUPERROW / rowSize)
  );

  while (filesRemaining > 0) {
    // get source images
    logger.debug(`workingSet ${block}, ${rowSize}, ${superRowSize}`);
    const workingSet = files.slice(
      superRowCount * superRowSize * rowSize,
      superRowCount * superRowSize * rowSize + rowSize * superRowSize
    );

    // build spatial index
    for (let i = 0; i < workingSet.length; i++) {
      const filename = workingSet[i];

      const col = i % rowSize;
      const row = superRowCount * superRowSize + Math.floor(i / rowSize);

      const left = col * tileSizeX;
      const top = row * tileSizeY;
      const width = tileSizeX;
      const height = tileSizeY;

      // catch some cases where url changed on regenerated spatial index
      const urnId = getUrnIdFromFilename(filename);
      if (!spatialIndexByUrn[urnId]) {
        spatialIndex.push({
          urnId,
          minY: top,
          minX: left,
          maxX: left + width,
          maxY: top + height,
        });
        spatialIndexByUrn[urnId] = true;
      }
    }

    // write
    if (!options['dry-run']) {
      logger.debug(
        `write block of ${workingSet.length} items to ${dstDir}/row-${superRowCount}.tif`
      );
      // await vipsArrayJoin({
      //   images: workingSet,
      //   across: rowSize,
      //   targetFilename: `${dstDir}/row-${superRowCount}.tif`,
      // });
      await pythonArrayJoin({
        images: workingSet,
        across: rowSize,
        targetDir: dstDir,
        targetPrefix: `row-${superRowCount}`,
        vipsConcurrency: conf.vipsConcurrency ?? 1,
        vipsDiscThreshold: conf.vipsDiscThreshold ?? 100,
      });
    }

    filesRemaining -= workingSet.length;
    offset += rowSize;
    if (filesRemaining) {
      superRowCount++;
    }
  }

  //
  // write metadata files for frontend
  //
  const filenameConfig =
    path.basename(dataFilename, path.extname(dataFilename)) + '.config.json';
  const filenameIndex =
    path.basename(dataFilename, path.extname(dataFilename)) + '.index.json';
  const filenameData =
    path.basename(dataFilename, path.extname(dataFilename)) + '.collage.json';

  // ensure metadata directory exists
  await mkdirp(options.dataOutDir);

  // write config file
  logger.info(
    `writing collage config to ${path.join(options.dataOutDir, filenameConfig)}`
  );
  const collageConfig = {
    id: options.id,
    metadataUri: filenameData,
    spatialIndexUri: filenameIndex,
    numRows: superRowCount + 1,
    subRows: superRowSize,
    itemsPerRow: rowSize,
    snapshotCount: files.length,
  };
  logger.debug(collageConfig);
  await saveStreamPromise(
    path.join(options.dataOutDir, filenameConfig),
    collageConfig
  );

  // write frontend index package (cleaned up webarchivesByGroup)

  logger.info(
    'writing webarchives collage json to ' +
      path.join(options.dataOutDir, filenameData)
  );
  await saveStreamPromise(
    path.join(options.dataOutDir, filenameData),
    webarchivesByGroup // @TODO: clean up data (remove _groupValue)
  );

  // write spatial index package

  logger.info(
    'writing spatialIndex json to ' +
      path.join(options.dataOutDir, filenameIndex)
  );
  await saveStreamPromise(
    path.join(options.dataOutDir, filenameIndex),
    spatialIndex
  );
})().then(() => {});
