'use strict';
const http = require('node:http');
const endpoint = process.argv[2] || '/health';
const request = http.get(`http://127.0.0.1:${process.env.PORT || 8080}${endpoint}`, response => {
  response.resume();
  process.exitCode = response.statusCode === 200 ? 0 : 1;
});
request.setTimeout(5000, () => request.destroy(new Error('timeout')));
request.on('error', () => { process.exitCode = 1; });
