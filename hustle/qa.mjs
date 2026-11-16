// Zero-dependency smoke tests: node hustle/qa.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext,runInContext} from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
let checks=0;
function check(ok,msg){assert.ok(ok,msg);checks++;}
check(html.includes('<title>HUSTLE'),'Document title');
check(html.includes('name="description"'),'SEO metadata');
check(html.includes('name="viewport"'),'Mobile viewport');
check(html.includes('@media(max-width:700px)'),'Mobile breakpoint');
check(html.includes('prefers-reduced-motion'),'Reduced motion');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
check(new Set(ids).size===ids.length,'Unique HTML IDs');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
check(Boolean(script),'Inline app script');
new Script(script,{filename:'hustle-inline.js'});checks++;
const elements=new Map();
function dom(id){if(!elements.has(id))elements.set(id,{
innerHTML:'',textContent:'',value:'',checked:false,style:{},handlers:{},
classList:{add(){},remove(){},toggle(){}},
addEventListener(n,cb){this.handlers[n]=cb},
showModal(){this.open=true},close(){this.open=false}
});return elements.get(id);}
const state={};
const sandbox=createContext({
document:{querySelector:dom,addEventListener(){}},
localStorage:{getItem:k=>state[k]??null,setItem:(k,v)=>{state[k]=v}},
window:{},navigator:{clipboard:{writeText:async()=>{}}},
setTimeout,clearTimeout,console});
runInContext(script,sandbox);checks++;
const ideas=runInContext('concepts',sandbox);
check(ideas.length===24,'24 concepts');
check(new Set(ideas.map(c=>c.id)).size===ideas.length,'Unique concept IDs');
check(new Set(ideas.map(c=>c.cat)).size>=5,'Category coverage');
for(const idea of ideas){
for(const field of ['name','hook','pain','mechanism','moment','users','extras','risk','test','limits','tag','cat'])check(typeof idea[field]==='string'&&idea[field].length>4,idea.id+': missing '+field);
check(idea.cost[0]>0&&idea.cost[1]>=idea.cost[0],idea.id+': cost range');
check(idea.wow>=1&&idea.wow<=5&&idea.feas>=1&&idea.feas<=5,idea.id+': ratings');
}
check((dom('#cards').innerHTML.match(/class="idea-card"/g)||[]).length===24,'All cards rendered');
dom('#search').value='sock';runInContext('render()',sandbox);
check((dom('#cards').innerHTML.match(/class="idea-card"/g)||[]).length===1,'Search filters');
dom('#search').value='';dom('#savedOnly').checked=true;
runInContext("toggleSaved('SNAP')",sandbox);
check((dom('#cards').innerHTML.match(/class="idea-card"/g)||[]).length===1,'Saved-only filter');
check(JSON.parse(state['hustle:saved']).includes('SNAP'),'Local persistence');
dom('#savedOnly').checked=false;
runInContext("toggleCompare('SNAP');compareNow()",sandbox);
check(dom('#compareDialog').open,'Comparison modal');
check(dom('#compareGrid').innerHTML.includes('SNAPLINE'),'Comparison content');
runInContext("openDetail('LIFT')",sandbox);
check(dom('#detail').open,'Details modal');
check(dom('#detailHero').innerHTML.includes('WINDOW WORM'),'Details content');
for(const idea of ideas){
const result=runInContext("score(concepts.find(x=>x.id==='"+idea.id+"'))",sandbox);
check(Number.isInteger(result)&&result>=0&&result<=100,idea.id+': score bounds');
}
check(ideas.find(x=>x.id==='SNAP').risk.includes('HIGH'),'High-rise risk labeled');
console.log('PASS: '+checks+' assertions; 24 inventions; no third-party dependencies.');
