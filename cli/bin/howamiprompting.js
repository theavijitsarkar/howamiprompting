#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.error('howamiprompting needs Node.js 18.17 or newer (you have ' + process.versions.node + ').');
  process.exit(1);
}
import('../src/cli.js').then(m => m.main(process.argv.slice(2))).catch(e => {
  console.error('\n  Something went wrong:', e && e.message ? e.message : e);
  console.error('  Please report it: https://github.com/theavijitsarkar/howamiprompting/issues\n');
  process.exit(1);
});
