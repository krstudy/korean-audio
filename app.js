
const BASE_WORDS=window.__D.words;
const BASE_THEMES=window.__D.themes;
const AUD={};
// Data: BASE_* come from the project files (decrypted data.enc); edits live in edits.enc on the repo's "edits" branch as overrides,
// a map of the same paths the artifact db used:
//   words/<id>   {data: <whole word>} or {deleted: true}
//   meta/themes  {themes: [{name, ko, subs}]}
//   meta/known   {ids: {<id>: 1}}
// A localStorage copy gives instant paint and a fallback when db is unavailable.
const LS="kr-notebook-v1";
let OV={}, THEMES_OV=null, KNOWN={}, ORDER={}, pend={}, dbState="loading";
try{const c=JSON.parse(localStorage.getItem(LS)||"null");if(c){OV=c.ov||{};THEMES_OV=c.themes||null;KNOWN=c.known||{};ORDER=c.order||{};pend=c.pend||{}}}catch(e){}
function cacheLocal(){try{localStorage.setItem(LS,JSON.stringify({ov:OV,themes:THEMES_OV,known:KNOWN,order:ORDER,pend}))}catch(e){}}

const clone=o=>JSON.parse(JSON.stringify(o));
const arr=a=>Array.isArray(a)?a:[];
function normalize(w){
  w.pos=arr(w.pos);w.meanings=arr(w.meanings);w.synonyms=arr(w.synonyms);w.antonyms=arr(w.antonyms);w.examples=arr(w.examples);w.phrases=arr(w.phrases);
  w.meanings.forEach(m=>{m.topics=arr(m.topics);m.example_ids=arr(m.example_ids);m.phrase_ids=arr(m.phrase_ids)});
  w.examples.forEach(e=>e.hl=arr(e.hl));
  [...w.synonyms,...w.antonyms].forEach(r=>{r.examples=arr(r.examples);r.examples.forEach(e=>e.hl=arr(e.hl))});
  w.phrases.forEach(p=>{p.examples=arr(p.examples);p.similar=arr(p.similar);p.opposite=arr(p.opposite);
    p.examples.forEach(e=>e.hl=arr(e.hl));[...p.similar,...p.opposite].forEach(s=>{s.example=s.example||{ko:"",zh:"",hl:[]};s.example.hl=arr(s.example.hl)})});
  w.inflections=w.inflections||{};w.inflections.forms=arr(w.inflections.forms);
  const seen=new Set();w.tags={...(w.tags||{}),topics:w.meanings.flatMap(m=>m.topics).filter(t=>{const k=t.theme+"|"+t.sub;if(seen.has(k))return false;seen.add(k);return true})};
  return w;
}
let WORDS=[],THEMES=[],TNAMES=new Set();
/* custom order (meta/order {words:[ids], phrases:["<word id>:<phrase id>"]}); anything not listed keeps its place after the listed ones */
function rankOf(list){const m=new Map((list||[]).map((k,i)=>[k,i]));return (k,i)=>m.has(k)?m.get(k):1e6+i}
function rebuild(){
  const map=new Map(BASE_WORDS.map(w=>[w.id,w]));
  for(const [id,o] of Object.entries(OV)){if(!o)continue;if(o.deleted)map.delete(id);else if(o.data)map.set(id,o.data)}
  WORDS=[...map.values()].map(w=>normalize(clone(w)));
  const wi=rankOf(ORDER.words);WORDS=WORDS.map((w,i)=>[w,i]).sort((a,b)=>wi(a[0].id,a[1])-wi(b[0].id,b[1])).map(x=>x[0]);
  const ths=THEMES_OV||BASE_THEMES;TNAMES=new Set(ths.map(t=>t.name));
  THEMES=ths.map(t=>({...t,subs:arr(t.subs),key:t.name,words:WORDS.filter(w=>w.meanings.some(m=>m.topics.some(x=>x.theme===t.name)))}));
  const orphan=WORDS.filter(w=>!w.meanings.some(m=>m.topics.some(x=>TNAMES.has(x.theme))));
  THEMES.push({name:"未分類",ko:"",subs:[],key:"__none",words:orphan,virtual:true});
}
const inT=(m,t)=>!t||(t==="__none"?!m.topics.some(x=>TNAMES.has(x.theme)):m.topics.some(x=>x.theme===t));
const subOf=(w,t)=>{for(const m of w.meanings)for(const x of m.topics)if(x.theme===t&&x.sub)return x.sub;return null};
const POS0=["名詞","動詞","形容詞"];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- audio: embedded mp3s, browser voice for anything without one ---------- */
const canSpeak="speechSynthesis" in window;
const ico='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
const sa=(t,a)=>` data-say="${esc(t)}"${a?` data-audio="${esc(a)}"`:""} role="button" tabindex="0"`;
const say=(t,a)=>`<button class="say" type="button" data-say="${esc(t)}"${a?` data-audio="${esc(a)}"`:""} aria-label="播放 ${esc(t)}">${ico}</button>`;
const player=new Audio();player.preload="auto";player.setAttribute("playsinline","");
const ready={};
const b64url=b=>{const bin=atob(b),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([u8],{type:"audio/mpeg"}))};
function inl(a){if(ready[a])return ready[a];const b=AUD[a];if(!b)return null;return ready[a]=b64url(b)}
/* Each mp3 is an encrypted file a/<name>; __D.amap maps "audio/<word id>/<file>" to its name. Fetched when a word is opened. */
const fetching={};
function fetchAud(a){if(ready[a]||inl(a))return Promise.resolve(ready[a]);if(fetching[a])return fetching[a];
  const name=window.__D.amap[a];if(!name)return Promise.resolve(null);
  const p=window.__S.file("a/"+name).then(u8=>{if(u8)return ready[a]=URL.createObjectURL(new Blob([u8],{type:"audio/mpeg"}));delete fetching[a];return null})
    .catch(()=>{delete fetching[a];return null});
  return fetching[a]=p}
function prefetch(root){const q=[...new Set([...root.querySelectorAll("[data-audio]")].map(e=>e.dataset.audio))].filter(a=>!ready[a]&&!fetching[a]);
  const next=()=>{const a=q.shift();if(a)fetchAud(a).then(next)};for(let i=0;i<6;i++)next()}
const SIL="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
let seq=0;
function play(t,a){const n=++seq;let u=a&&(ready[a]||inl(a));
  try{player.pause();
    if(u){player.src=u;player.play().catch(()=>speak(t));return}
    if(!a){speak(t);return}
    player.src=SIL;player.play().catch(()=>{}); /* unlock playback inside the tap, then swap in the real audio */
    fetchAud(a).then(u2=>{if(n!==seq)return;if(!u2){speak(t);return}player.src=u2;player.play().catch(()=>speak(t))})
  }catch(e){speak(t)}}
function speak(t){if(!canSpeak)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang="ko-KR";u.rate=.9;
  const v=speechSynthesis.getVoices().find(v=>(v.lang||"").startsWith("ko"));if(v)u.voice=v;speechSynthesis.speak(u)}catch(e){}}
document.addEventListener("keydown",e=>{const b=e.target.closest&&e.target.closest("[data-say]:not(.say)");if(b&&(e.key==="Enter"||e.key===" ")){e.preventDefault();e.stopPropagation();play(b.dataset.say,b.dataset.audio)}},true);
document.addEventListener("click",e=>{if(e.target.closest("#ed"))return;const b=e.target.closest("[data-say]");if(b){e.preventDefault();e.stopPropagation();play(b.dataset.say,b.dataset.audio)}},true);

/* ---------- reading view (same layout as the preview) ---------- */
function mark(ko,hl){let s=esc(ko);(hl||[]).filter(Boolean).slice().sort((a,b)=>b.length-a.length).forEach(h=>{const e=esc(h);if(e)s=s.split(e).join(`\u0000${e}\u0001`)});
  return s.replace(/\u0000/g,'<span class="hl">').replace(/\u0001/g,'</span>');}
