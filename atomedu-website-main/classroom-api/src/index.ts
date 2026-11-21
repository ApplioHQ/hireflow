import { DurableObject } from "cloudflare:workers";

type Mode = "orbit" | "quiz";
type QuestionType = "multiple-choice" | "multi-select" | "free-response" | "fill-blank" | "true-false";
type Phase = "lobby" | "question" | "result" | "leaderboard" | "active" | "finished";

interface Question {
  id: string;
  title: string;
  prompt: string;
  context?: string;
  image?: string;
  type: QuestionType;
  options: string[];
  correct: string[];
  seconds: number;
  points: number;
}

interface Student {
  id: string;
  name: string;
  token: string;
  score: number;
  streak: number;
  joinedAt: number;
  removed: boolean;
  finished: boolean;
}

interface ResponseRecord {
  studentId: string;
  questionId: string;
  answer: string[];
  ratio: number;
  correct: boolean;
  elapsedMs: number;
  points: number;
  gradePoints?: number;
  graded?: boolean;
  manual?: boolean;
  answeredAt: number;
}

interface Incident {
  id: string;
  studentId: string;
  type: string;
  key: string;
  combo: string;
  createdAt: number;
  resolved: boolean;
}

interface SessionState {
  version: 1;
  code: string;
  mode: Mode;
  title: string;
  teacherToken: string;
  passwordHash: string;
  durationMinutes: number;
  questions: Question[];
  students: Student[];
  responses: ResponseRecord[];
  incidents: Incident[];
  phase: Phase;
  questionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  createdAt: number;
  expiresAt: number;
}

interface SocketAttachment { role: "teacher" | "student"; studentId?: string; token: string }
interface CreatePayload { mode: Mode; title: string; password?: string; durationMinutes?: number; questions: Question[] }
interface Env { CLASSROOMS: DurableObjectNamespace<ClassroomSession>; ALLOWED_ORIGIN: string }

const MAX_STUDENTS = 50;
const MAX_QUESTIONS = 100;
const MAX_BODY = 1_500_000;
const DAY = 86_400_000;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function randomToken(bytes = 24): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sameSecret(value: string, expectedHash: string): Promise<boolean> {
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const expected = new Uint8Array(expectedHash.match(/.{2}/g)?.map(x => Number.parseInt(x, 16)) ?? []);
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function normalizeAnswer(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => cleanText(item, 500).toLocaleLowerCase()).filter(Boolean).sort();
}

function gradeAnswer(question: Question, submitted: unknown): number {
  const answer = normalizeAnswer(submitted);
  const correct = normalizeAnswer(question.correct);
  if (question.type !== "multi-select") return JSON.stringify(answer) === JSON.stringify(correct) ? 1 : 0;
  if (!correct.length) return 0;
  const correctSet = new Set(correct);
  const right = answer.filter(value => correctSet.has(value)).length;
  const wrong = answer.filter(value => !correctSet.has(value)).length;
  return Math.max(0, Math.min(1, (right - wrong) / correct.length));
}

function sanitizeQuestion(raw: Question, index: number, mode: Mode): Question {
  const allowedTypes: QuestionType[] = ["multiple-choice", "multi-select", "free-response", "fill-blank", "true-false"];
  const type = allowedTypes.includes(raw?.type) ? raw.type : "multiple-choice";
  const options = (Array.isArray(raw?.options) ? raw.options : []).slice(0, 8).map(value => cleanText(value, 300)).filter(Boolean);
  const correct = (Array.isArray(raw?.correct) ? raw.correct : []).slice(0, 8).map(value => cleanText(value, 500)).filter(Boolean);
  const seconds = Math.max(5, Math.min(300, Number(raw?.seconds) || 30));
  const image = typeof raw?.image === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(raw.image) && raw.image.length <= 900_000 ? raw.image : undefined;
  if (!cleanText(raw?.prompt, 4000) || (type !== "free-response" && !correct.length)) throw new Error(`Question ${index + 1} needs a prompt${type === "free-response" ? "." : " and correct answer."}`);
  if (["multiple-choice", "multi-select", "true-false"].includes(type) && options.length < 2) throw new Error(`Question ${index + 1} needs at least two choices.`);
  return {
    id: cleanText(raw?.id, 80) || crypto.randomUUID(),
    title: cleanText(raw?.title, 120) || `Question ${index + 1}`,
    prompt: cleanText(raw?.prompt, 4000),
    context: cleanText(raw?.context, 8000) || undefined,
    image,
    type,
    options,
    correct,
    seconds: mode === "orbit" ? seconds : 0,
    points: Math.max(1, Math.min(100, Number(raw?.points) || 1)),
  };
}

