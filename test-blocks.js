const { readFileSync } = require('fs');
const { parseYDocFromBinary } = require('./packages/backend/native/index.js');
const bin = readFileSync('./packages/backend/server/src/__tests__/__fixtures__/test-doc-with-blob.snapshot.bin');
const result = parseYDocFromBinary(bin, 'test-doc');
console.log(JSON.stringify(result.blocks.slice(0, 3), null, 2));