const ex=e=>`<div class="ex"><div class="t"><div class="k"${sa(e.ko,e.audio)}>${mark(e.ko,e.hl)}</div><div class="z">${esc(e.zh)}</div>${e.note?`<div class="note">${esc(e.note)}</div>`:""}</div>${say(e.ko,e.audio)}</div>`;
/* phrases show the 요 form first, dictionary form of the verb only in brackets: 물을 마셔요（마시다）, and play the 요-form audio (audio_yo). */
const yo=p=>{if(!p.yo)return "";const n=p.yo.trim().split(/\s+/).length,w=p.phrase.trim().split(/\s+/);return `<span class="yo">（${esc(w.slice(Math.max(0,w.length-n)).join(" "))}）</span>`};
/* p.yo holds only the conjugated ending ("못 들어요" for "알람을 못 듣다"): swap it in for the same number of words at the end */
const yoFull=p=>{if(!p.yo)return p.phrase;const y=p.yo.trim().split(/\s+/),w=p.phrase.trim().split(/\s+/);return w.length>y.length?[...w.slice(0,w.length-y.length),...y].join(" "):p.yo};
const pAud=p=>p.yo?(p.audio_yo||null):p.audio; /* 요-form audio; browser voice reads the 요 form until it is made */
const phx=p=>`<b${sa(yoFull(p),pAud(p))}>${esc(yoFull(p))}</b>${yo(p)}`;
const rel=(lab,a,cls)=>a.length?`<section class="rsec ${cls}"><h3 class="rh"><span>${lab}</span><small>${a.length}</small></h3><ul class="rlist">${a.map(r=>`<li><div class="rrow"><b class="rw"${sa(r.word,r.audio)}>${esc(r.word)}</b><span class="rz">${esc(r.zh)}</span>${say(r.word,r.audio)}</div>${r.note?`<div class="rn">${esc(r.note)}</div>`:""}${r.examples&&r.examples.length?`<details class="fm sm"><summary>例句（${r.examples.length}）</summary>${r.examples.map(ex).join("")}</details>`:""}</li>`).join("")}</ul></section>`:"";
const spoken=f=>String(f||"").replace(/[()]/g," ").replace(/\//g,",").replace(/\s+/g," ").replace(/^[ ,]+|[ ,]+$/g,"");
const topicName=x=>x.theme+(x.sub?"／"+x.sub:"");
function parts(w,tk){
  const mine=w.meanings.filter(m=>inT(m,tk)), rest=w.meanings.filter(m=>!inT(m,tk));
  const linked=e=>w.meanings.some(m=>m.example_ids.includes(e.id));
  const exIds=new Set(mine.flatMap(m=>m.example_ids));
  const exs=[...w.examples.filter(e=>exIds.has(e.id)||!linked(e)),...w.examples.filter(e=>!exIds.has(e.id)&&linked(e))];
  const pids=new Set(mine.flatMap(m=>m.phrase_ids));
  const phs=[...w.phrases.filter(p=>pids.has(p.id)),...w.phrases.filter(p=>!pids.has(p.id))];
  const f=w.inflections, rels=rel("近義",w.synonyms,"syn")+rel("反義",w.antonyms,"ant");
  const meta=[w.origin_type?esc(w.origin_type)+(w.hanja?"・"+esc(w.hanja):""):"",w.level?esc(w.level):""].filter(Boolean);
  return [
    {k:"mean",n:"意思",html:`<div class="dhead"><span class="big"${sa(w.word,w.audio)}>${esc(w.word)}</span>${w.pronunciation?`<span class="pr">${esc(w.pronunciation)}</span>`:""}${say(w.word,w.audio)}</div>
      <div class="tags">${w.pos.map(p=>`<span class="tg">${esc(p)}</span>`).join("")}${meta.map(m=>`<span class="tg o">${m}</span>`).join("")}</div>
      <h3>意思</h3><ol class="mean">${mine.map(m=>`<li>${esc(m.zh)}</li>`).join("")}</ol>
      ${rest.length?`<div class="other"><div class="lab">其他意思</div><ul>${rest.map(m=>`<li>${esc(m.zh)} ${m.topics.length?m.topics.map(x=>TNAMES.has(x.theme)?`<button type="button" class="tg o golink" data-go-theme="${esc(x.theme)}" data-go-sub="${esc(x.sub||"")}">${esc(topicName(x))} ›</button>`:`<span class="tg o">${esc(topicName(x))}</span>`).join(" "):`<span class="tg o">未分類</span>`}</li>`).join("")}</ul></div>`:""}
      ${exs.length?`<details class="fm"><summary>例句（${exs.length}）</summary>${exs.map(ex).join("")}</details>`:""}`},
    {k:"ph",n:"片語",c:phs.length,html:phs.map(ph=>`<div class="phc" id="ph-${esc(ph.id)}"><div class="pt">${phx(ph)}<span>${esc(ph.zh)}</span>${say(yoFull(ph),pAud(ph))}</div>
      ${ph.explanation?`<p style="margin:4px 0 6px;font-size:.88rem">${esc(ph.explanation)}</p>`:""}${ph.examples.length+ph.similar.length+ph.opposite.length?`<details class="fm sm"><summary>例句${ph.similar.length+ph.opposite.length?"・相似相反":""}</summary>${ph.examples.map(ex).join("")}
      ${ph.similar.map(s=>`<div class="alt"><span>相似${phx(s)}<span class="az">${esc(s.zh)}</span></span>${say(yoFull(s),pAud(s))}</div>${s.example&&s.example.ko?ex(s.example):""}`).join("")}
      ${ph.opposite.map(s=>`<div class="alt"><span>相反${phx(s)}<span class="az">${esc(s.zh)}</span></span>${say(yoFull(s),pAud(s))}</div>${s.example&&s.example.ko?ex(s.example):""}`).join("")}</details>`:""}</div>`).join("")||`<p class="note" style="padding-top:12px">還沒有片語</p>`},
    {k:"rel",n:"近反義",c:w.synonyms.length+w.antonyms.length,html:rels?`<div class="rels">${rels}</div>`:`<p class="note" style="padding-top:12px">還沒有近義詞或反義詞</p>`},
    {k:"form",n:w.pos.includes("名詞")&&!f.stem?"助詞":"變化",c:f.forms.length,html:`${f.irregular?`<p class="note" style="margin-top:14px">${esc(f.irregular)}</p>`:""}${f.forms.length?`<div class="forms" style="margin-top:10px">${f.forms.map(x=>`<div><small>${esc(x.label)}</small><span class="fv"><b>${esc(x.form)}</b>${x.pron?` <i>${esc(x.pron)}</i>`:""}</span></div>`).join("")}</div>`:`<p class="note" style="padding-top:12px">還沒有型態變化</p>`}`}
  ];
}
let st={theme:null,sub:null,pos:null,q:"",cur:null,tab:"mean",visible:[],view:"word",kf:null,org:false,sel:new Set()};
try{const h=JSON.parse(localStorage.getItem(LS+"-ui")||"{}");if(h.hide)document.body.classList.add("hidezh")}catch(e){}
const isK=w=>false; /* 會了／還不會 removed (2026-10-25); KNOWN is still loaded and kept */
const kOK=w=>!st.kf||(st.kf==="k"?isK(w):!isK(w));
function match(w){const q=st.q.trim().toLowerCase();
  return (!st.pos||w.pos.includes(st.pos))&&kOK(w)&&(!q||w.word.includes(q)||w.id.includes(q)||w.meanings.some(m=>m.zh.includes(q)));}
const ORG=()=>st.org&&!st.q.trim();
const ck=k=>ORG()&&st.view==="word"?`<span class="ck${st.sel.has(k)?" on":""}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span>`:"";
const grip=()=>ORG()?`<span class="grip" data-grip="1" aria-label="按住拖拉排順序"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg></span>`:"";
function rowHTML(tk,w){st.visible.push([tk,w.id]);const z=w.meanings.filter(m=>inT(m,tk)).map(m=>m.zh).join("；")||w.meanings.map(m=>m.zh).join("；");
  return `<div class="w${isK(w)?" isknown":""}${ORG()?" org":""}${ORG()&&st.sel.has(w.id)?" picked":""}" role="button" tabindex="0" data-id="${esc(w.id)}" data-t="${esc(tk)}" data-k="${esc(w.id)}">${ck(w.id)}<span class="hw">${esc(w.word)}</span>${w.pronunciation?`<span class="rp">${esc(w.pronunciation)}</span>`:""}${say(w.word,w.audio)}<span class="zh">${esc(z)}</span>${isK(w)?`<span class="known-b">會了</span>`:""}<span class="pos">${esc(w.pos.join("・"))}</span>${ORG()?grip():`<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`}</div>`}
function themePhrases(w,tk){const ids=new Set(w.meanings.filter(m=>inT(m,tk)).flatMap(m=>m.phrase_ids));const linked=new Set(w.meanings.flatMap(m=>m.phrase_ids));
  return w.phrases.filter(p=>ids.has(p.id)||!linked.has(p.id));}
function sortPh(a,off){const r=rankOf(ORDER.phrases),k=x=>x[off?1:0].id+":"+x[off?2:1].id;return a.map((x,i)=>[x,r(k(x),i)]).sort((x,y)=>x[1]-y[1]).map(x=>x[0])}
const pmatch=(p,q)=>p.phrase.includes(q)||(p.zh||"").includes(q)||(p.yo||"").includes(q);
function phRow(tk,w,p){if(!st.visible.some(v=>v[0]===tk&&v[1]===w.id))st.visible.push([tk,w.id]);
  return `<div class="w pr${ORG()?" org":""}" role="button" tabindex="0" data-id="${esc(w.id)}" data-t="${esc(tk)}" data-ph="${esc(p.id)}" data-k="${esc(w.id+":"+p.id)}"><span class="pw"><span class="hw">${esc(yoFull(p))}</span>${yo(p)}${say(yoFull(p),pAud(p))}<span class="zh">${esc(p.zh)}</span></span><span class="from">${esc(w.word)}</span>${ORG()?grip():`<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`}</div>`}
function viewTabs(nw,np){const V=document.getElementById("view");V.hidden=false;
  V.innerHTML=[["word","單字",nw],["phrase","片語",np]].map(([k,n,c])=>`<button type="button" data-v="${k}" aria-pressed="${st.view===k}">${n}<small>${c}</small></button>`).join("")}
function posTabs(pool){const P=document.getElementById("pos");P.hidden=false;const extra=[...new Set(WORDS.flatMap(w=>w.pos))].filter(p=>!POS0.includes(p));
  P.innerHTML=[null,...POS0,...extra].map(p=>`<button type="button" data-p="${esc(p??"")}" aria-pressed="${st.pos===p}">${esc(p??"全部")}<small>${pool.filter(w=>!p||w.pos.includes(p)).length}</small></button>`).join("")}
function kTabs(pool){const K=document.getElementById("kf");K.hidden=false;
  K.innerHTML=[[null,"全部"],["u","還不會"],["k","會了"]].map(([k,n])=>`<button type="button" data-k="${k??""}" aria-pressed="${st.kf===k}">${n}<small>${pool.filter(w=>!k||(k==="k"?isK(w):!isK(w))).length}</small></button>`).join("")}
function draw(){
  const q=st.q.trim(), T=document.getElementById("themes"), out=document.getElementById("out");
  st.visible=[];
  const loose=w=>{const p=st.pos,k=st.kf;st.pos=null;st.kf=null;const m=match(w);st.pos=p;st.kf=k;return m};
  if(q){
    T.innerHTML=`<span class="crumb">搜尋全部主題</span>`;
    const hits=[];THEMES.forEach(t=>t.words.forEach(w=>{if(!hits.some(h=>h[1]===w))hits.push([t.key,w])}));
    const pool=hits.filter(h=>loose(h[1])).map(h=>h[1]);posTabs(pool);
    const ws=hits.filter(h=>match(h[1]));
    const ql=q.toLowerCase(), ps=[];hits.forEach(([tk,w])=>{if((!st.pos||w.pos.includes(st.pos))&&kOK(w))w.phrases.forEach(p=>{if(pmatch(p,ql))ps.push([tk,w,p])})});
    const psS=sortPh(ps,1);ps.length=0;ps.push(...psS);viewTabs(ws.length,ps.length);
    const list=st.view==="phrase"?ps.map(([tk,w,p])=>phRow(tk,w,p)):ws.map(([tk,w])=>rowHTML(tk,w));
    out.innerHTML=list.length?`<div class="list" style="margin-top:14px">${list.join("")}</div>`:`<div class="empty">沒有符合的${st.view==="phrase"?"片語":"單字"}</div>`;markQ(out);return;
  }
  const th=THEMES.find(x=>x.key===st.theme&&(x.words.length||!x.virtual));
  if(!th){
    st.theme=null;st.org=false;orgBar();T.innerHTML="";["pos","view","kf"].forEach(i=>document.getElementById(i).hidden=true);
    const cards=THEMES.filter(t=>!t.virtual||t.words.length);
    out.innerHTML=`<div class="tgrid">${cards.map(t=>`<button class="tcard${t.virtual?" none":""}" type="button" data-open="${esc(t.key)}"><span class="tn">${esc(t.name)}</span>${t.ko?`<span class="tko">${esc(t.ko)}</span>`:""}<span class="tc">${t.words.length} 個字</span>${t.subs.length?`<span class="ts">${t.subs.map(esc).join("・")}</span>`:""}</button>`).join("")}</div>
`;return;
  }
  const subs=th.subs;
  const unc=th.words.some(w=>!subs.includes(subOf(w,th.key)));
  const opts=subs.length?[null,...subs,...(unc?["未分類"]:[])]:[];
  if(st.sub&&!opts.includes(st.sub))st.sub=null;
  const inSub=w=>!st.sub||(st.sub==="未分類"?!subs.includes(subOf(w,th.key)):subOf(w,th.key)===st.sub);
  T.innerHTML=(RET?`<button class="retbtn" type="button" data-ret="1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>回到「${esc(RET.word)}」</button>`:"")+`<button class="crumbback" type="button" data-home="1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>主題</button><span class="crumb"><b>${esc(th.name)}</b> <span class="tko">${esc(th.ko)}</span></span><button class="tbtn orgbtn" type="button" data-org="1" aria-pressed="${!!st.org}">${st.org?"完成":"整理"}</button>`+
    (opts.length?`<div class="subchips">${opts.map(s=>`<button class="tchip" type="button" data-sub="${esc(s??"")}" aria-pressed="${st.sub===s}">${esc(s??"全部")}<small>${th.words.filter(w=>s===null||(s==="未分類"?!subs.includes(subOf(w,th.key)):subOf(w,th.key)===s)).length}</small></button>`).join("")}</div>`:"");
  const pool=th.words.filter(w=>inSub(w)&&loose(w));posTabs(pool);
  const ws=th.words.filter(w=>inSub(w)&&match(w));
  const ps=sortPh(ws.flatMap(w=>themePhrases(w,th.key).map(p=>[w,p])));
  viewTabs(ws.length,ps.length);
  const list=st.view==="phrase"?ps.map(([w,p])=>phRow(th.key,w,p)):ws.map(w=>rowHTML(th.key,w));
  queueMicrotask(()=>markQ(out));
  out.innerHTML=(list.length?`<div class="list" style="margin-top:14px">${ORG()?`<p class="orghint">${st.view==="word"?"點字勾選，可以一次搬到別的主題或小分類。":""}按住右邊的 ≡ 上下拖，可以調整順序。</p>`:""}${list.join("")}</div>`:`<div class="empty">沒有符合的${st.view==="phrase"?"片語":"單字"}</div>`);
  orgBar();
}
const sheet=document.getElementById("sheet");
function openWord(tk,id,ph){st.cur=[tk,id];st.tab=ph?"ph":"mean";renderSheet();sheet.hidden=false;document.body.classList.add("locked");sheet.scrollTop=0;
  if(ph){const el=document.getElementById("ph-"+ph);if(el){el.classList.add("focus");const top=el.getBoundingClientRect().top-document.querySelector(".shead").getBoundingClientRect().bottom-8;sheet.scrollTop+=top}}}
function renderSheet(){
  const [tk,id]=st.cur, w=WORDS.find(x=>x.id===id);if(!w){closeSheet();return}
  const tabs=parts(w,tk);
  if(!tabs.some(x=>x.k===st.tab))st.tab="mean";
  document.getElementById("tabs").innerHTML=tabs.map(x=>`<button type="button" role="tab" data-tab="${x.k}" aria-selected="${st.tab===x.k}">${x.n}${x.c!=null?`<small>${x.c}</small>`:""}</button>`).join("");
  document.getElementById("sbody").innerHTML=tabs.find(x=>x.k===st.tab).html;markQ(document.getElementById("sbody"));
  prefetch(document.getElementById("sbody"));{const all=document.createElement("div");all.innerHTML=tabs.map(x=>x.html).join("");prefetch(all)}

  const i=st.visible.findIndex(v=>v[0]===tk&&v[1]===id);
  document.getElementById("prev").disabled=i<=0; document.getElementById("next").disabled=i<0||i>=st.visible.length-1;
}
function closeSheet(){sheet.hidden=true;document.body.classList.remove("locked")}
document.getElementById("back").onclick=closeSheet;
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!ed.hidden)return;if(!sheet.hidden)closeSheet()}});
document.getElementById("tabs").onclick=e=>{const b=e.target.closest("[data-tab]");if(!b)return;st.tab=b.dataset.tab;renderSheet();sheet.scrollTop=0};
const step=d=>{const i=st.visible.findIndex(v=>v[0]===st.cur[0]&&v[1]===st.cur[1]);const n=st.visible[i+d];if(n){st.cur=n;renderSheet();sheet.scrollTop=0}};
document.getElementById("prev").onclick=()=>step(-1);document.getElementById("next").onclick=()=>step(1);
/* jump from a word's other meaning to that theme/subcategory, with a way back to the word */
let RET=null;
document.getElementById("sbody").addEventListener("click",e=>{const g=e.target.closest(".golink");if(!g)return;e.stopPropagation();
  const w=WORDS.find(x=>x.id===st.cur[1]);
  RET={word:w?w.word:"",theme:st.theme,sub:st.sub,pos:st.pos,kf:st.kf,view:st.view,q:st.q,cur:st.cur,tab:st.tab,y:scrollY,sy:sheet.scrollTop};
  closeSheet();st.q="";document.getElementById("q").value="";st.theme=g.dataset.goTheme;st.sub=g.dataset.goSub||null;st.pos=null;st.kf=null;st.view="word";draw();scrollTo(0,0)},true);
