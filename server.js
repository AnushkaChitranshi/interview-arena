const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const QUESTION_BANK = [
  { type: "HR", q: "Tell me about yourself in 60 seconds.", difficulty: 1 },
  { type: "Behavioral", q: "Tell me about a time you made a mistake and what you learned from it.", difficulty: 1 },
  { type: "Situational", q: "Your teammate is not contributing and the deadline is tomorrow. What do you do?", difficulty: 2 },
  { type: "Technical", q: "Explain overfitting to a non-technical manager.", difficulty: 2 },
  { type: "Case", q: "A food-delivery app has falling repeat orders. What would you investigate first?", difficulty: 2 },
  { type: "Guesstimate", q: "Estimate how many cups of tea or coffee are consumed on a college campus in one day.", difficulty: 3 },
  { type: "Behavioral", q: "Describe a situation where you disagreed with someone senior to you. How did you handle it?", difficulty: 2 },
  { type: "Technical", q: "What is the difference between correlation and causation? Give a business example.", difficulty: 2 },
  { type: "Situational", q: "You discover an important error in your analysis one hour before presenting it. What do you do?", difficulty: 2 },
  { type: "HR", q: "Why should we hire you when another candidate has more direct experience?", difficulty: 2 },
  { type: "Case", q: "A retail company wants to reduce customer churn. What data would you ask for and why?", difficulty: 3 },
  { type: "Communication", q: "Explain your most technical project to a recruiter with no technical background.", difficulty: 2 }
];

const challengeTypes = [
  "Too vague", "Didn't answer", "No evidence",
  "Poor structure", "Weak reasoning", "Overly long", "Potential red flag"
];

function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    question: room.question,
    timeLeft: room.timeLeft,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, streak: p.streak, submitted: !!p.answer
    }))
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function chooseQuestion() {
  return QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
}

function resetAnswers(room) {
  for (const p of room.players.values()) {
    p.answer = "";
    p.evaluation = null;
    p.roundBase = 0;
    p.challenges = [];
    p.reviews = [];
    p.reviewsGiven = new Set();
  }
}

function startTimer(room, seconds, onEnd) {
  if (room.timer) clearInterval(room.timer);
  room.timeLeft = seconds;
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    io.to(room.code).emit("timer", room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      onEnd();
    }
  }, 1000);
}

function normalizeScore(x) {
  return Math.max(0, Math.min(100, Math.round(Number(x) || 0)));
}

async function evaluateAnswer(question, answer) {
  const fallback = heuristicEvaluate(question, answer);
  if (!process.env.OPENAI_API_KEY || !answer.trim()) return fallback;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: `You are an interview coach scoring a student's answer.
Return ONLY valid JSON with numeric fields relevance, structure, specificity, reasoning, communication, impact (0-100), plus "feedback" and "weakness".
Question type: ${question.type}
Question: ${question.q}
Answer: ${answer}
Be demanding but fair. Judge the answer, not the student.`
    });
    const parsed = JSON.parse(response.output_text);
    return {
      relevance: normalizeScore(parsed.relevance),
      structure: normalizeScore(parsed.structure),
      specificity: normalizeScore(parsed.specificity),
      reasoning: normalizeScore(parsed.reasoning),
      communication: normalizeScore(parsed.communication),
      impact: normalizeScore(parsed.impact),
      feedback: String(parsed.feedback || fallback.feedback).slice(0, 500),
      weakness: String(parsed.weakness || fallback.weakness).slice(0, 120)
    };
  } catch (err) {
    console.error("AI evaluation failed:", err.message);
    return fallback;
  }
}

