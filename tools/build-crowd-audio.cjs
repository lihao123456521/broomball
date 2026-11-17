/* Decode the licensed recordings, downmix and make a seamless local stadium loop. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'assets/audio/crowd');
const files = {
 ambience: 'Gregor Quendel - Crowd Cheering Sounds - 09 - Ambience and cheering.mp3',
 cheer: 'Gregor Quendel - Crowd Cheering Sounds - 04 - Strong cheering - II - Short.mp3'
};
function wav(samples, rate) {
 const out = Buffer.alloc(44 + samples.length * 2);
 out.write('RIFF');out.writeUInt32LE(out.length - 8, 4);out.write('WAVEfmt ', 8);out.writeUInt32LE(16, 16);
 out.writeUInt16LE(1, 20);out.writeUInt16LE(1, 22);out.writeUInt32LE(rate, 24);out.writeUInt32LE(rate*2, 28);
 out.writeUInt16LE(2, 32);out.writeUInt16LE(16, 34);out.write('data', 36);out.writeUInt32LE(samples.length*2, 40);
 samples.forEach((sample, i) => out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample))*32767), 44+i*2));
 return out;
}
(async () => {
 const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
 try {
  const page = await browser.newPage(), catalog = {}, tracks = {};
  for (const [kind, file] of Object.entries(files)) {
   const original = fs.readFileSync(path.join(folder, 'originals', file));
   const decoded = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const decoder = new OfflineAudioContext(1, 1, 22050), buffer = await decoder.decodeAudioData(bytes.buffer);
    const context = new OfflineAudioContext(1, buffer.length, 22050), source = context.createBufferSource();
    source.buffer = buffer;source.connect(context.destination);source.start();
    return Array.from((await context.startRendering()).getChannelData(0));
   }, original.toString('base64'));
   const rate = 22050, overlap = rate*2;
   let samples;
   if (kind === 'ambience') {
    const loop = decoded.slice(rate*2, decoded.length-rate*2);
    samples = loop.slice(overlap, loop.length-overlap);
    for (let i = 0; i < overlap; i++) {
     const t = i/(overlap-1);
     samples.push(loop[loop.length-overlap+i]*(1-t)+loop[i]*t);
    }
   } else {
    samples = decoded.slice(rate, rate*8);
    samples = samples.map((v,i) => v*Math.min(1, i/(rate*.05), (samples.length-1-i)/(rate*.8)));
   }
   const rms = Math.sqrt(samples.reduce((n,v) => n+v*v, 0)/samples.length);
   const peak = samples.reduce((n,v) => Math.max(n, Math.abs(v)), 0);
   const gain = Math.min(10**((kind==='ambience'?-23:-18)/20)/rms, 10**(-3/20)/peak);
   samples = samples.map(v => v*gain);
   const output = wav(samples, rate);
   catalog[kind] = output.toString('base64');
   tracks[kind] = {file, sourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
    duration: samples.length/rate, sampleRate: rate, channels: 1, gain,
    rmsDbfs: 20*Math.log10(rms*gain), peakDbfs: 20*Math.log10(peak*gain),
    edits: kind==='ambience'?'mono downmix, 22050 Hz, trim 2-second recording fades from each end, 2-second tail/head crossfade, level adjustment':'mono downmix, 22050 Hz, excerpt 1–8 seconds, 50 ms attack and 800 ms release, level adjustment'};
   const preview = path.join(root, 'tests/artifacts');fs.mkdirSync(preview, {recursive: true});
   fs.writeFileSync(path.join(preview, 'crowd-'+kind+'.wav'), output);
  }
  const metadata = {title: 'Free Crowd Cheering Sounds', author: 'Gregor Quendel', license: 'CC BY 4.0',
   licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
   sourceUrl: 'https://opengameart.org/content/free-crowd-cheering-sounds',
   authorUrl: 'https://gregor-quendel.itch.io/free-crowd-cheering-sounds', tracks};
  fs.writeFileSync(path.join(folder,'manifest.json'), JSON.stringify(metadata,null,2)+'\n');
  fs.writeFileSync(path.join(folder,'catalog.js'), '/* Gregor Quendel — Free Crowd Cheering Sounds, CC BY 4.0. See README.md for attribution and edits. */\nwindow.BroomCrowdAudio=Object.freeze('+JSON.stringify({...catalog, metadata})+');\n');
  console.log(JSON.stringify(tracks,null,2));
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
