import { parseOfficeAsync } from 'officeparser';
import * as fs from 'fs';
async function test() {
  try {
    const buffer = fs.readFileSync('packages/frontend/apps/electron/package.json'); // just dummy buffer
    console.log("Got buffer", buffer.length);
    // this will fail to parse because it's json, but let's see if it throws a specific officeparser error or type error
    await parseOfficeAsync(buffer);
  } catch (e) {
    console.log("Error:", e);
  }
}
test();