function heuristicEvaluate(question, answer) {
  const text = answer.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const hasExample = /\b(for example|when|during|at|because|result|learned|project|internship)\b/i.test(text);
  const hasStructure = /\b(first|second|finally|situation|task|action|result|then)\b/i.test(text);
  const specificity = Math.min(100, 35 + (hasExample ? 30 : 0) + Math.min(30, Math.max(0, words - 20)));
  const structure = Math.min(100, 45 + (hasStructure ? 35 : 0) + (words > 35 ? 10 : 0));
  const relevance = Math.min(100, 45 + Math.min(45, words * 1.5));
  const reasoning = Math.min(100, 40 + (/\bwhy|because|therefore|so that\b/i.test(text) ? 35 : 0) + (words > 45 ? 15 : 0));
  const communication = words === 0 ? 0 : Math.max(35, 90 - Math.max(0, words - 90) * 0.5);
  const impact = Math.round((relevance + structure + specificity + reasoning + communication) / 5);
  return {
    relevance: Math.round(relevance),
    structure: Math.round(structure),
    specificity: Math.round(specificity),
    reasoning: Math.round(reasoning),
    communication: Math.round(communication),
    impact,
    feedback: words < 15 ? "Too brief to demonstrate enough evidence." : hasExample ? "Good use of concrete evidence. Tighten the answer around the question." : "Add a specific example or measurable outcome.",
    weakness: words < 15 ? "Too brief" : !hasExample ? "Needs concrete evidence" : "Could be more concise"
  };
}

function candidatePoints(e) {
  return Math.round(
    e.relevance * .15 + e.structure * .10 + e.specificity * .10 +
    e.reasoning * .10 + e.communication * .10 + e.impact * .05
  );
}

function reviewableAnswers(room) {
  return [...room.players.values()].filter(p => p.answer.trim()).map(p => ({
    id: p.id, name: p.name, answer: p.answer, evaluation: p.evaluation,
    base: p.roundBase || 0, reviews: p.reviews || []
  }));
}

async function evaluatePlayerNow(room, player) {
  if (!player.answer.trim() || player.evaluation) return;
  player.evaluation = await evaluateAnswer(room.question, player.answer);
  player.roundBase = candidatePoints(player.evaluation);
  io.to(room.code).emit("answer:review", {
    id: player.id, name: player.name, answer: player.answer,
    evaluation: player.evaluation, base: player.roundBase || 0, reviews: player.reviews || []
  });
}

async function finishAnswerPhase(room) {
  if (room.phase !== "answering") return;
  room.phase = "evaluating";
  emitRoom(room);

  const entries = [...room.players.values()].filter(p => p.answer.trim());
  await Promise.all(entries.map(p => evaluatePlayerNow(room, p)));

  room.phase = "challenge";
  emitRoom(room);
  io.to(room.code).emit("evaluations", reviewableAnswers(room));
  startTimer(room, 45, () => finishChallengePhase(room));
}

function finishChallengePhase(room) {
  if (room.phase !== "challenge") return;
  room.phase = "results";

  for (const p of room.players.values()) {
    let earned = p.roundBase || 0;
    let correctChallenges = 0;
    for (const c of p.challenges || []) {
      const target = room.players.get(c.targetId);
      if (!target?.evaluation) continue;
      const weakness = target.evaluation.weakness.toLowerCase();
      const isMatch = weakness.includes(c.type.toLowerCase().split(" ")[1] || c.type.toLowerCase());
      if (isMatch || target.evaluation.impact < 55) {
        correctChallenges++;
        earned += 10;
      } else {
        earned -= 5;
      }
    }
    if (p.roundBase >= 75) p.streak += 1;
    else p.streak = 0;
    earned += Math.min(10, p.streak * 2);
    p.score += Math.max(0, earned);
    p.lastRound = { earned: Math.max(0, earned), correctChallenges };
  }

  emitRoom(room);
  io.to(room.code).emit("results", [...room.players.values()].map(p => ({
    id: p.id, name: p.name, answer: p.answer,
    evaluation: p.evaluation, reviews: p.reviews || [], round: p.lastRound, total: p.score
  })));
}

function beginRound(room) {
  resetAnswers(room);
  room.round += 1;
  room.question = chooseQuestion();
  room.phase = "answering";
  emitRoom(room);
  startTimer(room, 90, () => finishAnswerPhase(room));
}