function goBack(){const r=RET;if(!r)return;RET=null;Object.assign(st,{theme:r.theme,sub:r.sub,pos:r.pos,kf:r.kf,view:r.view,q:r.q});document.getElementById("q").value=r.q;draw();scrollTo(0,r.y);
  openWord(r.cur[0],r.cur[1]);st.tab=r.tab;renderSheet();sheet.scrollTop=r.sy}
document.getElementById("sbody").addEventListener("click",e=>{if(!document.body.classList.contains("hidezh"))return;const li=e.target.closest(".mean li,.ex .z,.other li");if(li)li.classList.toggle("shown")});
document.getElementById("hidebtn").onclick=e=>{const on=document.body.classList.toggle("hidezh");e.currentTarget.setAttribute("aria-pressed",on);try{localStorage.setItem(LS+"-ui",JSON.stringify({hide:on}))}catch(x){}};
document.getElementById("hidebtn").setAttribute("aria-pressed",document.body.classList.contains("hidezh"));
document.getElementById("themes").onclick=e=>{if(e.target.closest("[data-ret]")){goBack();return}
  if(e.target.closest("[data-org]")){st.org=!st.org;st.sel.clear();draw();return}
  const h=e.target.closest("[data-home]");if(h){RET=null;st.theme=null;st.sub=null;st.pos=null;st.kf=null;draw();return}
  const b=e.target.closest("[data-sub]");if(b){st.sub=b.dataset.sub||null;draw()}};
