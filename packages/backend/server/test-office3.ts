import * as path from 'path';
import * as fs from 'fs';
import { parseOffice } from 'officeparser';

async function test() {
  try {
    // create a fake docx or use a known file
    // well, I can just console.log the properties of the resolved object.
    console.log(parseOffice.toString());
  } catch (err) {
    console.error(err);
  }
}
test();
