const fs = require('fs');
const json = require('big-json');

// see https://stackoverflow.com/questions/57863342/how-to-resolve-a-promise-once-a-json-stringify-writestream-has-completed
const saveStreamPromise = function (filePath, obj) {
  return new Promise((resolve, reject) => {
    let stream = fs.createWriteStream(filePath, { flag: 'w+' });
    const stringifyStream = json.createStringifyStream({ body: obj });
    stringifyStream.pipe(stream);

    stream.on('error', reject).on('close', function () {
      resolve('object saved!');
    });
    stringifyStream.on('error', reject);
  });
};

module.exports = {
  saveStreamPromise,
};
