'use strict';
/* Guard rail for the classic-script override chain. save/load/loop globals are
   wrapped by many modules; an unnoticed extra wrapper can change persistence or
   timing. This test only counts static assignment sites in load order. When a
   wrapper is added or removed on purpose, review the chain with
   `node tools/override-map.cjs <name>` and update tools/override-baseline.json. */
const test=require('node:test'),assert=require('node:assert/strict');
const {scan,overrideCount}=require('../tools/override-map.cjs');
const baseline=require('../tools/override-baseline.json');

test('save/load/loop override chains match the reviewed baseline',()=>{
 const {chains}=scan();
 for(const [name,count] of Object.entries(baseline.counts)){
  const entries=chains.get(name)||[];
  assert.equal(overrideCount(entries),count,`${name} override count changed; review: node tools/override-map.cjs ${name}\n`+entries.map(e=>`  [${e.kind}] ${e.file}:${e.line}`).join('\n'));
 }
});

test('every protected global keeps its original core definition first in load order',()=>{
 const {chains}=scan();
 for(const name of Object.keys(baseline.counts)){
  const first=(chains.get(name)||[])[0];
  assert(first,name+' must exist');
  assert.equal(first.kind,'define',name+' must start from a top-level declaration');
 }
});