io.on("connection", socket => {
  socket.on("room:create", ({ name, totalRounds = 5 } = {}, cb) => {
    const code = roomCode();
    const room = {
      code, hostId: socket.id, phase: "lobby", round: 0,
      totalRounds: Math.min(15, Math.max(5, Number(totalRounds) || 5)),
      question: null, timeLeft: 0, timer: null, players: new Map()
    };
    room.players.set(socket.id, { id: socket.id, name: String(name || "Player").slice(0, 24), score: 0, streak: 0, answer: "", challenges: [], reviews: [], reviewsGiven: new Set() });
    rooms.set(code, room);
    socket.join(code);
    cb({ ok: true, code });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}, cb) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) return cb({ ok: false, error: "Room not found." });
    if (room.players.size >= 8) return cb({ ok: false, error: "Room is full." });
    if (room.phase !== "lobby") return cb({ ok: false, error: "That game has already started." });
    room.players.set(socket.id, { id: socket.id, name: String(name || "Player").slice(0, 24), score: 0, streak: 0, answer: "", challenges: [], reviews: [], reviewsGiven: new Set() });
    socket.join(room.code);
    cb({ ok: true, code: room.code });
    emitRoom(room);
  });

  socket.on("game:start", ({ code } = {}) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.players.size < 2) return;
    beginRound(room);
  });

  socket.on("answer:submit", async ({ code, answer } = {}) => {
    const room = rooms.get(code);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.phase !== "answering" || player.answer.trim()) return;
    player.answer = String(answer || "").slice(0, 1500);
    emitRoom(room);
    io.to(room.code).emit("answer:available", { id: player.id, name: player.name, answer: player.answer });
    await evaluatePlayerNow(room, player);
    if ([...room.players.values()].every(p => p.answer.trim())) {
      if (room.timer) clearInterval(room.timer);
      finishAnswerPhase(room);
    }
  });

  socket.on("review:submit", ({ code, targetId, flags = [], remark = "" } = {}) => {
    const room = rooms.get(code);
    const reviewer = room?.players.get(socket.id);
    const target = room?.players.get(targetId);
    if (!room || !reviewer || !target || reviewer.id === target.id || !target.answer.trim()) return;
    if (!['answering','challenge'].includes(room.phase)) return;
    const cleanFlags = [...new Set(flags)].filter(x => challengeTypes.includes(x)).slice(0,4);
    const cleanRemark = String(remark || "").slice(0, 500).trim();
    if (!cleanFlags.length && !cleanRemark) return;
    reviewer.reviewsGiven = reviewer.reviewsGiven || new Set();
    if (reviewer.reviewsGiven.has(targetId)) return;
    reviewer.reviewsGiven.add(targetId);
    target.reviews = target.reviews || [];
    target.reviews.push({ reviewerId: reviewer.id, reviewerName: reviewer.name, flags: cleanFlags, remark: cleanRemark, at: Date.now() });
    io.to(room.code).emit("review:available", { targetId: target.id, review: target.reviews[target.reviews.length - 1] });
  });

  socket.on("challenge:add", ({ code, targetId, type } = {}) => {
    const room = rooms.get(code);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.phase !== "challenge" || socket.id === targetId) return;
    if (!challengeTypes.includes(type)) return;
    player.challenges = player.challenges || [];
    if (player.challenges.length >= 2) return;
    player.challenges.push({ targetId, type });
    emitRoom(room);
  });

  socket.on("next:round", ({ code } = {}) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== "results") return;
    if (room.round >= room.totalRounds) {
      room.phase = "gameover";
      emitRoom(room);
      io.to(room.code).emit("gameover", [...room.players.values()].sort((a,b) => b.score-a.score).map(p => ({
        id: p.id, name: p.name, score: p.score, streak: p.streak
      })));
      return;
    }
    beginRound(room);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        if (room.hostId === socket.id) {
          const next = room.players.values().next().value;
          if (next) room.hostId = next.id;
        }
        if (room.players.size === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(code);
        } else {
          emitRoom(room);
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Interview Arena running on http://localhost:${PORT}`));
