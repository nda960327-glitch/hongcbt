import fs from 'node:fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
for (const name of ['SAVED_JS','LIB_JS','NF_JS','KB_JS','INQ_JS','CLINICS_JS','ME_JS','ME2_JS','VERIFY_JS','LOGIN_JS','JOIN_JS','CENTERS_JS']) {
  const i = src.indexOf('const ' + name + ' = "'); if (i < 0) { console.log('?', name); continue; }
  const j = src.indexOf('</script>";', i);
  const s = JSON.parse(src.slice(i + ('const ' + name + ' = ').length, j + '</script>"'.length));
  try { new Function(s.replace(/^<script>/, '').replace(/<\/script>$/, '')); console.log('ok', name); } catch (e) { console.log('SYNTAX', name, String(e).slice(0, 140)); }
}
for (const name of ['WRITE_JS', 'COMMON_JS']) {
  const i = src.indexOf('const ' + name + ' = `'); const j = src.indexOf('</script>`;', i);
  let s = src.slice(i + ('const ' + name + ' = `').length, j).replace(/\$\{JSON\.stringify\((API|APP)\)\}/g, '"x"');
  s = eval('`' + s + '`');
  try { new Function(s.replace(/^<script>/, '')); console.log('ok', name); } catch (e) { console.log('SYNTAX', name, String(e).slice(0, 140)); }
}
