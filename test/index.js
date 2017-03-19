import Module from '../src/.';

const module = new Module(null, null, 'http://play.afreecatv.com/aflol/190153440');
module.on('message', (data)=>console.info(JSON.stringify(data)))
module.connect();
setTimeout(()=>module.disconnect(), 5000);