document.getElementById("pos").onclick=e=>{const b=e.target.closest("[data-p]");if(!b)return;st.pos=b.dataset.p||null;draw()};
document.getElementById("kf").onclick=e=>{const b=e.target.closest("[data-k]");if(!b)return;st.kf=b.dataset.k||null;draw()};
document.getElementById("q").oninput=e=>{st.q=e.target.value;draw()};
const menu=document.getElementById("menu"),menubtn=document.getElementById("menubtn");
const setMenu=o=>{menu.hidden=!o;menubtn.setAttribute("aria-expanded",o)};
menubtn.onclick=e=>{e.stopPropagation();setMenu(menu.hidden)};
document.addEventListener("click",e=>{if(!menu.hidden&&!e.target.closest(".menuwrap"))setMenu(false)});
menu.onclick=e=>{const b=e.target.closest("button");if(!b)return;setMenu(false);if(b.dataset.themes)openThemeEditor();if(b.dataset.newword)openWordEditor(null);if(b.dataset.perm)openPerm()};
document.getElementById("out").addEventListener("click",e=>{
  const c=e.target.closest("[data-open]");if(c){st.theme=c.dataset.open;st.sub=null;draw();scrollTo(0,0);return}
  const b=e.target.closest(".w");if(b)openWord(b.dataset.t,b.dataset.id,b.dataset.ph)});
document.getElementById("out").addEventListener("keydown",e=>{const b=e.target.closest(".w");if(b&&(e.key==="Enter"||e.key===" ")&&e.target===b){e.preventDefault();openWord(b.dataset.t,b.dataset.id,b.dataset.ph)}});
document.getElementById("view").onclick=e=>{const b=e.target.closest("[data-v]");if(!b)return;st.view=b.dataset.v;draw()};
document.getElementById("editw").onclick=()=>openWordEditor(st.cur[1]);

/* ---------- saving: one encrypted file, edits.enc on the repo's "edits" branch, written through the GitHub API ---------- */
const syncEl=document.getElementById("sync");
const S=window.__S;
let saving=false,saveT=null,fails=0;
function showSync(){const n=Object.keys(pend).length+(saving?1:0);syncEl.title="";
  if(!S.token){syncEl.textContent="⚠ 只存在這台裝置";syncEl.className="sync warn";syncEl.title="還沒設定編輯權限（管理 → 設定編輯權限），修改只會存在這個瀏覽器";return}
  if(dbState==="loading"){syncEl.textContent="讀取中…";syncEl.className="sync";return}
  if(fails||dbState==="off"){syncEl.textContent=fails?"⚠ 有修改沒存到":"⚠ 連不上，先用這台裝置的資料";syncEl.className="sync warn";return}
  syncEl.textContent=n?"儲存中…":"✓ 已同步";syncEl.className="sync"}
function write(path,body){pend[path]=clone(body);cacheLocal();if(S.token){clearTimeout(saveT);saveT=setTimeout(flush,700)}showSync()}
/* read the file, lay the unsaved changes over it, write it back; GitHub refuses a stale sha, so a clash with another device just retries */
async function flush(){if(saving||!S.token||!Object.keys(pend).length)return;saving=true;showSync();
  for(let tries=0;tries<4;tries++){const batch={...pend};
    try{const cur=await S.pull();const m={...cur.map,...batch};await S.push(m,cur.sha);
      for(const k in batch)if(pend[k]===batch[k])delete pend[k];fails=0;dbState="on";applyRemote(m);break}
    catch(e){if(e&&e.conflict&&tries<3){await new Promise(r=>setTimeout(r,500+Math.random()*800));continue}fails++;toast("儲存失敗："+((e&&e.message)||e));break}}
  saving=false;showSync();refreshSafe();if(Object.keys(pend).length&&!fails)flush()}
function applyRemote(m){let o={},th=null,kn={},od={};
  for(const [k,v] of [...Object.entries(m||{}),...Object.entries(pend)]){ /* unsaved local changes win */
    if(k.startsWith("words/"))o[k.slice(6)]=v;else if(k==="meta/themes")th=v.themes;else if(k==="meta/known")kn={...(v.ids||{})};else if(k==="meta/order")od={words:v.words,phrases:v.phrases}}
  OV=o;THEMES_OV=th;KNOWN=kn;ORDER=od;cacheLocal()}
function saveWord(w){OV[w.id]={data:w};write("words/"+w.id,{data:w,t:Date.now()})}
function deleteWord(id){OV[id]={deleted:true};write("words/"+id,{deleted:true,t:Date.now()})}
function saveThemes(list){THEMES_OV=list;write("meta/themes",{themes:list,t:Date.now()})}
function saveKnown(){write("meta/known",{ids:KNOWN,t:Date.now()})}
let toastT;function toast(m){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}
function refresh(){rebuild();draw();if(!sheet.hidden&&st.cur)renderSheet()}

/* ---------- editors ---------- */
const ed=document.getElementById("ed"), edb=document.getElementById("edbody");
let D=null, EDKIND=null, EDNEW=false;
const X='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const gp=(o,p)=>p.split(".").reduce((a,k)=>a==null?a:a[k],o);
function sp(o,p,v){const ks=p.split(".");const l=ks.pop();const t=ks.reduce((a,k)=>a[k],o);t[l]=v}
const LISTSEP=/[,，、;；]\s*/;
function fi(p,label,o={}){const v=gp(D,p);const val=Array.isArray(v)?v.join("、"):(v??"");
  const at=`data-p="${p}"${o.list?' data-list="1"':""}${o.nul?' data-null="1"':""}${o.aud?` data-aud="${o.aud}"`:""}${o.ko?' class="ko" lang="ko"':""}${o.ph?` placeholder="${esc(o.ph)}"`:""}`;
  return `<label class="fi${o.wide?" wide":""}"><span>${label}</span>${o.area?`<textarea ${at} rows="${o.rows||2}">${esc(val)}</textarea>`:`<input ${at} value="${esc(val)}">`}</label>`}
const xb=(path,label)=>`<button class="x" type="button" data-del="${path}" aria-label="刪除${label||""}">${X}</button>`;
const sec=(title,cnt,inner,open)=>`<details class="esec"${open?" open":""}><summary>${title}${cnt!=null?` <small>${cnt}</small>`:""}</summary>${inner}</details>`;
function themeOpts(sel){const names=THEMES.filter(t=>!t.virtual).map(t=>t.name);if(sel&&!names.includes(sel))names.push(sel);
  return `<option value="">（不放主題）</option>`+names.map(n=>`<option${n===sel?" selected":""}>${esc(n)}</option>`).join("")}
function subOpts(theme,sel){const t=THEMES.find(x=>x.name===theme);const s=t?[...t.subs]:[];if(sel&&!s.includes(sel))s.push(sel);
  return `<option value="">未分類</option>`+s.map(n=>`<option${n===sel?" selected":""}>${esc(n)}</option>`).join("")}
function meanSel(kind,id){const cur=D.meanings.findIndex(m=>m[kind].includes(id));
  return `<label class="fi"><span>屬於哪個意思</span><select data-link="${kind}" data-id="${esc(id)}"><option value="-1">（全部意思共用）</option>${D.meanings.map((m,i)=>`<option value="${i}"${i===cur?" selected":""}>${i+1}. ${esc(m.zh||"（還沒填）")}</option>`).join("")}</select></label>`}
