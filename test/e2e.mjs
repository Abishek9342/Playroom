// End-to-end test against a running dev server (npm run dev).
// Usage: npm run dev  (in one terminal), then: npm run test:e2e
// Covers: signup/login/logout, cross-origin block, room create/join/full/started,
// Word Chain rules + dictionary, tab-switch and leave-page elimination, grace period,
// XO win, card privacy + 5 rounds, Patches validation + answer not leaked.
// Uses fixed sleeps; prints results (not assertions). Read the output.
// Always read response bodies: the local dev server fails the NEXT request if one is left unread.
const B=process.env.BASE||'http://localhost:5173';
const WS=B.replace(/^http/,'ws');
async function signup(u){const r=await fetch(B+'/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u,password:'password123'})});const c=r.headers.get('set-cookie');return {body:await r.json(),cookie:c?c.split(';')[0]:null,status:r.status}}
function conn(cookie,token){return new Promise((res)=>{const ws=new WebSocket(`${WS}/api/rooms/${token}/ws`,{headers:{cookie}});const st={ws,last:null,errors:[]};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state')st.last=m;else st.errors.push(m)};ws.onopen=()=>setTimeout(()=>res(st),300);});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const s=Date.now()%100000;
const A=await signup('alice'+s),Bo=await signup('bob'+s),C=await signup('cara'+s);
console.log('signup',A.status,A.body.username);
const dup=await signup('alice'+s); /* expected 409 */ console.log('dup',dup.status,dup.body.error);
const bad=await fetch(B+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'alice'+s,password:'nope'})});console.log('badlogin',bad.status);
const me=await (await fetch(B+'/api/me',{headers:{cookie:A.cookie}})).json();console.log('me',me.username);
const noauth=await fetch(B+'/api/rooms',{method:'POST',body:'{}'});await noauth.text();console.log('noauth',noauth.status);
const xorig=await fetch(B+'/api/rooms',{method:'POST',headers:{cookie:A.cookie,origin:'https://evil.com','content-type':'application/json'},body:JSON.stringify({game:'wordchain',players:3})});await xorig.text();console.log('cross-origin',xorig.status);
// word chain, 3 players
const cr=await (await fetch(B+'/api/rooms',{method:'POST',headers:{cookie:A.cookie,'content-type':'application/json'},body:JSON.stringify({game:'wordchain',players:3})})).json();
console.log('token',cr.token);
const info=await (await fetch(B+'/api/rooms/'+cr.token,{headers:{cookie:Bo.cookie}})).json();console.log('info',info);
const a=await conn(A.cookie,cr.token),b=await conn(Bo.cookie,cr.token);
console.log('status after 2',a.last.status,a.last.players.length);
const c=await conn(C.cookie,cr.token);await sleep(200);
console.log('status after 3',a.last.status,'turn is alice?',a.last.g.turn===a.last.you);
const D=await signup('dan'+s);const d=await conn(D.cookie,cr.token);console.log('4th player:',d.errors[0]&&d.errors[0].message);
a.ws.send(JSON.stringify({type:'move',move:{type:'word',word:'apple'}}));await sleep(200);
b.ws.send(JSON.stringify({type:'move',move:{type:'word',word:'apple'}}));await sleep(200);
console.log('bob error:',b.errors.at(-1)&&b.errors.at(-1).message);
b.ws.send(JSON.stringify({type:'move',move:{type:'word',word:'eqzxv'}}));await sleep(200);console.log('fake word:',b.errors.at(-1).message);
b.ws.send(JSON.stringify({type:'move',move:{type:'word',word:'eagle'}}));await sleep(200);
console.log('words',a.last.g.words.map(w=>w.w).join(' > '),'need',a.last.g.need);
// cara switches tab -> eliminated after grace
c.ws.send(JSON.stringify({type:'hidden'}));await sleep(500);
console.log('cara away?',a.last.players.find(p=>p.name.startsWith('cara')).away);
await sleep(3000);
const cp=a.last.players.find(p=>p.name.startsWith('cara'));console.log('cara alive?',cp.alive,cp.reason,'turn alice?',a.last.g.turn===a.last.you);
// bob closes page -> eliminated -> alice wins
b.ws.close();await sleep(3500);
console.log('status',a.last.status,'winner alice?',a.last.result&&a.last.result.winner===a.last.you,a.last.result&&a.last.result.text);
console.log('events',a.last.events.map(e=>e.text));
// hidden then visible within grace -> not eliminated (XO)
const x=await (await fetch(B+'/api/rooms',{method:'POST',headers:{cookie:A.cookie,'content-type':'application/json'},body:JSON.stringify({game:'xo',players:2})})).json();
const xa=await conn(A.cookie,x.token),xb=await conn(Bo.cookie,x.token);await sleep(200);
xb.ws.send(JSON.stringify({type:'hidden'}));await sleep(1000);xb.ws.send(JSON.stringify({type:'visible'}));await sleep(2800);
console.log('xo bob still alive?',xa.last.players.every(p=>p.alive),xa.last.status);
for(const [w,i] of [[xa,0],[xb,3],[xa,1],[xb,4],[xa,2]]){w.ws.send(JSON.stringify({type:'move',move:{type:'place',i}}));await sleep(150);}
console.log('xo',xa.last.status,xa.last.result.text,xa.last.g.board.join(''));
// 5 cards (Least Count)
const k=await (await fetch(B+'/api/rooms',{method:'POST',headers:{cookie:A.cookie,'content-type':'application/json'},body:JSON.stringify({game:'cards',players:2})})).json();
const ka=await conn(A.cookie,k.token),kb=await conn(Bo.cookie,k.token);await sleep(250);
console.log('5cards hands',ka.last.g.hand.length,kb.last.g.hand.length,'decks',ka.last.g.decks,'bob sees alice hand?',JSON.stringify(kb.last.g).includes(JSON.stringify(ka.last.g.hand)));
const mv=(w,m)=>w.ws.send(JSON.stringify({type:'move',move:m}));
mv(kb,{type:'show'});await sleep(150);console.log('bob out of turn:',kb.errors.at(-1).message);
mv(ka,{type:'drop',cards:[ka.last.g.hand[0],ka.last.g.hand[1]]});await sleep(150);console.log('random 2-card drop:',ka.errors.at(-1)?ka.errors.at(-1).message:'(was a valid set)');
if(ka.last.g.phase==='drop'){mv(ka,{type:'drop',cards:[ka.last.g.hand[0]]});await sleep(150);}
mv(ka,{type:'pick',from:'draw'});await sleep(200);
console.log('after alice turn: turn is bob?',ka.last.g.turn===kb.last.you,'alice hand',ka.last.g.hand.length,'open drop by alice?',ka.last.g.openDrop.by===ka.last.you);
mv(kb,{type:'drop',cards:[kb.last.g.hand[0]]});await sleep(150);
mv(kb,{type:'pick',from:'drop',card:ka.last.g.openDrop.cards[0]});await sleep(200);
mv(ka,{type:'show'});await sleep(250);
const L=ka.last.g.last;console.log('show:',ka.last.g.phase,L.good?'valid':'invalid','points',JSON.stringify(Object.values(L.points)),'added',JSON.stringify(Object.values(L.added)),'totals',JSON.stringify(Object.values(ka.last.g.totals)));
// patches: solve with server's... we can't see answer; submit wrong
const pz=await (await fetch(B+'/api/rooms',{method:'POST',headers:{cookie:A.cookie,'content-type':'application/json'},body:JSON.stringify({game:'patches',players:2})})).json();
const pa=await conn(A.cookie,pz.token),pb=await conn(Bo.cookie,pz.token);await sleep(200);
pa.ws.send(JSON.stringify({type:'move',move:{type:'solve',rects:[{r:0,c:0,h:6,w:6}]}}));await sleep(200);
console.log('patches wrong:',pa.errors.at(-1).message,'clues',pa.last.g.clues.length, 'answer leaked?','answer' in pa.last.g);
// guests (join with a name only) + host settings
const post=(path,body,cookie)=>fetch(B+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
const G=await post('/api/guest',{name:'Priya K'});const gc=G.headers.get('set-cookie').split(';')[0];const gb=await G.json();
console.log('guest:',G.status,gb.name,'guest?',gb.guest);
const badName=await post('/api/guest',{name:'<script>'});await badName.text();console.log('bad guest name:',badName.status);
const gcreate=await post('/api/rooms',{game:'xo',players:2},gc);console.log('guest create room:',gcreate.status,(await gcreate.json()).error);
const badopt=await post('/api/rooms',{game:'cards',players:3,options:{decks:5}},A.cookie);console.log('bad options:',badopt.status,(await badopt.json()).error);
const r5=await (await post('/api/rooms',{game:'cards',players:3,options:{decks:2,exitAt:100}},A.cookie)).json();
const early=await conn(gc,r5.token);console.log('guest before host:',early.errors[0]&&early.errors[0].message);
const h5=await conn(A.cookie,r5.token),g5=await conn(gc,r5.token);await sleep(200);
console.log('seats:',h5.last.players.map(p=>p.name+(p.guest?' (guest)':'')).join(', '),'| options:',JSON.stringify(h5.last.options));
const c5=await conn(C.cookie,r5.token);await sleep(300);
console.log('host settings applied:',h5.last.status,'decks',h5.last.g.decks,'exit',h5.last.g.threshold,'draw pile',h5.last.g.drawCount,'(expect 110-15-1=94)');
const ginfo=await (await fetch(B+'/api/me',{headers:{cookie:gc}})).json();console.log('guest /me:',ginfo.name,ginfo.guest);
process.exit(0);
