const socket = io();
let state = null, myId = null, code = null, evaluations = [], submitted = false;
const $ = id => document.getElementById(id);
const reviewSuggestions = {
  HR: [
    {text:"Clear introduction", tone:"positive"}, {text:"Relevant experience", tone:"positive"}, {text:"Confident tone", tone:"positive"}, {text:"Strong motivation", tone:"positive"},
    {text:"Too generic", tone:"negative", map:"Too vague"}, {text:"Lacks evidence", tone:"negative", map:"No evidence"}, {text:"Weak role fit", tone:"negative", map:"Didn't answer"}, {text:"Too many buzzwords", tone:"negative", map:"Overly long"}, {text:"Rambling answer", tone:"negative", map:"Overly long"}, {text:"Weak closing", tone:"negative", map:"Poor structure"}
  ],
  Technical: [
    {text:"Correct concept", tone:"positive"}, {text:"Clear explanation", tone:"positive"}, {text:"Good example", tone:"positive"}, {text:"Strong reasoning", tone:"positive"},
    {text:"Conceptual gap", tone:"negative", map:"Weak reasoning"}, {text:"Inaccurate detail", tone:"negative", map:"Weak reasoning"}, {text:"No example", tone:"negative", map:"No evidence"}, {text:"Too jargon-heavy", tone:"negative", map:"Overly long"}, {text:"Misses a trade-off", tone:"negative", map:"Weak reasoning"}, {text:"Unclear logic", tone:"negative", map:"Poor structure"}
  ],
  Situational: [
    {text:"Practical approach", tone:"positive"}, {text:"Good prioritization", tone:"positive"}, {text:"Clear ownership", tone:"positive"}, {text:"Considers stakeholders", tone:"positive"},
    {text:"Too idealistic", tone:"negative", map:"Potential red flag"}, {text:"No escalation path", tone:"negative", map:"Didn't answer"}, {text:"Ignores risks", tone:"negative", map:"Potential red flag"}, {text:"Lacks concrete steps", tone:"negative", map:"No evidence"}, {text:"Poor prioritization", tone:"negative", map:"Poor structure"}, {text:"Weak outcome", tone:"negative", map:"Weak reasoning"}
  ],
  Behavioral: [
    {text:"Strong STAR structure", tone:"positive"}, {text:"Concrete example", tone:"positive"}, {text:"Shows ownership", tone:"positive"}, {text:"Clear learning", tone:"positive"},
    {text:"Generic example", tone:"negative", map:"Too vague"}, {text:"Missing result", tone:"negative", map:"No evidence"}, {text:"Too much context", tone:"negative", map:"Overly long"}, {text:"Weak reflection", tone:"negative", map:"Weak reasoning"}, {text:"Blames others", tone:"negative", map:"Potential red flag"}, {text:"No measurable impact", tone:"negative", map:"No evidence"}
  ],
  Case: [
    {text:"Structured approach", tone:"positive"}, {text:"Good assumptions", tone:"positive"}, {text:"Relevant data", tone:"positive"}, {text:"Clear prioritization", tone:"positive"},
    {text:"Unstructured thinking", tone:"negative", map:"Poor structure"}, {text:"Weak assumptions", tone:"negative", map:"Weak reasoning"}, {text:"Jumps to solution", tone:"negative", map:"Didn't answer"}, {text:"Misses key metric", tone:"negative", map:"No evidence"}, {text:"No trade-off", tone:"negative", map:"Weak reasoning"}, {text:"Limited analysis", tone:"negative", map:"Too vague"}
  ],
  Guesstimate: [
    {text:"Clear assumptions", tone:"positive"}, {text:"Logical breakdown", tone:"positive"}, {text:"Good math setup", tone:"positive"}, {text:"Sanity-checked estimate", tone:"positive"},
    {text:"Missing assumptions", tone:"negative", map:"No evidence"}, {text:"Arithmetic gap", tone:"negative", map:"Weak reasoning"}, {text:"No validation", tone:"negative", map:"No evidence"}, {text:"Unclear structure", tone:"negative", map:"Poor structure"}, {text:"Overcomplicates", tone:"negative", map:"Overly long"}, {text:"Jumps to a number", tone:"negative", map:"Weak reasoning"}
  ],
  Communication: [
    {text:"Easy to follow", tone:"positive"}, {text:"Great simplification", tone:"positive"}, {text:"Audience-aware", tone:"positive"}, {text:"Concise delivery", tone:"positive"},
    {text:"Too technical", tone:"negative", map:"Overly long"}, {text:"Jargon-heavy", tone:"negative", map:"Overly long"}, {text:"Unclear message", tone:"negative", map:"Poor structure"}, {text:"Too long", tone:"negative", map:"Overly long"}, {text:"Misses the audience", tone:"negative", map:"Potential red flag"}, {text:"No clear takeaway", tone:"negative", map:"Didn't answer"}
  ]
};


