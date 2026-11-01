'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const path='data/preview-version.json';
const number=(raw,label)=>{
 const data=JSON.parse(raw);
 if(typeof data.version!=='string'||!/^v\\d+\\.\\d{3}$/.test(data.version))throw Error(label+' version invalid');
 const [,major,minor]=data.version.match(/^v(\\d+)\\.(\\d{3})$/);
 return Number(major)*1000+Number(minor);
};
const current=number(fs.readFileSync(path,'utf8'),'current');
let previous=0;
try{previous=number(cp.execFileSync('git',['show','HEAD^:'+path],{encoding:'utf8',stdio:['ignore','pipe','ignore']}),'previous');}
catch(error){if(error.status!==128)throw error;}
if(current!==previous+1)throw Error('Version must increase exactly once per commit: expected '+(previous+1)+' got '+current);
console.log('Preview version v'+Math.floor(current/1000)+'.'+String(current%1000).padStart(3,'0')+' validated.');