const exFields=(p,aud)=>`<div class="grid">${fi(p+".ko","韓文例句",{ko:1,wide:1,area:1,aud:aud})}${fi(p+".zh","中文翻譯",{wide:1})}${fi(p+".hl","要標紅的字（用、分開）",{list:1,ko:1,wide:1})}${fi(p+".note","備註",{wide:1})}</div>`;
function wordForm(){
  const w=D;let h="";
  if(EDNEW)h+=`<div class="gen"><span class="hint">只填單字（主題也可以先選）就可以儲存。意思、例句、片語和語音，之後在專案裡跟 Claude 說「幫我補 ${esc(w.word||"這個字")}」就會補好。</span></div>`;
  h+=sec("基本資料",null,`<div class="grid">${fi("word","單字",{ko:1,aud:"audio"})}${fi("pronunciation","發音（跟拼寫一樣就留空）",{ko:1,nul:1,ph:"例：[먹따]"})}${fi("pos","詞性（用、分開）",{list:1,ph:"名詞、動詞、形容詞…"})}${fi("hanja","漢字",{nul:1})}${fi("origin_type","來源",{ph:"固有語／漢字詞／外來語"})}${fi("level","程度",{ph:"TOPIK I（初級）"})}</div>`,true);
  h+=sec("意思和主題",w.meanings.length,w.meanings.map((m,i)=>`<div class="card"><div class="ch">意思 ${i+1}${xb("meanings."+i,"這個意思")}</div>${fi(`meanings.${i}.zh`,"中文意思",{wide:1})}
    <div class="fi"><span>放在哪個主題／小分類（可以放好幾個）</span>${m.topics.map((t,j)=>`<div class="trow"><select class="sel" data-topic="${i}.${j}" data-f="theme">${themeOpts(t.theme)}</select><select class="sel" data-topic="${i}.${j}" data-f="sub"${t.theme?"":" disabled"}>${subOpts(t.theme,t.sub)}</select>${xb(`meanings.${i}.topics.${j}`,"這個主題")}</div>`).join("")}
    <button class="add" type="button" data-add="topic" data-i="${i}">＋ 再放到一個主題</button></div></div>`).join("")+`<button class="add" type="button" data-add="meaning">＋ 新增意思</button>`,true);
  h+=sec("例句",w.examples.length,w.examples.map((e,i)=>`<div class="card"><div class="ch">例句 ${i+1}${xb("examples."+i,"例句")}</div>${exFields("examples."+i,`examples.${i}.audio`)}${meanSel("example_ids",e.id)}</div>`).join("")+`<button class="add" type="button" data-add="example">＋ 新增例句</button>`);
  h+=sec("片語",w.phrases.length,w.phrases.map((p,i)=>{const P="phrases."+i;
    const alt=(k,lab)=>p[k].map((s,j)=>`<div class="card sub"><div class="ch">${lab} ${j+1}${xb(`${P}.${k}.${j}`,lab)}</div><div class="grid">${fi(`${P}.${k}.${j}.phrase`,lab+"片語",{ko:1,aud:`${P}.${k}.${j}.audio`})}${fi(`${P}.${k}.${j}.yo`,"요形",{ko:1})}${fi(`${P}.${k}.${j}.zh`,"中文",{wide:1})}</div>${exFields(`${P}.${k}.${j}.example`,`${P}.${k}.${j}.example.audio`)}</div>`).join("")+`<button class="add" type="button" data-add="${k}" data-i="${i}">＋ 新增${lab}片語</button>`;
    return `<div class="card"><div class="ch">片語 ${i+1}${xb(P,"片語")}</div><div class="grid">${fi(P+".phrase","片語",{ko:1,aud:P+".audio"})}${fi(P+".yo","요形（名詞的片語要填）",{ko:1})}${fi(P+".zh","中文意思",{wide:1})}${fi(P+".explanation","解析",{area:1,rows:3,wide:1})}</div>${meanSel("phrase_ids",p.id)}
      <div class="hint">片語例句</div>${p.examples.map((e,j)=>`<div class="card sub"><div class="ch">例句 ${j+1}${xb(`${P}.examples.${j}`,"例句")}</div>${exFields(`${P}.examples.${j}`,`${P}.examples.${j}.audio`)}</div>`).join("")}<button class="add" type="button" data-add="phex" data-i="${i}">＋ 新增片語例句</button>
      ${alt("similar","相似")}${alt("opposite","相反")}</div>`}).join("")+`<button class="add" type="button" data-add="phrase">＋ 新增片語</button>`);
  const rl=(k,lab)=>w[k].map((r,i)=>`<div class="card"><div class="ch">${lab} ${i+1}${xb(`${k}.${i}`,lab)}</div><div class="grid">${fi(`${k}.${i}.word`,lab,{ko:1,aud:`${k}.${i}.audio`})}${fi(`${k}.${i}.zh`,"中文")}${fi(`${k}.${i}.note`,"用法差異",{wide:1})}</div>${r.examples.map((e,j)=>`<div class="card sub"><div class="ch">例句 ${j+1}${xb(`${k}.${i}.examples.${j}`,"例句")}</div>${exFields(`${k}.${i}.examples.${j}`,`${k}.${i}.examples.${j}.audio`)}</div>`).join("")}<button class="add" type="button" data-add="relex" data-k="${k}" data-i="${i}">＋ 新增例句</button></div>`).join("")+`<button class="add" type="button" data-add="${k}">＋ 新增${lab}</button>`;
  h+=sec("近義詞",w.synonyms.length,rl("synonyms","近義詞"));
  h+=sec("反義詞",w.antonyms.length,rl("antonyms","反義詞"));
  const f=w.inflections;
  h+=sec("型態變化",f.forms.length,`<div class="grid">${fi("inflections.stem","語幹",{ko:1})}${fi("inflections.irregular","不規則類型",{nul:1,ph:"規則變化就留空"})}</div>`+f.forms.map((x,i)=>`<div class="card"><div class="ch">${esc(x.group||"")}　${esc(x.label||"")}${xb("inflections.forms."+i,"這一列")}</div><div class="grid">${fi(`inflections.forms.${i}.group`,"分類",{ph:"現在式"})}${fi(`inflections.forms.${i}.label`,"文法")}${fi(`inflections.forms.${i}.form`,"變化後",{ko:1,aud:`inflections.forms.${i}.audio`})}${fi(`inflections.forms.${i}.pron`,"發音",{ko:1,nul:1})}${fi(`inflections.forms.${i}.note`,"說明",{wide:1})}</div></div>`).join("")+`<button class="add" type="button" data-add="form">＋ 新增一列</button>`);
  if(!EDNEW)h+=`<button class="tbtn danger delw" type="button" data-delword="1">刪除這個單字</button>`;
  return h;
}
function nextId(list,prefix){let n=1;const ids=new Set(list.map(x=>x.id));while(ids.has(prefix+n))n++;return prefix+n}
function allExIds(){return [...D.examples,...D.phrases.flatMap(p=>[...p.examples,...p.similar.map(s=>s.example),...p.opposite.map(s=>s.example)])].filter(Boolean)}
const blankEx=id=>({id,ko:"",zh:"",hl:[],audio:null});
function openWordEditor(id){
  EDKIND="word";EDNEW=!id;
  if(id){D=clone(WORDS.find(w=>w.id===id))}
  else{const th=THEMES.find(t=>t.key===st.theme&&!t.virtual);const sub=th&&st.sub&&st.sub!=="未分類"?st.sub:null;
    D=normalize({id:"u"+Date.now().toString(36),word:"",hanja:null,origin_type:"",level:"",pos:[],pronunciation:null,audio:null,
      meanings:[{zh:"",topics:th?[{theme:th.name,sub}]:[],example_ids:[],phrase_ids:[]}],synonyms:[],antonyms:[],examples:[],phrases:[],inflections:{stem:"",irregular:null,forms:[]}})}
  document.getElementById("edttl").textContent=id?"編輯　"+D.word:"新增單字";
  renderEd(true);ed.hidden=false;document.body.classList.add("locked");ed.scrollTop=0;
}
function renderEd(first){const y=ed.scrollTop;const open=[...edb.querySelectorAll("details.esec")].map(d=>d.open);
  edb.innerHTML=EDKIND==="word"?wordForm():themeForm();
  if(!first)edb.querySelectorAll("details.esec").forEach((d,i)=>{if(i<open.length)d.open=open[i]});ed.scrollTop=y}
edb.addEventListener("input",e=>{const el=e.target;if(!el.dataset.p)return;let v=el.value;
  if(el.dataset.list)v=v.split(LISTSEP).map(s=>s.trim()).filter(Boolean);else if(el.dataset.null&&!v.trim())v=null;
  sp(D,el.dataset.p,v);if(el.dataset.aud)sp(D,el.dataset.aud,null);});
edb.addEventListener("change",e=>{const el=e.target;
  if(el.dataset.topic){const [i,j]=el.dataset.topic.split(".").map(Number);const t=D.meanings[i].topics[j];
    if(el.dataset.f==="theme"){t.theme=el.value;t.sub=null;renderEd()}else t.sub=el.value||null;return}
  if(el.dataset.link){const k=el.dataset.link,id=el.dataset.id;D.meanings.forEach(m=>m[k]=m[k].filter(x=>x!==id));const i=+el.value;if(i>=0)D.meanings[i][k].push(id);return}});
