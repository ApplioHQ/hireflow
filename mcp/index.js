#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.APPLIO_API_URL || "https://hireflow-api.pritamavuthu7.workers.dev";
const TOKEN = process.env.APPLIO_TOKEN || "";

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({
  name: "Applio",
  version: "1.0.0",
});

server.tool(
  "search_jobs",
  "Search for job listings by title and location. Returns jobs with titles, companies, salaries, and apply links.",
  {
    query: z.string().describe("Job title or keywords to search for"),
    location: z.string().optional().describe("City, state, or country (e.g. 'New York', 'London')"),
    page: z.number().optional().describe("Page number (1-10)"),
  },
  async ({ query, location, page }) => {
    const params = new URLSearchParams({ q: query });
    if (location) params.set("location", location);
    if (page) params.set("page", String(page));
    const data = await api(`/job-search?${params}`);
    const lines = [`Found ${data.total} jobs (page ${data.page}/${data.pages}):\n`];
    for (const job of data.results) {
      let line = `**${job.title}** at ${job.company} — ${job.location}`;
      if (job.salary_min && job.salary_max) {
        line += ` | ${job.currency || "$"}${job.salary_min.toLocaleString()}-${job.salary_max.toLocaleString()}`;
      }
      line += `\nApply: ${job.url}`;
      lines.push(line);
    }
    return { content: [{ type: "text", text: lines.join("\n\n") }] };
  }
);

server.tool(
  "get_salary_data",
  "Get salary ranges for a job title in a specific location using real market data.",
  {
    role: z.string().describe("Job title (e.g. 'Software Engineer', 'Nurse')"),
    location: z.string().optional().describe("City or country (e.g. 'San Francisco', 'UK')"),
  },
  async ({ role, location }) => {
    const body = { target: role };
    if (location) body.location = location;
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Salary data requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const data = await api("/ai/salary", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "check_ats_score",
  "Score a resume against a job description for ATS (Applicant Tracking System) compatibility. Returns a score and specific recommendations.",
  {
    resume: z.string().describe("The full resume text"),
    job_description: z.string().describe("The job description to score against"),
  },
  async ({ resume, job_description }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "ATS scoring requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const data = await api("/ai/ats", { method: "POST", body: JSON.stringify({ resume, jd: job_description }) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "improve_resume_bullets",
  "Rewrite resume bullet points to be stronger, more quantified, and ATS-friendly. Grounded in the candidate's real experience — never fabricates.",
  {
    bullets: z.string().describe("The resume bullet points to improve (one per line)"),
    role: z.string().optional().describe("Target job title for context"),
  },
  async ({ bullets, role }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Resume improvement requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const body = { text: bullets, section: "experience" };
    if (role) body.role = role;
    const data = await api("/ai/improve", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "tailor_resume",
  "Tailor a resume to a specific job description. Adjusts keywords, skills, and bullet points to match what the employer is looking for.",
  {
    resume: z.string().describe("The full resume text or JSON"),
    job_description: z.string().describe("The job description to tailor for"),
  },
  async ({ resume, job_description }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Resume tailoring requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const data = await api("/ai/tailor", { method: "POST", body: JSON.stringify({ resume, jd: job_description }) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "generate_cover_letter",
  "Generate a cover letter tailored to a specific job, grounded in the candidate's resume.",
  {
    resume: z.string().describe("The candidate's resume text"),
    job_description: z.string().describe("The job description"),
    company: z.string().optional().describe("Company name"),
  },
  async ({ resume, job_description, company }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Cover letter generation requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const body = { resume, jd: job_description };
    if (company) body.company = company;
    const data = await api("/ai/letter", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "parse_resume",
  "Parse a resume from text into structured data (name, experience, education, skills).",
  {
    text: z.string().describe("Raw resume text to parse"),
  },
  async ({ text }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Resume parsing requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const data = await api("/ai/parse", { method: "POST", body: JSON.stringify({ text }) });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "interview_prep",
  "Generate interview questions and talking points for a specific role and job description.",
  {
    role: z.string().describe("Job title being interviewed for"),
    job_description: z.string().optional().describe("The job description"),
    resume: z.string().optional().describe("Candidate's resume for personalized questions"),
  },
  async ({ role, job_description, resume }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Interview prep requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const body = { role };
    if (job_description) body.jd = job_description;
    if (resume) body.resume = resume;
    const data = await api("/ai/interview", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "career_coach",
  "Ask Applio's AI career coach a question about resumes, job search strategy, interviews, salary negotiation, or career direction.",
  {
    message: z.string().describe("Your career question"),
    resume: z.string().optional().describe("Candidate's resume for context"),
  },
  async ({ message, resume }) => {
    if (!TOKEN) {
      return { content: [{ type: "text", text: "Career coach requires authentication. Set APPLIO_TOKEN to your Applio auth token." }] };
    }
    const body = { message };
    if (resume) body.resume = resume;
    const data = await api("/ai/assistant", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