function publicQuestion(question: Question): Omit<Question, "correct"> {
  const { correct: _correct, ...safe } = question;
  return safe;
}

function leaderboard(state: SessionState) {
  return state.students.filter(student => !student.removed).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt).slice(0, 5).map((student, index) => ({ rank: index + 1, id: student.id, name: student.name, score: student.score, streak: student.streak }));
}

function teacherState(state: SessionState) {
  return { ...state, teacherToken: undefined, passwordHash: undefined, students: state.students.map(({ token: _token, ...student }) => student), leaderboard: leaderboard(state) };
}

function studentState(state: SessionState, studentId: string) {
  const student = state.students.find(item => item.id === studentId);
  if (!student) return { error: "Student not found" };
  const question = state.questions[state.questionIndex];
  const response = question ? state.responses.find(item => item.studentId === studentId && item.questionId === question.id) : undefined;
  const quizQuestions = state.mode === "quiz" ? state.questions.map(publicQuestion) : undefined;
  const quizResponses = state.mode === "quiz" ? state.responses.filter(item => item.studentId === studentId).map(item => ({ questionId: item.questionId, answer: item.answer })) : undefined;
  const ranked = state.students.filter(item => !item.removed).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  const position = ranked.findIndex(item => item.id === studentId) + 1;
  return {
    code: state.code, mode: state.mode, title: state.title, phase: state.phase,
    questionIndex: state.questionIndex, questionCount: state.questions.length,
    question: question && (state.mode === "quiz" || state.phase === "question" || state.phase === "result" || state.phase === "active") ? publicQuestion(question) : null,
    questionEndsAt: state.questionEndsAt,
    questions: quizQuestions, responses: quizResponses,
    student: { id: student.id, name: student.name, score: student.score, streak: student.streak, removed: student.removed, finished: student.finished },
    position: position || null,
    answered: Boolean(response), lastResult: response ? { correct: response.correct, ratio: response.ratio, points: response.points, gradePoints: response.gradePoints ?? 0, graded: response.graded !== false, manual: Boolean(response.manual) } : null,
  };
}

