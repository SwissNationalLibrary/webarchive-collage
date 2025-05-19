const { fstat } = require('fs');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { spawn } = require('child_process');
const logger = require('./logging')('EHELV-ACCESS-COLLAGE:MONTAGE:vips');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const vipsArrayJoin = async ({ images, across = 1, targetFilename }) => {
  const targetFormat =
    'bigtiff,compression=jpeg,Q=80,pyramid,tile_width=1024,tile_height=1024';
  const args = [
    'arrayjoin',
    `${images.join(' ')}`,
    '--across',
    `${across}`,
    `${targetFilename}[${targetFormat}]`,
    '--vips-leak',
    '--vips-concurrency=8',
    '--vips-progress',
  ];
  logger.debug('calling vips arrayjoin');
  logger.debug(args);
  const { stdout, stderr } = await execFile('/usr/bin/vips', args, {
    // TODO: configurable cc level
    //env: { ...process.env, VIPS_CONCURRENCY_LEVEL: 8 },
  });
  logger.debug(stdout);
  logger.debug(stderr);
};

const pythonArrayJoin = async ({
  images,
  across,
  targetDir,
  targetPrefix,
  vipsConcurrency = 2,
  vipsDiscThreshold = 100,
}) => {
  let tmpFilename;
  let targetPath;
  try {
    logger.debug(
      `pythonArrayJoin for ${images.length} images, across ${across}, target dir ${targetDir}`
    );

    // write image filenames to temporary path
    targetPath = await fs.mkdtemp(path.join(os.tmpdir(), 'pyvips-'));
    tmpFilename = `${targetPath}/files.txt`;
    await fs.writeFile(tmpFilename, images.join('\n'));
    logger.debug(`successfully wrote image list to tempfile ${tmpFilename}`);

    const args = [
      'app/montage.py',
      '--infile',
      tmpFilename,
      '--across',
      across,
      '--out',
      targetDir,
      '--prefix',
      targetPrefix,
    ];
    logger.debug(
      `calling python montage script with args ${JSON.stringify(args)}`
    );

    // const { stdout, stderr } = await execFile('/usr/bin/python3', args, {
    //   env: { ...process.env, VIPS_CONCURRENCY_LEVEL: 8 },
    // });

    const child = spawn(`/usr/bin/python3`, args, {
      env: {
        ...process.env,
        VIPS_CONCURRENCY: vipsConcurrency,
        VIPS_DISC_THRESHOLD: vipsDiscThreshold,
      },
      stdio: 'inherit',
      stderr: 'inherit',
    });
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        logger.info(`vips closed with exit code ${code}`);
        resolve({ code });
      });
    });
  } catch (e) {
    logger.error(e);
  } finally {
    logger.debug(
      `removing tmp file and directory at ${targetPath} (${tmpFilename})`
    );
    if (tmpFilename) {
      await fs.unlink(tmpFilename);
      await fs.rmdir(targetPath);
    }
  }
};

module.exports = {
  vipsArrayJoin,
  pythonArrayJoin,
};
