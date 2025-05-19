const vibrant = require('node-vibrant');
const axios = require('axios');
const { promisify } = require('util');
const path = require('path');
const recursive = promisify(require('recursive-readdir'));
const commandLineArgs = require('command-line-args');