edb.addEventListener("click",async e=>{
  const del=e.target.closest("[data-del]");
  if(del){const p=del.dataset.del.split(".");const i=+p.pop();const list=p.length?gp(D,p.join(".")):D;const gone=list[i];
    const label=gone&&(gone.word||gone.phrase||gone.ko||gone.zh||gone.form||gone.name||"");
    if(label&&!await ask(`確定要刪除「${String(label).slice(0,20)}」嗎？`,"刪除"))return;
    list.splice(i,1);
    if(EDKIND==="word"&&gone&&gone.id){D.meanings.forEach(m=>{m.example_ids=m.example_ids.filter(x=>x!==gone.id);m.phrase_ids=m.phrase_ids.filter(x=>x!==gone.id)})}
    renderEd();return}
  const add=e.target.closest("[data-add]");
  if(add&&EDKIND==="word"){const k=add.dataset.add,i=+add.dataset.i;
    if(k==="meaning")D.meanings.push({zh:"",topics:[],example_ids:[],phrase_ids:[]});
    if(k==="topic")D.meanings[i].topics.push({theme:"",sub:null});
    if(k==="example")D.examples.push(blankEx(nextId(D.examples,"ex")));
    if(k==="phrase"){const id=nextId(D.phrases,"ph");D.phrases.push({id,phrase:"",yo:"",zh:"",explanation:"",audio:null,examples:[],similar:[],opposite:[]})}
    if(k==="phex"){const p=D.phrases[i];p.examples.push(blankEx(nextId(allExIds(),p.id+"-ex")))}
    if(k==="similar"||k==="opposite"){const p=D.phrases[i];p[k].push({phrase:"",yo:"",zh:"",audio:null,example:blankEx(nextId(allExIds(),p.id+(k==="similar"?"-sim":"-opp")))})}
    if(k==="synonyms"||k==="antonyms")D[k].push({word:"",zh:"",note:"",audio:null,examples:[]});
    if(k==="relex")D[add.dataset.k][i].examples.push({ko:"",zh:"",hl:[],audio:null});
    if(k==="form")D.inflections.forms.push({group:"",label:"",form:"",pron:null});
    renderEd();
    const all=[...edb.querySelectorAll("[data-add]")].filter(b=>b.dataset.add===k&&b.dataset.i===add.dataset.i&&b.dataset.k===add.dataset.k);
    const b=all[0];const prev=b&&b.previousElementSibling;const inp=prev&&prev.querySelector("input,textarea,select");if(inp)inp.focus();return}
  if(add&&EDKIND==="themes"){themeAdd(add.dataset.add,+add.dataset.i);return}
  const mv=e.target.closest("[data-mv]");if(mv){const [i,d]=mv.dataset.mv.split(",").map(Number);const t=D.splice(i,1)[0];D.splice(i+d,0,t);renderEd();return}
  if(e.target.closest("[data-gen]")){autoFill();return}
  if(e.target.closest("[data-delword]")){if(!await ask(`確定要刪除「${D.word}」嗎？刪掉後列表裡就看不到了。`,"刪除"))return;deleteWord(D.id);closeEd();closeSheet();refresh();toast("已刪除");return}
});
function closeEd(){ed.hidden=true;D=null;EDKIND=null;if(sheet.hidden)document.body.classList.remove("locked")}
document.getElementById("edcancel").onclick=async()=>{if(await ask("剛才的修改不會儲存，確定離開嗎？","離開"))closeEd()};
/* in-page confirm: the artifact viewer blocks confirm() */
function ask(msg,ok){return new Promise(res=>{const m=document.getElementById("ask");m.querySelector("p").textContent=msg;m.querySelector("[data-ok]").textContent=ok||"確定";m.hidden=false;
  const done=v=>{m.hidden=true;m.onclick=null;res(v)};m.onclick=e=>{if(e.target.closest("[data-ok]"))done(true);else if(e.target.closest("[data-no]")||e.target===m)done(false)};m.querySelector("[data-no]").focus()})}
/* auto-fill: ask Claude (sample capability) for every empty part of the word, in the project's format */
const genHint=()=>"先填好單字（主題也可以先選），再按「自動填寫」，會幫你補上意思、例句、片語、近反義和變化。已經有內容的部分不會被蓋掉。";
let genBusy=false;
async function autoFill(){
  if(genBusy)return;const word=(D.word||"").trim(),msg=document.getElementById("genmsg"),btn=document.getElementById("genbtn");
  if(!word){msg.textContent="請先在「單字」欄填韓文。";return}
  let sample=null;try{sample=window.claude&&await window.claude.use("sample")}catch(e){}
  if(!sample){msg.textContent="這個畫面不能使用自動填寫，請在 Claude 裡打開這個網頁再試。";return}
  const hint=[...D.meanings.map(m=>m.zh).filter(Boolean)].join("；");
  const prompt=`你在幫一位用繁體中文（台灣）學韓文的人做單字卡。請為韓文單字「${word}」${hint?`（使用者想要的意思：${hint}）`:""}產生一筆完整資料，格式和下面的範例完全一樣。

規則：
- 所有中文用繁體中文（台灣用語）。
- pronunciation：實際發音（韓文，例如 "[먹따]"），跟拼寫一樣就填 null。不要羅馬拼音，不要解釋發音。
- origin_type 填 固有語／漢字詞／外來語；漢字詞的 hanja 填漢字，其他填 null；level 填 TOPIK I（初級）或 TOPIK II（中級）或 TOPIK II（高級）。
- meanings：常用意思 1–3 個，每個有 zh、example_ids、phrase_ids（引用下面 examples 和 phrases 的 id）。不要 topics 欄位。
- examples：3 句自然、常用的例句，用 요 形（해요體），id 為 ex1、ex2、ex3。hl 是句子裡要標紅的單字變化後的樣子（必須是句子裡原樣出現的字串）。note 只在需要特別說明時填。
- phrases：3 個實用片語或搭配，id 為 ph1、ph2、ph3，片語用原形（例如 "불을 끄다"），固定說法照原樣。yo 填片語最後動詞或形容詞的 요 形（例如 "불을 끄다" 填 "꺼요"），只要片語是原形（-다 結尾）就一定要填，相似、相反片語也一樣；固定說法留空。explanation 用一兩句說明。每個片語 1 句例句（id 為 ph1-ex1 這種格式，hl 是片語在句中的樣子）。similar、opposite 各 0–1 個，各附 1 句例句（id 為 ph1-sim1、ph1-opp1），沒有適合的就空陣列。
- synonyms、antonyms：0–3 個，各有 word、zh、note（用法差異）、examples（1 句自然的 요 形例句，有 ko、zh、hl）。
- inflections：動詞、形容詞給 stem、irregular（規則就 null，例如 "ㄹ不規則"）、forms 12–20 列，group 用：現在式、過去式、未來／意志、進行、否定、敬語、命令／勸誘、連接、冠形詞形、常用句型、衍生詞。pron 只在發音跟拼寫不同時填。名詞不用整套變化，stem 填 ""，forms 放常用助詞搭配（group 填 "助詞搭配"）。
- 不要 audio、tags、id 欄位。

範例（끄다）：
${JSON.stringify(GEN_EX)}

只回覆一個 JSON 物件。`;
  genBusy=true;btn.disabled=true;msg.textContent="產生中…";
  try{const r=await sample.json(prompt,{modelTier:"complex",onText:({text})=>{msg.textContent=`產生中…（${text.length} 字）`}});
    mergeGen(r);renderEd();document.getElementById("genmsg").textContent="填好了，請檢查一下再按「儲存」。";
  }catch(e){const m={not_granted:"沒有允許使用自動填寫。",rate_limited:"太多次了，請稍後再試。",invalid_json:"產生的內容格式不對，請再按一次。"}[e&&e.code];
    const el=document.getElementById("genmsg");if(el)el.textContent=m||("自動填寫失敗："+((e&&e.message)||e))}
  finally{genBusy=false;const b=document.getElementById("genbtn");if(b)b.disabled=false}
}
function mergeGen(g){if(!g||typeof g!=="object")throw {message:"沒有收到資料"};
  const str=v=>typeof v==="string"?v:"", A=arr, nul=v=>v==null||v===""?null:String(v);
  const ex=e=>({id:str(e&&e.id),ko:str(e&&e.ko),zh:str(e&&e.zh),hl:A(e&&e.hl).map(String),...(e&&e.note?{note:String(e.note)}:{}),audio:null});
  if(!D.pronunciation)D.pronunciation=nul(g.pronunciation);
  if(!D.hanja)D.hanja=nul(g.hanja);
  if(!D.origin_type)D.origin_type=str(g.origin_type);
  if(!D.level)D.level=str(g.level);
  if(!D.pos.length)D.pos=A(g.pos).map(String);
  const filled={ex:!!D.examples.length,ph:!!D.phrases.length};
  if(!filled.ex)D.examples=A(g.examples).map(ex).filter(e=>e.ko);
  if(!filled.ph)D.phrases=A(g.phrases).map(p=>({id:str(p.id),phrase:str(p.phrase),yo:str(p.yo),zh:str(p.zh),explanation:str(p.explanation),audio:null,
    examples:A(p.examples).map(ex).filter(e=>e.ko),
    similar:A(p.similar).map(s=>({phrase:str(s.phrase),yo:str(s.yo),zh:str(s.zh),audio:null,example:ex(s.example)})).filter(s=>s.phrase),
    opposite:A(p.opposite).map(s=>({phrase:str(s.phrase),yo:str(s.yo),zh:str(s.zh),audio:null,example:ex(s.example)})).filter(s=>s.phrase)})).filter(p=>p.phrase&&p.id);
  const gm=A(g.meanings).filter(m=>m&&m.zh);
  const emptyMeans=D.meanings.every(m=>!(m.zh||"").trim());
  const topics=clone((D.meanings[0]||{topics:[]}).topics);
  if(emptyMeans&&gm.length)D.meanings=gm.map(m=>({zh:String(m.zh),topics:clone(topics),
    example_ids:filled.ex?[]:A(m.example_ids).map(String),phrase_ids:filled.ph?[]:A(m.phrase_ids).map(String)}));
  else if(gm.length){/* keep the user's meanings; link new examples/phrases to the first one */
    if(!filled.ex)D.meanings[0].example_ids=D.examples.map(e=>e.id);if(!filled.ph)D.meanings[0].phrase_ids=D.phrases.map(p=>p.id)}
  const rl=r=>({word:str(r&&r.word),zh:str(r&&r.zh),note:str(r&&r.note),audio:null,examples:A(r&&r.examples).map(ex).filter(e=>e.ko).map(({id,...e})=>e)});
  if(!D.synonyms.length)D.synonyms=A(g.synonyms).map(rl).filter(r=>r.word);
  if(!D.antonyms.length)D.antonyms=A(g.antonyms).map(rl).filter(r=>r.word);
  const f=g.inflections||{};
  if(!D.inflections.forms.length){D.inflections.stem=str(f.stem);D.inflections.irregular=nul(f.irregular);
    D.inflections.forms=A(f.forms).map(x=>({group:str(x.group),label:str(x.label),form:str(x.form),pron:nul(x.pron),...(x.note?{note:String(x.note)}:{})})).filter(x=>x.form)}
  normalize(D);
}
document.getElementById("edsave").onclick=()=>{
  if(EDKIND==="word"){const w=D;w.word=(w.word||"").trim();if(!w.word){toast("請先填單字");return}
    w.meanings=w.meanings.filter(m=>(m.zh||"").trim()||m.topics.length);
    w.meanings.forEach(m=>m.topics=m.topics.filter(t=>t.theme));
    w.examples=w.examples.filter(e=>(e.ko||"").trim());
    w.phrases=w.phrases.filter(p=>(p.phrase||"").trim());
    w.phrases.forEach(p=>{p.examples=p.examples.filter(e=>(e.ko||"").trim());["similar","opposite"].forEach(k=>p[k]=p[k].filter(s=>(s.phrase||"").trim()))});
    w.synonyms=w.synonyms.filter(r=>(r.word||"").trim());w.antonyms=w.antonyms.filter(r=>(r.word||"").trim());
    [...w.synonyms,...w.antonyms].forEach(r=>r.examples=r.examples.filter(e=>(e.ko||"").trim()));
    w.inflections.forms=w.inflections.forms.filter(f=>(f.form||"").trim());w.inflections.base=w.word;
    const ids=new Set(allExIds().map(e=>e.id).concat(w.phrases.map(p=>p.id)));w.meanings.forEach(m=>{m.example_ids=m.example_ids.filter(x=>ids.has(x));m.phrase_ids=m.phrase_ids.filter(x=>ids.has(x))});
    normalize(w);saveWord(w);const id=w.id,isNew=EDNEW;closeEd();refresh();
    if(isNew){const t=w.meanings.flatMap(m=>m.topics)[0];openWord(t?t.theme:"__none",id)}
    toast("已儲存");return}
  if(EDKIND==="themes")saveThemeEdits();
};