socket.on("connect", () => { myId = socket.id; });
function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));$(id).classList.remove("hidden");}
function err(msg){$("homeError").textContent=msg||"";}
function enterLobby(){$("roomBadge").classList.remove("hidden");$("roomBadge").textContent=code;show("lobby");}
function renderLeaderboard(){
  if(!state)return;
  const rows=[...state.players].sort((a,b)=>b.score-a.score);
  $("leaderboardRows").innerHTML=rows.map((p,i)=>`<div class="score-row"><span>#${i+1} ${esc(p.name)}${p.id===myId?" · YOU":""}</span><span class="score">${p.score}</span></div>`).join("");
  const me=state.players.find(p=>p.id===myId);$("myScore").textContent=me?me.score:0;
}
function resetRoundUI(){submitted=false;evaluations=[];$("answer").value="";$("wordCount").textContent="0 words";$("submitBtn").disabled=false;$("submitBtn").textContent="Submit answer";$("reviewFeed").innerHTML="";$("reviewPanel").classList.add("hidden");}

$("createBtn").onclick=()=>{err("");socket.emit("room:create",{name:$("createName").value.trim(),totalRounds:$("rounds").value},res=>{if(!res.ok)return err(res.error);code=res.code;enterLobby();});};
$("joinBtn").onclick=()=>{err("");socket.emit("room:join",{name:$("joinName").value.trim(),code:$("joinCode").value.trim()},res=>{if(!res.ok)return err(res.error);code=res.code;enterLobby();});};
$("startBtn").onclick=()=>socket.emit("game:start",{code});
$("boardBtn").onclick=()=>{$("leaderboard").classList.toggle("hidden");renderLeaderboard();};
$("closeBoard").onclick=()=>$("leaderboard").classList.add("hidden");
$("answer").oninput=()=>{$("wordCount").textContent=`${$("answer").value.trim()?$("answer").value.trim().split(/\s+/).length:0} words`;};
$("submitBtn").onclick=()=>{
  const answer=$("answer").value.trim();if(!answer)return;
  submitted=true;$("submitBtn").disabled=true;$("submitBtn").textContent="Submitted · Review others below";
  $("reviewPanel").classList.remove("hidden");
  socket.emit("answer:submit",{code,answer});
};
$("nextBtn").onclick=()=>socket.emit("next:round",{code});

