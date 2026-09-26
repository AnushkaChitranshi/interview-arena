const socket = io();
let state = null, myId = null, code = null, evaluations = [], submitted = false;
const $ = id => document.getElementById(id);
const flags = ["Too vague","Didn't answer","No evidence","Poor structure","Weak reasoning","Overly long","Potential red flag"];

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
  show("game");$("roundLabel").textContent=` ${room.round}/${room.totalRounds}`;$("question").textContent=room.question?.q||"";$("qType").textContent=room.question?.type||"";$("timer").textContent=room.timeLeft;
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
    <div class="player-review"><b>Your review</b>${already?`<p class="hint">Review submitted. It will appear in the round recap.</p>`:`<div class="flag-grid">${flags.map(f=>`<label><input type="checkbox" data-flag="${esc(f)}" data-target="${x.id}"><span>${esc(f)}</span></label>`).join("")}</div><textarea id="remark-${x.id}" maxlength="500" placeholder="Add your own remark (optional)..."></textarea><button class="review-submit" onclick="submitReview('${x.id}')">Submit review</button>`}</div>
    ${x.reviews?.length?`<div class="review-history"><b>Reviews so far</b>${x.reviews.map(r=>`<div class="review-entry"><strong>${esc(r.reviewerName)}</strong><span>${new Date(r.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><div>${r.flags?.map(esc).join(" · ")||""}</div>${r.remark?`<p>${esc(r.remark)}</p>`:""}</div>`).join("")}</div>`:""}
  </article>`;
}
window.submitReview=(targetId)=>{
  const boxes=[...document.querySelectorAll(`input[data-target="${targetId}"]:checked`)];
  const flags=boxes.map(b=>b.dataset.flag);const remark=$("remark-"+targetId)?.value.trim()||"";
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
