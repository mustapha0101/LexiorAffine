import fs from 'fs';
import { parseOffice } from 'officeparser';
async function test() {
  const p = parseOffice(Buffer.from('hello'));
  console.log("Returned:", p, typeof p);
}
test();