/* theme editor: D = [{name, ko, orig, subs:[{name, orig}]}] */
function openThemeEditor(){EDKIND="themes";EDNEW=false;
  D=THEMES.filter(t=>!t.virtual).map(t=>({name:t.name,ko:t.ko||"",orig:t.name,subs:t.subs.map(s=>({name:s,orig:s}))}));
  document.getElementById("edttl").textContent="主題和小分類";renderEd(true);ed.hidden=false;document.body.classList.add("locked");ed.scrollTop=0}
function themeForm(){return `<p class="hint" style="margin-top:12px">改名字會自動套用到所有單字。刪除主題或小分類不會刪掉單字：刪掉小分類，單字會移到「未分類」；刪掉主題，只放在這個主題的單字會移到首頁的「未分類」。</p>`+
  D.map((t,i)=>{const cnt=(THEMES.find(x=>x.name===t.orig)||{words:[]}).words.length;
    return `<div class="esec" style="padding-top:10px"><div class="card" style="border:0;padding:0;margin:0"><div class="ch">主題 ${i+1}・${cnt} 個字<span style="margin-left:auto;display:flex;gap:6px"><button class="mv" type="button" data-mv="${i},-1"${i?"":" disabled"} aria-label="往上">↑</button><button class="mv" type="button" data-mv="${i},1"${i<D.length-1?"":" disabled"} aria-label="往下">↓</button>${xb(String(i),"主題")}</span></div>
    <div class="grid">${fi(i+".name","主題名稱")}${fi(i+".ko","韓文名稱",{ko:1})}</div>
    <div class="fi"><span>小分類（建議 2–4 個）</span>${t.subs.map((s,j)=>`<div class="subrow"><input class="sel" data-p="${i}.subs.${j}.name" value="${esc(s.name)}">${xb(`${i}.subs.${j}`,"小分類")}</div>`).join("")}</div>
    <button class="add" type="button" data-add="sub" data-i="${i}">＋ 新增小分類</button></div></div>`}).join("")+
  `<button class="add" type="button" data-add="theme" style="margin-top:14px">＋ 新增主題</button>`}
function themeAdd(k,i){if(k==="theme")D.push({name:"",ko:"",orig:null,subs:[]});if(k==="sub")D[i].subs.push({name:"",orig:null});renderEd();
  const ins=edb.querySelectorAll(k==="theme"?'[data-p$=".name"]:not([data-p*="subs"])':`[data-p^="${i}.subs."]`);const l=ins[ins.length-1];if(l)l.focus()}
function saveThemeEdits(){
  D.forEach(t=>{t.name=(t.name||"").trim();t.ko=(t.ko||"").trim();t.subs=t.subs.map(s=>({...s,name:(s.name||"").trim()})).filter(s=>s.name||s.orig)});
  const names=D.map(t=>t.name);
  if(names.some(n=>!n)){toast("主題名稱不能空白");return}
  if(new Set(names).size!==names.length||names.includes("未分類")){toast("主題名稱不能重複，也不能叫「未分類」");return}
  for(const t of D){const sn=t.subs.map(s=>s.name);if(sn.some(n=>!n)){toast(`「${t.name}」有空白的小分類`);return}
    if(new Set(sn).size!==sn.length||sn.includes("未分類")){toast(`「${t.name}」的小分類不能重複，也不能叫「未分類」`);return}}
  const tmap={};D.forEach(t=>{if(t.orig)tmap[t.orig]=t});
  let changed=0;
  WORDS.forEach(w=>{let dirty=false;
    w.meanings.forEach(m=>{const nt=[];m.topics.forEach(x=>{const t=tmap[x.theme];
      if(!t){if(TNAMES.has(x.theme)){dirty=true;return}nt.push(x);return}
      let sub=x.sub;if(sub){const s=t.subs.find(s=>s.orig===sub);const ns=s?s.name:null;if(ns!==sub){sub=ns;dirty=true}}
      if(t.name!==x.theme)dirty=true;nt.push({theme:t.name,sub})});m.topics=nt});
    if(dirty){normalize(w);saveWord(clone(w));changed++}});
  saveThemes(D.map(t=>({name:t.name,ko:t.ko,subs:t.subs.map(s=>s.name)})));
  if(st.theme&&tmap[st.theme])st.theme=tmap[st.theme].name;
  closeEd();refresh();toast(changed?`已儲存，更新了 ${changed} 個字`:"已儲存");
}

/* ---------- start ---------- */
rebuild();draw();showSync();
async function pullNow(){if(saving)return;
  if(S.token&&Object.keys(pend).length){flush();return}
  try{const cur=await S.pull();applyRemote(cur.map);dbState="on"}catch(e){dbState="off"}
  showSync();refreshSafe()}
pullNow();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pullNow()});

/* ---------- edit permission: a GitHub token kept only on this device ---------- */
const perm=document.getElementById("perm");
function permLabel(){document.getElementById("permlab").textContent=S.token?"編輯權限（已設定）":"設定編輯權限"}
permLabel();
function openPerm(){document.getElementById("permdesc").textContent=S.token?"這台裝置已經可以編輯，修改會同步到每台裝置。權杖過期的話，把新的貼在這裡取代。":"把 GitHub 權杖貼在這裡，這台裝置就可以編輯。權杖只存在這台裝置上，別人就算知道密碼也只能看、不能改。每台想編輯的裝置都要貼一次。";
  document.getElementById("permmsg").textContent="";perm.hidden=false;setTimeout(()=>document.getElementById("permtok").focus(),50)}
document.getElementById("permclose").onclick=()=>{perm.hidden=true};
perm.addEventListener("click",e=>{if(e.target===perm)perm.hidden=true});
document.getElementById("permform").addEventListener("submit",async e=>{e.preventDefault();const t=document.getElementById("permtok").value.trim(),msg=document.getElementById("permmsg");
  if(!t){msg.textContent="請先貼上權杖";return}
  msg.textContent="檢查中…";
  try{await S.setToken(t);msg.textContent="設定好了！";document.getElementById("permtok").value="";permLabel();showSync();setTimeout(()=>{perm.hidden=true},900);pullNow()}
  catch(err){msg.textContent=(err&&err.message)||String(err)}});
function refreshSafe(){rebuild();draw();if(!sheet.hidden&&st.cur)renderSheet()}

/* ---------- search highlighter: wrap the search words in <mark> inside rendered text ---------- */
function markQ(root){const q=st.q.trim();if(!q||!root)return;const ql=q.toLowerCase();
  const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest("svg,button.say,mark,.tabs,.empty")?NodeFilter.FILTER_REJECT:(n.nodeValue.toLowerCase().includes(ql)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP)});
  const nodes=[];while(tw.nextNode())nodes.push(tw.currentNode);
  nodes.forEach(n=>{const t=n.nodeValue,low=t.toLowerCase(),f=document.createDocumentFragment();let i=0,j;
    while((j=low.indexOf(ql,i))>=0){if(j>i)f.appendChild(document.createTextNode(t.slice(i,j)));const m=document.createElement("mark");m.className="qm";m.textContent=t.slice(j,j+q.length);f.appendChild(m);i=j+q.length}
    if(i<t.length)f.appendChild(document.createTextNode(t.slice(i)));n.replaceWith(f)});
  if(root.id==="sbody"){const first=root.querySelector("mark.qm");const d=first&&first.closest("details");if(d)d.open=true}}