socket.on("room:update",room=>{
  const was=state?.round;state=room;code=room.code;renderLeaderboard();$("roomBadge").classList.remove("hidden");$("roomBadge").textContent=code;
  if(room.phase==="lobby"){
    show("lobby");$("bigCode").textContent=code;$("playerCount").textContent=`${room.players.length}/8`;
    $("players").innerHTML=room.players.map(p=>`<div class="player"><span>${esc(p.name)}${p.id===room.hostId?" · HOST":""}</span><b>${p.score}</b></div>`).join("");
    $("startBtn").disabled=room.hostId!==myId||room.players.length<2;$("startHint").textContent=room.players.length<2?"Minimum 2 players.":(room.hostId===myId?"You're the host. Start when ready.":"Waiting for host...");
    return;
  }
  if(room.phase==="gameover")return;
  show("game");$("roundLabel").textContent=` ${room.round}/${room.totalRounds}`;$("question").textContent=room.question?.q||"";$("qType").textContent=room.question?.type||"";$("qType").className=`tag type-${String(room.question?.type||"general").toLowerCase()}`;$("timer").textContent=room.timeLeft;
  if(was!==room.round)resetRoundUI();
  if(room.phase==="answering"){
    $("answerPanel").classList.remove("hidden");$("resultsPanel").classList.add("hidden");
    if(submitted){$("reviewPanel").classList.remove("hidden");renderReviewFeed();}else{$("reviewPanel").classList.add("hidden");}
  }
  if(room.phase==="challenge"){
    $("answerPanel").classList.add("hidden");$("reviewPanel").classList.remove("hidden");$("resultsPanel").classList.add("hidden");renderReviewFeed();
  }
  if(room.phase==="results"){$("answerPanel").classList.add("hidden");$("reviewPanel").classList.add("hidden");$("resultsPanel").classList.remove("hidden");}
});
socket.on("timer",t=>$("timer").textContent=t);
socket.on("answer:available",data=>{evaluations.push({id:data.id,name:data.name,answer:data.answer,evaluation:null,reviews:[]});if(submitted)renderReviewFeed();});
socket.on("answer:review",data=>{const i=evaluations.findIndex(x=>x.id===data.id);if(i>=0)evaluations[i]={...evaluations[i],...data};else evaluations.push(data);if(submitted||state?.phase==="challenge")renderReviewFeed();});
socket.on("evaluations",data=>{evaluations=data;renderReviewFeed();});
socket.on("review:available",data=>{const x=evaluations.find(e=>e.id===data.targetId);if(x){x.reviews=x.reviews||[];x.reviews.push(data.review);}if(submitted||state?.phase==="challenge")renderReviewFeed();});
socket.on("results",data=>renderResults(data));
socket.on("gameover",data=>{show("gameover");$("finalBoard").innerHTML=data.map((p,i)=>`<div class="score-row"><span>#${i+1} ${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");});
socket.on("connect_error",()=>err("Could not connect to the game server."));

function renderReviewFeed(){
  const visible=evaluations.filter(x=>x.id!==myId);
  $("reviewFeed").innerHTML=visible.length?visible.map(x=>reviewCard(x)).join(""):`<p class="hint">As other players submit, their responses will appear here. You can review them while your 90-second timer is still running.</p>`;
}
function reviewCard(x){
  const already=(x.reviews||[]).some(r=>r.reviewerId===myId);
  return `<article class="review-card" id="review-${x.id}">
    <div class="answer-meta"><b>${esc(x.name)}</b><span>${x.evaluation?`AI Score: <strong>${x.base}</strong>`:"AI reviewing…"}</span></div>
    <div class="answer-text">${esc(x.answer)}</div>
    ${x.evaluation?`<div class="ai-review"><b>AI Review</b><p>${esc(x.evaluation.feedback)}</p><div class="metrics">Relevance ${x.evaluation.relevance} · Structure ${x.evaluation.structure} · Specificity ${x.evaluation.specificity} · Reasoning ${x.evaluation.reasoning} · Communication ${x.evaluation.communication} · Impact ${x.evaluation.impact}</div><span class="weakness">Main weakness: ${esc(x.evaluation.weakness)}</span></div>`:`<div class="ai-review pending">AI review will appear as soon as evaluation finishes.</div>`}
    <div class="player-review"><div class="review-title-row"><b>Your review</b><span class="review-limit">Choose up to 4</span></div>${already?`<p class="hint">Review submitted. It will appear in the round recap.</p>`:`<p class="hint">Choose the phrases that best describe the answer, then add your own remark if needed.</p><div class="review-choice-grid">${getSuggestions(x).map(s=>`<button type="button" class="review-choice ${s.tone}" data-target="${x.id}" data-map="${esc(s.map||"")}" data-phrase="${esc(s.text)}" onclick="toggleReviewChoice(this)">${esc(s.text)}</button>`).join("")}</div><textarea id="remark-${x.id}" maxlength="500" placeholder="Add your own remark (optional)..."></textarea><button class="review-submit" onclick="submitReview('${x.id}')">Submit review</button>`}</div>
    ${x.reviews?.length?`<div class="review-history"><b>Reviews so far</b>${x.reviews.map(r=>`<div class="review-entry"><strong>${esc(r.reviewerName)}</strong><span>${new Date(r.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><div>${r.flags?.map(esc).join(" · ")||""}</div>${r.remark?`<p>${esc(r.remark)}</p>`:""}</div>`).join("")}</div>`:""}
  </article>`;
}
function getSuggestions(x){return reviewSuggestions[x.type]||reviewSuggestions.HR;}
window.toggleReviewChoice=(button)=>{
  const selected=[...document.querySelectorAll(`.review-choice[data-target="${button.dataset.target}"].selected`)];
  if(!button.classList.contains("selected") && selected.length>=4)return;
  button.classList.toggle("selected");
};
window.submitReview=(targetId)=>{
  const choices=[...document.querySelectorAll(`.review-choice[data-target="${targetId}"].selected`)];
  const flags=[...new Set(choices.map(b=>b.dataset.map).filter(Boolean))].slice(0,4);
  const phrases=choices.map(b=>b.dataset.phrase);
  const custom=$("remark-"+targetId)?.value.trim()||"";
  const remark=[...phrases,...(custom?[custom]:[])].join(" • ");
  if(!flags.length&&!remark)return;
  socket.emit("review:submit",{code,targetId,flags,remark});
};
function renderResults(data){
  $("results").innerHTML=data.map(x=>{
    const e=x.evaluation;const reviews=(x.reviews||[]).slice().sort((a,b)=>a.at-b.at);
    return `<div class="answer-item"><div class="answer-meta"><b>${esc(x.name)}</b><span class="score">+${x.round?.earned||0} · ${x.total} total</span></div><div class="answer-text">${esc(x.answer||"(No answer)")}</div>
      ${e?`<div class="ai-review"><b>AI Review</b><p>${esc(e.feedback)}</p><div class="metrics">Relevance ${e.relevance} · Structure ${e.structure} · Specificity ${e.specificity} · Reasoning ${e.reasoning} · Communication ${e.communication} · Impact ${e.impact}</div><span class="weakness">Main weakness: ${esc(e.weakness)}</span></div>`:""}
      <div class="review-history"><b>Player reviews</b>${reviews.length?reviews.map(r=>`<div class="review-entry"><strong>${esc(r.reviewerName)}</strong><span>${new Date(r.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><div>${r.flags?.map(esc).join(" · ")||""}</div>${r.remark?`<p>${esc(r.remark)}</p>`:""}</div>`).join(""):`<p class="hint">No player reviews were submitted.</p>`}</div>
    </div>`;
  }).join("");
  const host=state?.hostId===myId;$("nextBtn").classList.toggle("hidden",!host);$("nextBtn").textContent=state?.round>=state?.totalRounds?"Finish Arena":"Next round";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
