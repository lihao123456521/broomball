// Export the browser catalog for the optional macOS audio rebuild tool.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'game-commentary-lines.js'), 'utf8'), sandbox);
const { BroomCommentaryClips: clips, BroomCommentaryLines: names } = sandbox.window;
const allNames = [...Object.values(names.houseNames), ...Object.values(names.nameById)];
process.stdout.write(JSON.stringify(Object.entries(clips).map(([id, line]) => ({ id, text: line.text, emphasis: allNames.filter(name => line.text.includes(name)) })), null, 2));
