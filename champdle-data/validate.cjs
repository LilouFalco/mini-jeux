'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
const rows=read('champions.json'), dd=read('ddragon.json');
const roster=dd.data || dd, wiki=read('wiki-gameplay-fields.json');
const provenance=read('provenance.json'), lore=read('wiki-infoboxes.json');
const distinct=read('distinct-values.json'), meraki=read('meraki-fields.json');
const cd=read('communitydragon-summary.json');
const required=['id','name','gender','positions','species','resource','range','regions','year'];
const keys=Object.keys(roster).sort();
assert.equal(rows.length,keys.length);
assert.deepEqual(rows.map(c=>c.id).sort(),keys);
assert.equal(new Set(rows.map(c=>c.id)).size,rows.length);
for(const c of rows) {
  assert.deepEqual(Object.keys(c).sort(),[...required].sort());
  for(const field of ['id','name','gender','resource','range'])assert.ok(typeof c[field]==='string'&&c[field].trim(),c.id+' '+field);
  for(const field of ['positions','species','regions']) {
    assert.ok(Array.isArray(c[field])&&c[field].length,c.id+' '+field);
    assert.deepEqual(c[field],[...new Set(c[field])].sort());
    for(const v of c[field])assert.ok(typeof v==='string'&&v.trim());
  }
  assert.ok(Number.isInteger(c.year)&&c.year>=2009&&c.year<=Number(read('sources.json').checkedAt.slice(0,4)));
  const r=roster[c.id], w=wiki[r.key], p=provenance[c.id];
  assert.equal(c.name,r.name);
  assert.ok(p&&lore[c.id]&&p.pronouns&&p.speciesSource&&p.regionsSource,c.id+' missing evidence');
  assert.equal(p.loreUrl,lore[c.id].url);
  assert.equal(c.range,w.range);
  assert.equal(c.resource,w.resource==='None'?'Manaless':w.resource);
  assert.deepEqual(c.positions,[...w.positions].sort());
  assert.equal(c.year,Number(w.date.slice(0,4)));
  assert.equal(p.releaseDate,w.date);
  if(meraki[c.id]) assert.equal(p.releaseDate,meraki[c.id].releaseDate);
  const matches=cd.filter(x=>x.id===Number(r.key));
  assert.equal(matches.length,1,c.id+' communitydragon identity');
  assert.equal(matches[0].name,c.name);
}
for(const field of Object.keys(distinct)){
  const vals=[...new Set(rows.flatMap(c=>Array.isArray(c[field])?c[field]:[c[field]]))];
  vals.sort(field==='year'?(a,b)=>a-b:undefined);
  assert.deepEqual(vals,distinct[field],field+' distinct values out of date');
}
const lookup=Object.fromEntries(rows.map(c=>[c.id,c]));
assert.equal(lookup.Mel.year,2025);
assert.equal(lookup.Gnar.range,'Ranged');
assert.equal(lookup.Jayce.range,'Ranged');
assert.equal(lookup.Lillia.range,'Melee');
assert.deepEqual(lookup.Nunu.species,['Human','Yeti']);
const output={valid:true,count:rows.length,merakiCount:Object.keys(meraki).length,
missingFromMeraki:keys.filter(k=>!meraki[k]),unknownSpecies:rows.filter(c=>c.species.includes('Unknown')).map(c=>c.id),
distinctCounts:Object.fromEntries(Object.entries(distinct).map(([k,v])=>[k,v.length]))};
console.log(JSON.stringify(output,null,2));