export class ClassroomSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<SessionState>("state");
      if (stored && stored.expiresAt <= Date.now()) await this.ctx.storage.deleteAll();
    });
  }

  private async load(): Promise<SessionState | null> { return (await this.ctx.storage.get<SessionState>("state")) ?? null; }
  private async save(state: SessionState): Promise<void> { await this.ctx.storage.put("state", state); await this.broadcast(state); }

  async initialize(code: string, raw: CreatePayload): Promise<{ created: boolean; teacherToken?: string }> {
    if (await this.load()) return { created: false };
    const mode: Mode = raw.mode === "quiz" ? "quiz" : "orbit";
    if (mode === "quiz" && cleanText(raw.password, 120).length < 4) throw new Error("Quiz passwords must be at least four characters.");
    if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > MAX_QUESTIONS) throw new Error("Use between 1 and 100 questions.");
    const now = Date.now();
    const state: SessionState = {
      version: 1, code, mode, title: cleanText(raw.title, 120) || (mode === "quiz" ? "Untitled quiz" : "Untitled Orbit Room"),
      teacherToken: randomToken(), passwordHash: mode === "quiz" ? await digest(cleanText(raw.password, 120)) : "",
      durationMinutes: mode === "quiz" ? Math.max(1, Math.min(240, Number(raw.durationMinutes) || 30)) : 0,
      questions: raw.questions.map((question, index) => sanitizeQuestion(question, index, mode)),
      students: [], responses: [], incidents: [], phase: "lobby", questionIndex: 0, questionStartedAt: null, questionEndsAt: null,
      createdAt: now, expiresAt: now + DAY,
    };
    await this.ctx.storage.put("state", state);
    await this.ctx.storage.setAlarm(state.expiresAt);
    return { created: true, teacherToken: state.teacherToken };
  }

  async join(name: string, password = ""): Promise<{ studentId: string; studentToken: string; mode: Mode }> {
    const state = await this.load();
    if (!state) throw new Error("Room not found or expired.");
    if (state.phase !== "lobby") throw new Error("This session has already started.");
    if (state.students.filter(student => !student.removed).length >= MAX_STUDENTS) throw new Error("This room has reached its 50-student limit.");
    if (state.mode === "quiz" && !(await sameSecret(cleanText(password, 120), state.passwordHash))) throw new Error("Incorrect quiz password.");
    const normalized = cleanText(name, 40);
    if (normalized.length < 2) throw new Error("Enter a name with at least two characters.");
    if (state.students.some(student => student.name.toLocaleLowerCase() === normalized.toLocaleLowerCase() && !student.removed)) throw new Error("That name is already in this room.");
    const student: Student = { id: crypto.randomUUID(), name: normalized, token: randomToken(), score: 0, streak: 0, joinedAt: Date.now(), removed: false, finished: false };
    state.students.push(student);
    await this.save(state);
    return { studentId: student.id, studentToken: student.token, mode: state.mode };
  }

  async getState(token: string): Promise<unknown> {
    const state = await this.load();
    if (!state) throw new Error("Room not found or expired.");
    if (await sameSecret(token, await digest(state.teacherToken))) return teacherState(state);
    const student = state.students.find(item => item.token === token);
    if (!student) throw new Error("Invalid room access.");
    return studentState(state, student.id);
  }

  async teacherAction(token: string, action: string, studentId = ""): Promise<unknown> {
    const state = await this.load();
    if (!state || !(await sameSecret(token, await digest(state.teacherToken)))) throw new Error("Teacher access required.");
    const now = Date.now();
    if (action === "start") {
      if (state.phase !== "lobby") throw new Error("This session has already started.");
      state.phase = state.mode === "orbit" ? "question" : "active";
      state.questionIndex = 0; state.questionStartedAt = now;
      state.questionEndsAt = state.mode === "orbit" ? now + state.questions[0].seconds * 1000 : now + state.durationMinutes * 60_000;
    } else if (action === "result" && state.mode === "orbit") {
      state.phase = "result"; state.questionEndsAt = null;
    } else if (action === "leaderboard" && state.mode === "orbit") {
      state.phase = "leaderboard";
    } else if (action === "next" && state.mode === "orbit") {
      if (state.questionIndex + 1 >= state.questions.length) { state.phase = "finished"; state.questionEndsAt = null; }
      else { state.questionIndex += 1; state.phase = "question"; state.questionStartedAt = now; state.questionEndsAt = now + state.questions[state.questionIndex].seconds * 1000; }
    } else if (action === "finish") {
      state.phase = "finished"; state.questionEndsAt = null;
    } else if (action === "readmit") {
      const student = state.students.find(item => item.id === studentId); if (student) student.removed = false;
      state.incidents.filter(item => item.studentId === studentId).forEach(item => { item.resolved = true; });
    } else throw new Error("Unsupported teacher action.");
    await this.save(state);
    await this.ctx.storage.setAlarm(state.questionEndsAt ?? state.expiresAt);
    return teacherState(state);
  }

  async answer(token: string, questionId: string, answer: unknown, elapsedMs: number): Promise<unknown> {
    const state = await this.load();
    if (!state) throw new Error("Room not found or expired.");
    const student = state.students.find(item => item.token === token);
    if (!student || student.removed) throw new Error("You are not active in this room.");
    const question = state.questions.find(item => item.id === questionId);
    if (!question) throw new Error("Question not found.");
    if (state.mode === "orbit" && (state.phase !== "question" || state.questions[state.questionIndex].id !== questionId)) throw new Error("That question is not accepting answers.");
    if (state.mode === "quiz" && (state.phase !== "active" || (state.questionEndsAt && state.questionEndsAt < Date.now()))) throw new Error("This quiz is not accepting answers.");
    const manual = question.type === "free-response";
    const ratio = manual ? 0 : gradeAnswer(question, answer);
    const existing = state.responses.find(item => item.studentId === student.id && item.questionId === questionId);
    if (state.mode === "orbit" && existing) return studentState(state, student.id);
    const measuredElapsed = state.mode === "orbit" && state.questionStartedAt ? Date.now() - state.questionStartedAt : Number(elapsedMs) || 0;
    const boundedElapsed = Math.max(0, Math.min(state.mode === "orbit" ? question.seconds * 1000 : state.durationMinutes * 60_000, measuredElapsed));
    let points = 0;
    if (state.mode === "orbit") {
      const timeFactor = 1 - boundedElapsed / (question.seconds * 1000);
      const nextStreak = !manual && ratio === 1 ? student.streak + 1 : 0;
      points = Math.round(Math.min(450, 300 + 100 * Math.max(0, timeFactor) + Math.min(50, nextStreak * 10)) * ratio);
      student.streak = nextStreak; student.score += points;
    } else points = Math.round(question.points * ratio * 100) / 100;
    const storedAnswer = manual ? (Array.isArray(answer) ? answer : [answer]).map(item => cleanText(item, 4000)).filter(Boolean) : normalizeAnswer(answer);
    const record: ResponseRecord = { studentId: student.id, questionId, answer: storedAnswer, ratio, correct: ratio === 1, elapsedMs: boundedElapsed, points, gradePoints: manual ? 0 : Math.round(question.points * ratio * 100) / 100, graded: !manual, manual, answeredAt: Date.now() };
    if (existing) Object.assign(existing, record); else state.responses.push(record);
    await this.save(state);
    return studentState(state, student.id);
  }

  async gradeResponse(token: string, studentId: string, questionId: string, awarded: number): Promise<unknown> {
    const state = await this.load();
    if (!state || !(await sameSecret(token, await digest(state.teacherToken)))) throw new Error("Teacher access required.");
    const student = state.students.find(item => item.id === studentId);
    const question = state.questions.find(item => item.id === questionId);
    const response = state.responses.find(item => item.studentId === studentId && item.questionId === questionId);
    if (!student || !question || !response) throw new Error("Student response not found.");
    const gradePoints = Math.round(Math.max(0, Math.min(question.points, Number(awarded) || 0)) * 100) / 100;
    const ratio = question.points ? gradePoints / question.points : 0;
    const previousGamePoints = response.points;
    response.gradePoints = gradePoints;
    response.ratio = ratio;
    response.correct = ratio === 1;
    response.graded = true;
    response.manual = question.type === "free-response";
    response.points = state.mode === "orbit" ? Math.round(450 * ratio) : gradePoints;
    if (state.mode === "orbit") student.score = Math.max(0, student.score - previousGamePoints + response.points);
    await this.save(state);
    return teacherState(state);
  }

  async complete(token: string): Promise<unknown> {
    const state = await this.load();
    if (!state) throw new Error("Room not found or expired.");
    const student = state.students.find(item => item.token === token);
    if (!student) throw new Error("Invalid student access.");
    student.finished = true;
    await this.save(state);
    return studentState(state, student.id);
  }

  async incident(token: string, type: string, key: string, combo: string, remove: boolean): Promise<unknown> {
    const state = await this.load();
    if (!state) throw new Error("Room not found or expired.");
    const student = state.students.find(item => item.token === token);
    if (!student) throw new Error("Invalid student access.");
    state.incidents.push({ id: crypto.randomUUID(), studentId: student.id, type: cleanText(type, 60), key: cleanText(key, 40), combo: cleanText(combo, 120), createdAt: Date.now(), resolved: false });
    if (state.incidents.length > 500) state.incidents.splice(0, state.incidents.length - 500);
    if (remove) student.removed = true;
    await this.save(state);
    return studentState(state, student.id);
  }

  async report(token: string): Promise<unknown> {
    const state = await this.load();
    if (!state || !(await sameSecret(token, await digest(state.teacherToken)))) throw new Error("Teacher access required.");
    const students = state.students.map(({ token: _token, ...student }) => {
      const responses = state.responses.filter(item => item.studentId === student.id);
      const earned = responses.reduce((sum, item) => sum + (item.gradePoints ?? (item.correct ? (state.questions.find(question => question.id === item.questionId)?.points ?? 0) : 0)), 0);
      const possible = state.questions.reduce((sum, question) => sum + question.points, 0);
      const graded = responses.filter(item => item.graded !== false);
      const correctCount = graded.filter(item => item.correct).length;
      const percent = graded.length ? Math.round(correctCount / graded.length * 1000) / 10 : 0;
      return { ...student, gameScore: student.score, earned, possible, correctCount, percent, averageTimeMs: responses.length ? Math.round(responses.reduce((sum, item) => sum + item.elapsedMs, 0) / responses.length) : 0, responses };
    });
    const questions = state.questions.map(question => {
      const responses = state.responses.filter(item => item.questionId === question.id);
      const graded = responses.filter(item => item.graded !== false);
      const accuracy = graded.length ? graded.filter(item => item.correct).length / graded.length : 0;
      return { id: question.id, title: question.title, prompt: question.prompt, correct: question.correct, points: question.points, type: question.type, responseCount: responses.length, gradedCount: graded.length, accuracy: Math.round(accuracy * 1000) / 10, averageTimeMs: responses.length ? Math.round(responses.reduce((sum, item) => sum + item.elapsedMs, 0) / responses.length) : 0 };
    });
    return { code: state.code, mode: state.mode, title: state.title, students, questions, averagePercent: students.length ? Math.round(students.reduce((sum, item) => sum + item.percent, 0) / students.length * 10) / 10 : 0 };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
    const state = await this.load();
    if (!state) return new Response("Room not found", { status: 404 });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    let attachment: SocketAttachment | null = null;
    if (await sameSecret(token, await digest(state.teacherToken))) attachment = { role: "teacher", token };
    else { const student = state.students.find(item => item.token === token); if (student) attachment = { role: "student", studentId: student.id, token }; }
    if (!attachment) return new Response("Invalid room access", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [attachment.role, attachment.studentId ?? "teacher"]);
    server.send(JSON.stringify({ type: "state", data: attachment.role === "teacher" ? teacherState(state) : studentState(state, attachment.studentId!) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message === "ping") ws.send("pong");
  }
  async webSocketError(ws: WebSocket): Promise<void> { ws.close(1011, "Connection error"); }

  private async broadcast(state: SessionState): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        if (!attachment) continue;
        const data = attachment.role === "teacher" ? teacherState(state) : studentState(state, attachment.studentId!);
        ws.send(JSON.stringify({ type: "state", data }));
      } catch (error) { console.warn(JSON.stringify({ event: "socket_broadcast_failed", error: String(error), code: state.code })); }
    }
  }

  async alarm(): Promise<void> {
    const state = await this.load();
    if (!state) return;
    const now = Date.now();
    if (state.expiresAt <= now) { await this.ctx.storage.deleteAll(); return; }
    if ((state.phase === "question" || state.phase === "active") && state.questionEndsAt && state.questionEndsAt <= now) {
      state.phase = state.mode === "orbit" ? "result" : "finished";
      state.questionEndsAt = null;
      await this.save(state);
    }
    await this.ctx.storage.setAlarm(state.expiresAt);
  }
}

