import { parseOffice } from 'officeparser';
import * as fs from 'fs';
async function test() {
  const buf = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
  // Just to see what officeparser returns:
  try {
     const ast = await parseOffice(buf);
     console.log("SUCCESS. Keys:", Object.keys(ast), "type:", typeof ast);
     if (typeof ast.toText === 'function') {
        console.log("toText exists!");
     }
  } catch(e) {
     console.error("FAIL", e);
  }
}
test();
