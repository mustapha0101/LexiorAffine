const { DocCollection } = require('@blocksuite/store');
const collection = new DocCollection({ id: 'test' });
const doc = collection.createDoc({ id: 'doc1' });
doc.load(() => {
  const pageBlockId = doc.addBlock('affine:page', {});
  doc.addBlock('affine:surface', {}, pageBlockId);
  const noteId = doc.addBlock('affine:note', {}, pageBlockId);
  doc.addBlock('affine:paragraph', { text: new doc.Text('hello world text inside') }, noteId);
});
console.log(JSON.stringify(doc.spaceDoc.toJSON()));
