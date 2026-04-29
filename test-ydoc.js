const Y = require('yjs');
const ydoc = new Y.Doc();
const ytext = ydoc.getText('text');
ytext.insert(0, 'hello world');
console.log(JSON.stringify(ydoc.toJSON()));
