const axios = require('axios');
const { promisify } = require('util');
const path = require('path');
const recursive = promisify(require('recursive-readdir'));
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const mkdirp = require('mkdirp');
const { exec } = require('child_process');
const pexec = promisify(exec);
const sharp = require('sharp');
const rateLimit = require('axios-rate-limit');
//const bfj = require('bfj');
const { saveStreamPromise } = require('./utils');
// streamed json reader
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
const { ignore } = require('stream-json/filters/Ignore');
const { streamValues } = require('stream-json/streamers/StreamValues');
const { streamArray } = require('stream-json/streamers/StreamArray');
const fs = require('fs');
const zlib = require('zlib');
const conf = require('./conf');

// node src/montage.js ../e-helvetica-access/access-services/data/helv-web/webarchives data/out
// node src/montage.js --blocksize 100 --tile 10 ../e-helvetica-access/access-services/data/helv-web/webarchives data/out
//const bigjson = require('big-json');

const optionDefinitions = [
  { name: 'files', multiple: true, defaultOption: true },
  { name: 'dataFilename', type: String, required: true },
  { name: 'offset', type: Number },
  { name: 'count', type: Number },
  { name: 'blocksize', type: Number },
  { name: 'blocksperline', type: Number },
  { name: 'tile', type: Number },
  { name: 'resolution', type: String },
  { name: 'dryMontage', type: Boolean },
  { name: 'help', type: Boolean },
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
        name: 'blocksperline',
        typeLabel: 'number',
        description:
          'Number of blocks per row. Will be calculated automatically for 4:3 screens if ' +
          'not specified',
      },
      {
        name: 'blocksize',
        typeLabel: 'number',
        description:
          'Size of each block. Each will consist of <blocksize> x <blocksize> screenshots. ' +
          'This is limited by the memory VIPS uses for composition. A value of 10 is reasonable for 16GB RAM',
      },
      {
        name: 'dryMontage',
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

// const API_BASE_URL = 'https://ehelvetica-host';
// const axiosHttp = rateLimit(
//   axios.create({
//     auth: {
//       username: 'insertuser',
//       password: 'insertpass',
//     },
//   }),
//   {
//     maxRequests: 20,
//     perMilliseconds: 1000,
//   }
// );

/**
 * Calculates the set of files for a specific tile.
 * @param {} files
 * @param {*} blocksize
 * @param {*} blockX
 * @param {*} blockY
 * @param {*} blocksPerLine
 * @param {*} tile
 * @returns
 */
const pickFiles = (files, blocksize, blockX, blockY, blocksPerLine, tile) => {
  const lineStep = blocksPerLine * tile;
  let result = [];
  let startIndex = blockX * tile + blockY * blocksPerLine * blocksize;

  for (let y = 0; y < Math.round(blocksize / tile); y++) {
    const selection = files.slice(
      startIndex + y * lineStep,
      startIndex + y * lineStep + tile
    );
    result = result.concat(selection);
  }
  console.log(result);
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
  const promise = new Promise((resolve, reject) => {
    // read json with webarchives metadata
    const pipeline = chain([
      fs.createReadStream(`${dataFilename}`),
      //zlib.createGunzip(),
      parser(),
      //pick({filter: 'data'}),
      //ignore({filter: /\b_meta\b/i}),
      streamArray(),
      // data => {
      //   const value = data.value;
      //   return value && value.department === 'accounting' ? data : null;
      // }
    ]);

    pipeline.on('data', (data) => {
      // build snapshot data
      for (let i = 0; i < data.value.snapshots.length; i++) {
        snapshotsByUrn[data.value.snapshots[i].ehs_urn_id] = {
          ...data.value.snapshots[i],
        };
        // reduce snapshot footprint for group listing
        delete data.value.snapshots[i].ehs_archival_date;
        delete data.value.snapshots[i].ehs_harvest_date;
        delete data.value.snapshots[i].ehs_unit_sort;
        delete data.value.snapshots[i].index_time;
      }
      webarchivesByGroup[data.value.ehs_group] = data.value;
      //console.log(data.value, data.value.snapshots);
    });

    pipeline.on('end', () => {
      resolve();
    });

    pipeline.on('error', (e) => {
      reject(e);
    });
  });
  await promise;
  return webarchivesByGroup;
};

const getUrnKeysFromWebarchives = (webarchivesByGroup) => {
  // get list of urns and filter undefined snapshot date values (sorting!)
  const snapshotsByUrn = {};
  sortedUrnKeys = getUrnKeysFromWebarchives(snapshotsByUrn);
  let urnKeys = Object.keys(snapshotsByUrn).filter(
    (k) => snapshotsByUrn[k].ehs_wayback_date
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

(async () => {
  const webarchivesByGroup = readData(dataFilename);

  const urnKeys = getUrnKeysFromWebarchives(webarchivesByGroup);
  console.log('- count snapshotsByUrn', urnKeys.length);

  // list all files in specified directory
  const srcDir = options.files[0];
  const dstDir = options.files[1];

  // create target dir if not exists
  await mkdirp(dstDir);

  // get recursive listing of source file
  let files = await recursive(srcDir);
  files = files.filter((f) => !f.match(/\.DS_Store|^undefined/));

  // KJ 20200311 - match urn keys and files -> add filename to each snapshot record
  files.forEach((filename) => {
    // match new and old scheme files
    // new: bel-1389570-nb-webarchive%2F20190911104851%2Fhttps%3A%2F%2Fmuseumsnachtsg.ch.jpg
    // old: bel-1377198-http%3A%2F%2Fpywb.ehelvetica.localhost%3A8088%2Fnb-webarchive%2F20190901163213%2Fhttps%3A%2F%2Fwww.arcinfo.ch.jpg
    const fileUrn = filename.replace(/.*\/(.*?)(\!|\-http|\-nb|!)+.*/, '$1');
    const snapshot = snapshotsByUrn[fileUrn];
    if (!snapshot) {
      console.warn('no snapshot found for ', fileUrn);
    } else if (snapshot.filename) {
      console.warn('duplicate urn detected ', snapshot.filename);
    } else {
      snapshot.filename = filename;
    }
  });

  // // sort files by name
  // //files = files.sort();

  // // sort files by snapshot date
  // files = files.sort( (a, b) => {
  //   // const urnA = a.replace(/.*\/(.*?)-http.*/, '$1');
  //   // const urnB = b.replace(/.*\/(.*?)-http.*/, '$1');
  //   // const snapshotA = snapshotsById[urnA];
  //   // const snapshotB = snapshotsById[urnB];
  //   // const unitSortA = new Date(snapshotA.ehs_unit_sort);
  //   // const unitSortB = new Date(snapshotB.ehs_unit_sort);
  //   // return unitSortA - unitSortB;

  //   let dateStr = a.replace(/.*\/(.*?)-http.*nb-webarchive%2F(\d+).*/, '$2');
  //   // console.log(`${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)} ${dateStr.substr(8, 2)}:${dateStr.substr(10, 2)}:${dateStr.substr(12, 2)}`);
  //   const dateA = new Date(`${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)} ${dateStr.substr(8, 2)}:${dateStr.substr(10, 2)}:${dateStr.substr(12, 2)}`);
  //   dateStr = b.replace(/.*\/(.*?)-http.*nb-webarchive%2F(\d+).*/, '$2');
  //   const dateB = new Date(`${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)} ${dateStr.substr(8, 2)}:${dateStr.substr(10, 2)}:${dateStr.substr(12, 2)}`);
  //   // console.log(dateA.toISOString(), dateB.toISOString());
  //   return dateA - dateB;
  // });

  // start at offset, end at offset + count
  const count = options.count || 99999999;
  let offset = options.offset || 0;

  files = [];
  urnKeys.forEach((urn) => {
    // add snapshots if thumbnail is available
    if (snapshotsByUrn[urn].filename) {
      files.push(snapshotsByUrn[urn].filename);
    }
  });
  files = files.splice(offset, count);

  // default: work in 20x20
  const blocksize = options.blocksize || 400;
  const blocksPerLine = options.blocksperline || 28;
  const tile = options.tile || '5';
  const resolution = options.resolution || '2724x2048';
  const tileSizeX = +resolution.split('x')[0];
  const tileSizeY = +resolution.split('x')[1];
  const method = 'sharp'; // montage || sharp
  const geoIndex = [];
  const spatialIndexByUrn = {};
  let filesRemaining = files.length;

  let promises = [];
  const numProcesses = conf.maxProcesses;

  while (filesRemaining > 0) {
    //const workingSet = files.splice(0, blocksize);
    const block = Math.floor(offset / blocksize);
    const blockX = block % blocksPerLine;
    const blockY = Math.floor(block / blocksPerLine);

    const workingSet = pickFiles(
      files,
      blocksize,
      blockX,
      blockY,
      blocksPerLine,
      tile
    );
    const filenames = workingSet.join(' ');

    // montage -quality 90 -compress lzw -mode Concatenate -geometry '800x600' -tile 5x *.jpg montage.tif
    const destFilename = `${dstDir}/montage-${block}.tif`;
    //console.log('--- working set', workingSet);

    // fetch metadata for each image in block
    // console.log(`fetching metadata for block ${block}`);
    // const fetchList = [];
    // for (let i=0; i<workingSet.length; i++) {
    //   const urn = workingSet[i].replace(/.*\/(.*?)-http.*/, '$1');
    //   if (urn[0] !== '/') {
    //     //console.log('fetch metadata for urn=' + urn);
    //     fetchList.push(fetchMetadata(urn));
    //   }
    // }
    // await Promise.all(fetchList)
    // .then( (result) => {
    //   console.log(result);

    //   // write to geo-index structure

    // });

    if (method === 'montage') {
      let cmd = `montage -quality 90 -compress lzw -mode Concatenate -geometry '2724x2048' -tile ${tile} ${filenames} ${destFilename}`;

      console.log(cmd);
      // montage
      let result = await pexec(cmd);
      console.log('result', result);

      // convert to pyramidal tiff
      cmd = `vips tiffsave ${destFilename} ${destFilename.replace(
        /.tif/,
        '-p.tif'
      )} --tile --pyramid --compression=jpeg --Q=90 --tile-width 256 --tile-height 256`;
      console.log('vips cmd', cmd);
      result = await pexec(cmd);
      console.log('vips result', result);
    } else {
      // use vips composite operation with direct pyramidal compression
      const params = [];
      for (let i = 0; i < workingSet.length; i++) {
        const filename = workingSet[i];
        const urnId = path.basename(
          filename.replace(/(.*?)-[\!|\-http|\-nb|!]+.*/, '$1')
        );
        const col = i % tile;
        const row = Math.floor(i / +tile);

        params.push({
          input: filename,
          top: row * +tileSizeY,
          left: col * +tileSizeX,
        });

        const left = blockX * tile * +tileSizeX + col * +tileSizeX;
        const top = blockY * tile * +tileSizeY + row * +tileSizeY;
        const width = +tileSizeX;
        const height = +tileSizeY;

        // catch some cases where url changed on regenerated spatial index
        if (!spatialIndexByUrn[urnId]) {
          geoIndex.push({
            urnId,
            minY: +top,
            minX: +left,
            maxX: +width + +left,
            maxY: +top + +height,
          });
          spatialIndexByUrn[urnId] = true;
        }
      }
      console.log(params);
      if (!options.dryMontage) {
        const promise = sharp({
          create: {
            width: tileSizeX * tile,
            height: tileSizeY * Math.round(blocksize / tile),
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
          limitInputPixels: false,
        })
          .composite(params)
          .tiff({
            quality: 80,
            pyramid: true,
            tile: true,
            tileWidth: 256,
            tileHeight: 256,
          })
          .toFile(destFilename)
          .then(() => {
            console.log(`-> written ${destFilename}`);
          });

        if (promises.length < numProcesses) {
          // put into queue for parallel processing
          promises.push(promise);
        } else {
          // wait for parallel processes to finish
          await Promise.all(promises)
            .then((results) => {
              console.log(results);
            })
            .catch((err) => {
              console.error(err);
            });

          promises = [];
        }
      } else {
        console.log('-> using dry montage - skip op');
      }
    }

    filesRemaining -= workingSet.length;
    offset += blocksize;
  }

  // wait for last processes to complete
  if (promises.length > 0) {
    await Promise.all(promises)
      .then((results) => {
        console.log(results);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  // write frontend json package
  let filenameData =
    path.basename(dataFilename, path.extname(dataFilename)) + '.collage.json';
  let filenameIndex =
    path.basename(dataFilename, path.extname(dataFilename)) + '.index.json';
  console.log(
    'writing webarchives collage json to ' +
      path.join(path.dirname(dataFilename), filenameData)
  );
  await saveStreamPromise(
    path.join(path.dirname(dataFilename), filenameData),
    webarchivesByGroup
  );
  console.log(
    'writing geoindex json to ' +
      path.join(path.dirname(dataFilename), filenameIndex)
  );
  await saveStreamPromise(
    path.join(path.dirname(dataFilename), filenameIndex),
    geoIndex
  );
})().then(() => {});