function cors(origin: string, allowed: string): HeadersInit {
  const accepted = origin === allowed || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin) ? origin : "";
  return { ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" };
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY) throw new Error("Request is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("Request is too large.");
  return JSON.parse(text) as Record<string, unknown>;
}

function bearer(request: Request): string { return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""; }

function secureCode(mode: Mode): string {
  const bytes = new Uint32Array(2); crypto.getRandomValues(bytes);
  if (mode === "orbit") return String(100000 + bytes[0] % 900000);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, (_, index) => alphabet[(bytes[index % 2] >>> ((index % 4) * 8)) % alphabet.length]).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const headers = cors(origin, env.ALLOWED_ORIGIN);
    if (origin && !("Access-Control-Allow-Origin" in headers)) return json({ error: "Origin not allowed" }, 403, headers);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === "/api/health") return json({ ok: true, service: "atom-classroom-api" }, 200, headers);
      if (url.pathname === "/api/session" && request.method === "POST") {
        const data = await body(request);
        const payload: CreatePayload = {
          mode: data.mode === "quiz" ? "quiz" : "orbit",
          title: cleanText(data.title, 120),
          password: cleanText(data.password, 120),
          durationMinutes: Number(data.durationMinutes) || 0,
          questions: Array.isArray(data.questions) ? data.questions as Question[] : [],
        };
        const mode: Mode = payload.mode === "quiz" ? "quiz" : "orbit";
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const code = secureCode(mode);
          const result = await env.CLASSROOMS.getByName(code).initialize(code, payload);
          if (result.created) return json({ code, teacherToken: result.teacherToken, mode }, 201, headers);
        }
        throw new Error("Could not allocate a room. Try again.");
      }
      const match = url.pathname.match(/^\/api\/session\/([A-Z0-9]{6,8})(?:\/(join|state|action|answer|grade|complete|incident|report|ws))?$/i);
      if (!match) return json({ error: "Not found" }, 404, headers);
      const code = match[1].toUpperCase(); const route = match[2] ?? "state"; const stub = env.CLASSROOMS.getByName(code);
      if (route === "ws") return await stub.fetch(request);
      if (route === "join" && request.method === "POST") { const data = await body(request); return json(await stub.join(cleanText(data.name, 40), cleanText(data.password, 120)), 200, headers); }
      if (route === "state" && request.method === "GET") return json(await stub.getState(bearer(request)), 200, headers);
      if (route === "action" && request.method === "POST") { const data = await body(request); return json(await stub.teacherAction(bearer(request), cleanText(data.action, 30), cleanText(data.studentId, 80)), 200, headers); }
      if (route === "answer" && request.method === "POST") { const data = await body(request); return json(await stub.answer(bearer(request), cleanText(data.questionId, 80), data.answer, Number(data.elapsedMs) || 0), 200, headers); }
      if (route === "grade" && request.method === "POST") { const data = await body(request); return json(await stub.gradeResponse(bearer(request), cleanText(data.studentId, 80), cleanText(data.questionId, 80), Number(data.points) || 0), 200, headers); }
      if (route === "complete" && request.method === "POST") return json(await stub.complete(bearer(request)), 200, headers);
      if (route === "incident" && request.method === "POST") { const data = await body(request); return json(await stub.incident(bearer(request), cleanText(data.type, 60), cleanText(data.key, 40), cleanText(data.combo, 120), Boolean(data.remove)), 200, headers); }
      if (route === "report" && request.method === "GET") return json(await stub.report(bearer(request)), 200, headers);
      return json({ error: "Method not allowed" }, 405, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected classroom error.";
      console.error(JSON.stringify({ event: "classroom_api_error", path: url.pathname, message }));
      return json({ error: message }, /required|invalid|incorrect|not found|expired/i.test(message) ? 403 : 400, headers);
    }
  },
} satisfies ExportedHandler<Env>;