/* ---------- floating buttons: back to top + AI questions ---------- */
const totop=document.getElementById("totop"),fabs=document.getElementById("fabs");
const scroller=()=>!ed.hidden?ed:!sheet.hidden?sheet:null;
function onScroll(){const el=scroller();const y=el?el.scrollTop:scrollY;totop.hidden=y<300}
addEventListener("scroll",onScroll,{passive:true});sheet.addEventListener("scroll",onScroll,{passive:true});ed.addEventListener("scroll",onScroll,{passive:true});
totop.onclick=()=>{const el=scroller();const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;(el||window).scrollTo({top:0,behavior:reduce?"auto":"smooth"})};
new MutationObserver(()=>{fabs.hidden=!ed.hidden;onScroll()}).observe(ed,{attributes:true,attributeFilter:["hidden"]});
new MutationObserver(onScroll).observe(sheet,{attributes:true,attributeFilter:["hidden"]});

const ai=document.getElementById("ai"),aiq=document.getElementById("aiq"),aians=document.getElementById("aians"),aigo=document.getElementById("aigo");
let aiCtl=null;
function curWord(){return !sheet.hidden&&st.cur?WORDS.find(w=>w.id===st.cur[1]):null}
function openAI(){const w=curWord();
  const chips=w?[`「${w.word}」和它的近義詞差在哪？`,`用「${w.word}」再造三個生活例句`,`「${w.word}」常犯的錯誤有哪些？`]:["아요／어요 要怎麼選？","은/는 和 이/가 差在哪？","「謝謝」有幾種說法？"];
  document.getElementById("aichips").innerHTML=chips.map(c=>`<button type="button">${esc(c)}</button>`).join("");
  aiq.placeholder=w?`關於「${w.word}」想問什麼？`:"想問什麼韓文問題？";
  ai.hidden=false;setTimeout(()=>aiq.focus(),50)}
function closeAI(){ai.hidden=true;if(aiCtl){aiCtl.abort();aiCtl=null}}
document.getElementById("aibtn").onclick=openAI;
document.getElementById("aiclose").onclick=closeAI;
ai.addEventListener("click",e=>{if(e.target===ai)closeAI();const c=e.target.closest(".aichips button");if(c){aiq.value=c.textContent;askAI()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!ai.hidden)closeAI()});
document.getElementById("aiform").addEventListener("submit",e=>{e.preventDefault();askAI()});
function mdLite(t){const lines=esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split(/\n/);let h="",ul=false;
  for(const l of lines){const m=l.match(/^\s*[-*・]\s+(.*)/);if(m){if(!ul){h+="<ul>";ul=true}h+=`<li>${m[1]}</li>`;continue}if(ul){h+="</ul>";ul=false}if(l.trim())h+=`<p>${l.replace(/^#+\s*/,"")}</p>`}
  return h+(ul?"</ul>":"")}
async function askAI(){const q=aiq.value.trim();if(!q)return;
  let sample=null;try{sample=window.claude&&await window.claude.use("sample")}catch(e){}
  aians.hidden=false;
  if(!sample){aians.innerHTML=`<p>這個畫面不能使用 AI 問答，請在 Claude 裡打開這個網頁再試。</p>`;return}
  const w=curWord();
  const ctx=w?`\n使用者正在看的單字：${w.word}（${w.meanings.map(m=>m.zh).join("；")}）。`:"";
  const prompt=`你是韓文老師，學生用繁體中文（台灣）學韓文，程度大約初級到中級。${ctx}
請用繁體中文簡潔回答下面的問題，重點放前面。韓文例句用 요 形並附中文翻譯。可以用「- 」列點、用 **粗體** 標重點，不要用表格和標題。

問題：${q}`;
  if(aiCtl)aiCtl.abort();aiCtl=new AbortController();const ctl=aiCtl;
  aigo.disabled=true;aians.innerHTML=`<div class="q">${esc(q)}</div><p>思考中…</p>`;
  try{const r=await sample(prompt,{signal:ctl.signal,cache:false,onText:({text})=>{if(ctl===aiCtl)aians.innerHTML=`<div class="q">${esc(q)}</div>`+mdLite(text)}});
    if(ctl===aiCtl)aians.innerHTML=`<div class="q">${esc(q)}</div>`+mdLite(r.text)+(r.truncated?"<p>（回答太長被截斷了，可以問得更具體一點。）</p>":"");
  }catch(e){if(e&&e.code==="cancelled")return;const m={not_granted:"沒有允許使用 AI 問答。",rate_limited:"問太多次了，請稍後再試。"}[e&&e.code];
    aians.innerHTML=`<div class="q">${esc(q)}</div><p>${esc(m||("出錯了："+((e&&e.message)||e)))}</p>`}
  finally{if(ctl===aiCtl){aigo.disabled=false}}}

/* ---------- 整理 mode: pick words and move them to another theme/subcategory, drag rows to reorder ---------- */
function orgBar(){const orgbar=document.getElementById("orgbar"),orgto=document.getElementById("orgto");const on=ORG()&&st.view==="word";orgbar.hidden=!on;document.body.classList.toggle("orgon",on);if(!on)return;
  document.getElementById("orgn").textContent=st.sel.size?`已選 ${st.sel.size} 個字`:"還沒選字";
  const real=THEMES.filter(t=>!t.virtual);const cur=orgto.value;
  orgto.innerHTML=`<option value="">搬到…</option>`+real.map((t,i)=>`<optgroup label="${esc(t.name)}"><option value="${i}:-1">${esc(t.name)}（不分小分類）</option>${t.subs.map((x,j)=>`<option value="${i}:${j}">${esc(t.name)} › ${esc(x)}</option>`).join("")}</optgroup>`).join("");
  orgto.value=cur;document.getElementById("orggo").disabled=!st.sel.size}
document.getElementById("out").addEventListener("click",e=>{if(!ORG())return;const r=e.target.closest(".w");if(!r||e.target.closest(".say,.grip"))return;
  e.preventDefault();e.stopImmediatePropagation();if(st.view!=="word")return;
  const k=r.dataset.k;if(st.sel.has(k))st.sel.delete(k);else st.sel.add(k);
  r.classList.toggle("picked",st.sel.has(k));const c=r.querySelector(".ck");if(c)c.classList.toggle("on",st.sel.has(k));orgBar()},true);
document.getElementById("orgdone").onclick=()=>{st.org=false;st.sel.clear();draw()};
document.getElementById("orggo").onclick=()=>{const v=document.getElementById("orgto").value;if(!v){toast("請先選要搬到哪裡");return}
  const [ti,si]=v.split(":").map(Number),T=THEMES.filter(t=>!t.virtual)[ti];if(!T)return;
  const theme=T.name,sub=si>=0?T.subs[si]:null,from=st.theme;let n=0;
  for(const id of st.sel){const w=WORDS.find(x=>x.id===id);if(!w)continue;
    let ms=w.meanings.filter(m=>inT(m,from));if(!ms.length)ms=w.meanings;
    ms.forEach(m=>{m.topics=m.topics.filter(x=>from==="__none"?TNAMES.has(x.theme)&&x.theme!==theme:x.theme!==from&&x.theme!==theme);m.topics.push({theme,sub})});
    normalize(w);saveWord(clone(w));n++}
  st.sel.clear();refresh();toast(`已把 ${n} 個字搬到「${theme}${sub?" › "+sub:""}」`)};
/* drag: hold the ≡ handle; the row follows the finger, other rows make room; order is saved for all devices */
let drag=null;
document.getElementById("out").addEventListener("pointerdown",e=>{const g=e.target.closest(".grip");if(!g||!ORG())return;e.preventDefault();
  const row=g.closest(".w"),list=row.parentElement;drag={row,list,y:e.clientY,id:e.pointerId};row.classList.add("dragging");g.setPointerCapture(e.pointerId)});
document.addEventListener("pointermove",e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();
  const {row,list}=drag;const rows=[...list.querySelectorAll(".w")].filter(r=>r!==row);
  const after=rows.find(r=>{const b=r.getBoundingClientRect();return e.clientY<b.top+b.height/2});
  if(after){if(row.nextElementSibling!==after)list.insertBefore(row,after)}else if(list.lastElementChild!==row)list.appendChild(row);
  if(e.clientY<90)scrollBy(0,-12);else if(e.clientY>innerHeight-90)scrollBy(0,12)});
function endDrag(e){if(!drag||e.pointerId!==drag.id)return;const {row,list}=drag;drag=null;row.classList.remove("dragging");
  const keys=[...list.querySelectorAll(".w")].map(r=>r.dataset.k);const ph=st.view==="phrase";
  const all=ph?sortPh(WORDS.flatMap(w=>w.phrases.map(p=>[w,p]))).map(([w,p])=>w.id+":"+p.id):WORDS.map(w=>w.id);
  const set=new Set(keys),slots=all.map((k,i)=>set.has(k)?i:-1).filter(i=>i>=0);slots.forEach((pos,j)=>{all[pos]=keys[j]});
  ORDER={...ORDER,[ph?"phrases":"words"]:all};write("meta/order",{words:ORDER.words||null,phrases:ORDER.phrases||null,t:Date.now()});refresh()}
document.addEventListener("pointerup",endDrag);
document.addEventListener("pointercancel",endDrag);
