#!/usr/bin/env node
/* Generates resume-examples/ pages for roles not yet covered, plus updates
   the index and sitemap. Run from repo root:  node scripts/gen-resume-examples.js
   Existing pages are NEVER overwritten (skip if file exists). */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'resume-examples');
const BASE = 'https://appliohq.com';
const TODAY = new Date().toISOString().slice(0, 10);
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const ROLES = [
  {
    slug: 'pharmacy-technician', title: 'Pharmacy Technician',
    meta: 'Pharmacy technician resume example with skills, bullet points, and a template optimized for ATS and hiring managers in 2026.',
    answer: 'A strong pharmacy technician resume highlights accuracy, patient safety, and throughput. Lead with certifications (CPhT, state license), name the pharmacy systems you know (PioneerRx, QS/1, McKesson), and quantify: prescriptions filled per shift, error rates, inventory managed.',
    summary: 'Certified pharmacy technician (CPhT) with experience processing prescriptions, managing inventory, and supporting pharmacists in high-volume retail and hospital settings. Focused on accuracy, patient safety, and efficient workflow, processing X+ prescriptions per shift with a near-zero error rate.',
    skills: ['CPhT Certification', 'Prescription Processing', 'Medication Dispensing', 'Inventory Management', 'PioneerRx / QS/1', 'HIPAA Compliance', 'Insurance Billing', 'Compounding', 'Patient Communication', 'Quality Assurance'],
    bullets: [
      'Processed X+ prescriptions per shift in a high-volume retail pharmacy, maintaining accuracy above 99.9%.',
      'Managed medication inventory valued at $X, reducing waste by X% through improved ordering processes.',
      'Assisted pharmacists with insurance claim resolution, recovering $X in rejected claims per month.',
      'Trained X new technicians on pharmacy software, safety protocols, and workflow procedures.',
      'Maintained HIPAA compliance across all patient interactions and record-keeping.',
      'Supported compounding operations, preparing X+ sterile and non-sterile compounds weekly.',
    ],
    template: 'Classic',
    templateDesc: 'A clean, professional layout that puts certifications and technical skills near the top, where pharmacist reviewers look first.',
    faq: [
      { q: 'Should I list my CPhT certification on my resume?', a: 'Absolutely. Put it in your header or summary. CPhT certification is the single most important credential for pharmacy technician roles and most employers require or strongly prefer it.' },
      { q: 'How do I quantify pharmacy technician experience?', a: 'Use numbers: prescriptions processed per shift, error rates, inventory value managed, claims recovered, or technicians trained. Even estimates (X+ per shift) beat vague descriptions.' },
      { q: 'What pharmacy software should I mention?', a: 'Name the systems you know: PioneerRx, QS/1, McKesson, Rx30, ScriptPro, or Epic. ATS filters often match on exact software names.' },
    ],
    related: ['registered-nurse', 'dental-hygienist', 'healthcare'],
  },
  {
    slug: 'paralegal', title: 'Paralegal',
    meta: 'Paralegal resume example with key skills, quantified bullet points, and an ATS-friendly template for 2026.',
    answer: 'A strong paralegal resume demonstrates legal research ability, case management experience, and attention to detail. Specify practice areas (litigation, corporate, IP), name the tools you use (Westlaw, LexisNexis, Clio), and quantify: cases managed, documents reviewed, filing deadlines met.',
    summary: 'Detail-oriented paralegal with experience supporting attorneys across litigation and corporate matters. Skilled in legal research, document drafting, case management, and e-discovery. Managed caseloads of X+ active matters while maintaining 100% filing deadline compliance.',
    skills: ['Legal Research', 'Westlaw / LexisNexis', 'Case Management', 'Document Drafting', 'E-Discovery', 'Clio / MyCase', 'Filing & Court Procedures', 'Contract Review', 'Client Communication', 'IRAC Analysis'],
    bullets: [
      'Managed a caseload of X+ active litigation matters, coordinating deadlines, filings, and discovery.',
      'Conducted legal research using Westlaw and LexisNexis, drafting memoranda cited in X+ court motions.',
      'Reviewed and organized X+ documents for e-discovery, reducing attorney review time by X%.',
      'Drafted contracts, pleadings, and correspondence, maintaining a 100% on-time filing record.',
      'Coordinated depositions and trial preparation for cases valued at $X+ in aggregate.',
      'Maintained case management databases, improving team access to case files and deadlines.',
    ],
    template: 'Executive',
    templateDesc: 'A polished, formal layout that conveys professionalism and attention to detail, fitting the legal industry\'s expectations.',
    faq: [
      { q: 'Should I include my paralegal certification?', a: 'Yes. List your CP (Certified Paralegal) or AAfPE-approved degree prominently. Many firms filter for certified candidates.' },
      { q: 'How do I show attention to detail on a paralegal resume?', a: 'Quantify it: mention filing deadline compliance rates, document accuracy, or error-free deliverables. Vague claims like "detail-oriented" are weaker than proof.' },
      { q: 'What practice areas should I highlight?', a: 'Name them specifically: litigation, corporate, intellectual property, real estate, family law. Tailor to the posting, ATS systems filter on practice area keywords.' },
    ],
    related: ['administrative-assistant', 'executive-assistant', 'business-analyst'],
  },
  {
    slug: 'medical-assistant', title: 'Medical Assistant',
    meta: 'Medical assistant resume example with clinical and administrative skills, bullet points, and an ATS-optimized template for 2026.',
    answer: 'A medical assistant resume should balance clinical and administrative skills. Highlight patient intake, vitals, EHR systems (Epic, Cerner, eClinicalWorks), phlebotomy, and insurance verification. Quantify patient volume and any efficiency improvements.',
    summary: 'Certified medical assistant (CMA) with experience in both clinical and administrative duties in fast-paced outpatient settings. Skilled in patient intake, vitals, phlebotomy, EHR documentation, and insurance verification, supporting X+ patients per day.',
    skills: ['Patient Intake & Vitals', 'Phlebotomy', 'EHR (Epic / Cerner)', 'Insurance Verification', 'Medical Terminology', 'CPR / BLS Certified', 'Injections & Immunizations', 'Scheduling', 'HIPAA Compliance', 'Lab Specimen Processing'],
    bullets: [
      'Performed patient intake, vitals, and preliminary assessments for X+ patients per day in a busy outpatient clinic.',
      'Administered injections, drew blood, and processed lab specimens, maintaining a 99%+ accuracy rate.',
      'Managed scheduling and insurance verification for X+ appointments weekly, reducing no-shows by X%.',
      'Documented patient encounters in Epic EHR, ensuring accurate and timely medical records.',
      'Assisted physicians with minor procedures and examinations across X+ exam rooms.',
      'Trained X new medical assistants on clinical protocols and EHR workflows.',
    ],
    template: 'Classic',
    templateDesc: 'A clean layout that clearly separates clinical skills from administrative duties, making it easy for healthcare recruiters to scan.',
    faq: [
      { q: 'Should I list both clinical and administrative skills?', a: 'Yes. Medical assistants are valued for both, and many job postings list requirements from both categories. Organize them clearly, with clinical skills first if the role is primarily clinical.' },
      { q: 'Which EHR systems should I mention?', a: 'Name every system you know: Epic, Cerner, eClinicalWorks, Athenahealth, NextGen. EHR proficiency is often a hard requirement.' },
      { q: 'Is CMA certification important on the resume?', a: 'Very. List CMA (AAMA) or RMA (AMT) in your header or summary. Many employers require certification, and ATS systems filter for it.' },
    ],
    related: ['registered-nurse', 'pharmacy-technician', 'dental-hygienist'],
  },
  {
    slug: 'real-estate-agent', title: 'Real Estate Agent',
    meta: 'Real estate agent resume example with sales metrics, key skills, and an ATS-friendly template for 2026.',
    answer: 'A real estate resume is driven by numbers: transactions closed, total volume, average days on market, listing-to-sale ratio. Show your license, market area, and specialties (residential, commercial, luxury, first-time buyers).',
    summary: 'Licensed real estate agent with X+ years of experience in residential sales. Closed $XM+ in transactions annually, consistently ranking in the top X% of the brokerage. Known for strong client relationships, market analysis, and negotiation skills.',
    skills: ['Residential Sales', 'Listing & Buyer Representation', 'Market Analysis (CMA)', 'Contract Negotiation', 'MLS / Zillow / Realtor.com', 'CRM (Follow Up Boss / kvCORE)', 'Lead Generation', 'Open Houses & Showings', 'Closing Coordination', 'State Licensure'],
    bullets: [
      'Closed X+ transactions totaling $XM+ in annual sales volume, ranking in the top X% of the brokerage.',
      'Reduced average days on market by X% through strategic pricing, staging recommendations, and targeted marketing.',
      'Generated X+ qualified leads per month through digital marketing, open houses, and referral networks.',
      'Negotiated contracts averaging X% above asking price for sellers and X% below for buyers.',
      'Managed a pipeline of X+ active clients using CRM, maintaining a 95%+ satisfaction rating.',
      'Mentored X new agents on lead generation, contract processes, and client management.',
    ],
    template: 'Modern',
    templateDesc: 'A visually polished layout that conveys professionalism and personal brand, important in client-facing real estate roles.',
    faq: [
      { q: 'How do I quantify real estate experience?', a: 'Use dollar volume ($XM closed), transaction count, days on market, ranking within your brokerage, or client satisfaction scores. Numbers make the difference.' },
      { q: 'Should I include my license number?', a: 'Include "Licensed Real Estate Agent, [State]" but the actual license number is typically not needed on the resume, just in applications.' },
      { q: 'What if I\'m new to real estate?', a: 'Highlight transferable skills (sales, negotiation, marketing, client service) from prior roles, plus your license and any completed training (NAR designations, broker mentorship).' },
    ],
    related: ['sales-representative', 'marketing-manager', 'financial-advisor'],
  },
  {
    slug: 'cybersecurity-analyst', title: 'Cybersecurity Analyst',
    meta: 'Cybersecurity analyst resume example with technical skills, certifications, and quantified bullet points for 2026.',
    answer: 'A cybersecurity resume leads with certifications (CompTIA Security+, CISSP, CEH), specific tools (Splunk, CrowdStrike, Wireshark, Nessus), and quantified impact: incidents responded to, vulnerabilities remediated, false positive reduction, compliance audits passed.',
    summary: 'Cybersecurity analyst with experience in threat detection, incident response, and vulnerability management across enterprise environments. Holds Security+ and [CISSP/CEH]. Monitored X+ endpoints, reduced mean time to respond by X%, and maintained compliance with SOC 2 and NIST frameworks.',
    skills: ['Threat Detection & Response', 'SIEM (Splunk / QRadar)', 'Vulnerability Scanning (Nessus / Qualys)', 'EDR (CrowdStrike / SentinelOne)', 'Firewall & IDS/IPS', 'Network Analysis (Wireshark)', 'SOC 2 / NIST / ISO 27001', 'Penetration Testing', 'Python / Bash Scripting', 'CompTIA Security+ / CISSP'],
    bullets: [
      'Monitored and triaged security alerts across X+ endpoints using Splunk SIEM, reducing false positives by X%.',
      'Led incident response for X+ security events, achieving a mean time to contain of under X hours.',
      'Conducted vulnerability scans using Nessus and coordinated remediation of X+ critical findings per quarter.',
      'Developed automated detection rules that identified X previously undetected threat patterns.',
      'Supported SOC 2 Type II and NIST 800-53 compliance audits with zero critical findings.',
      'Mentored X junior analysts on threat hunting methodologies and SOC procedures.',
    ],
    template: 'FAANG',
    templateDesc: 'A technical, single-column layout that puts certifications and technical skills front and center, ideal for security roles.',
    faq: [
      { q: 'Which cybersecurity certifications should I list?', a: 'Lead with CompTIA Security+ (entry-level), CISSP (experienced), or CEH. List them in your header or a dedicated certifications section, not buried in skills.' },
      { q: 'How do I show impact in cybersecurity?', a: 'Quantify: incidents responded to, MTTR improvements, vulnerabilities remediated, false positive reduction rates, compliance audits passed, or endpoints monitored.' },
      { q: 'Should I include a home lab or CTF experience?', a: 'Yes, especially early career. A home lab (SIEM setup, malware analysis) or CTF placements show hands-on skills beyond certifications.' },
    ],
    related: ['software-engineer', 'data-analyst', 'web-developer'],
  },
  {
    slug: 'civil-engineer', title: 'Civil Engineer',
    meta: 'Civil engineer resume example with project experience, technical skills, and an ATS-optimized template for 2026.',
    answer: 'A civil engineer resume should feature your PE or EIT status, specific project types (transportation, structural, water resources), software (AutoCAD, Civil 3D, Revit), and project scale (budget, area, structures designed).',
    summary: 'Licensed civil engineer (PE/EIT) with X+ years of experience in [transportation/structural/water resources] projects. Proficient in AutoCAD Civil 3D and project management, delivering projects valued at $XM+ on schedule and within budget.',
    skills: ['AutoCAD / Civil 3D', 'Revit / BIM', 'Structural Analysis', 'Project Management', 'Cost Estimation', 'Hydrology & Hydraulics', 'GIS / ArcGIS', 'Permitting & Compliance', 'Construction Oversight', 'PE / EIT License'],
    bullets: [
      'Designed and delivered X+ infrastructure projects valued at $XM+ total, completing all on schedule and within budget.',
      'Produced construction drawings and specifications in AutoCAD Civil 3D for X+ miles of roadway improvements.',
      'Managed permitting and regulatory compliance for projects across X municipalities, achieving zero violations.',
      'Conducted site inspections and quality assurance during construction phases of $XM+ projects.',
      'Reduced project costs by X% through value engineering and alternative material specifications.',
      'Mentored X junior engineers and coordinated cross-discipline design teams of X+ members.',
    ],
    template: 'Professional',
    templateDesc: 'A structured, formal layout that highlights licensure, project experience, and technical proficiency clearly.',
    faq: [
      { q: 'Should I list my PE or EIT on my resume?', a: 'Absolutely. Put it right after your name (e.g., "Jane Doe, PE"). PE licensure is often a hard requirement and the most important credential.' },
      { q: 'How do I describe projects on a civil engineering resume?', a: 'Name the project type, your specific role, the scope (budget, area, structures), and the outcome. Use numbers: $XM budget, X miles of roadway, X structures designed.' },
      { q: 'Which software should I highlight?', a: 'AutoCAD Civil 3D is near-universal. Also list Revit, MicroStation, HEC-RAS, ArcGIS, or any specialized software the posting mentions.' },
    ],
    related: ['mechanical-engineer', 'project-manager', 'electrician'],
  },
  {
    slug: 'content-writer', title: 'Content Writer',
    meta: 'Content writer resume example with portfolio highlights, SEO skills, and an ATS-friendly template for 2026.',
    answer: 'A content writer resume should show results, not just clips. Quantify traffic growth, engagement, conversion rates, and content volume. Highlight SEO skills, CMS experience (WordPress, Webflow), and the industries or topics you specialize in.',
    summary: 'Content writer and strategist with experience producing SEO-optimized articles, landing pages, and email campaigns. Published X+ pieces driving X+ monthly organic visits, with a focus on [B2B SaaS / fintech / health / etc.] content that converts.',
    skills: ['SEO Content Writing', 'Blog & Article Writing', 'Copywriting', 'WordPress / Webflow', 'Google Analytics / Search Console', 'Keyword Research (Ahrefs / SEMrush)', 'Content Strategy', 'Email Marketing', 'Social Media Copy', 'AP Style / Chicago Manual'],
    bullets: [
      'Wrote X+ long-form articles per month, driving a X% increase in organic traffic over X months.',
      'Produced landing page copy that improved conversion rates by X%, contributing to $X in pipeline.',
      'Conducted keyword research using Ahrefs and developed content calendars targeting X+ high-volume topics.',
      'Managed end-to-end content production in WordPress, from drafting to SEO optimization and publishing.',
      'Wrote email sequences with open rates averaging X% and click-through rates of X%, above industry benchmarks.',
      'Collaborated with design, product, and sales teams to create X+ pieces of sales enablement content.',
    ],
    template: 'Modern',
    templateDesc: 'A clean, readable layout with room for a portfolio link and specialization highlights.',
    faq: [
      { q: 'Should I include a portfolio link on my content writer resume?', a: 'Yes. Add a portfolio or personal site link in your header. Hiring managers want to see your actual writing, not just descriptions of it.' },
      { q: 'How do I quantify content writing experience?', a: 'Use traffic numbers, conversion rates, content volume (articles/month), email open/click rates, or revenue influenced. Even directional numbers ("increased traffic X%") beat none.' },
      { q: 'Is SEO experience important for content writers?', a: 'Very. Most content roles now require SEO knowledge. List specific tools (Ahrefs, SEMrush, Google Search Console) and outcomes (ranking improvements, traffic growth).' },
    ],
    related: ['marketing-manager', 'graphic-designer', 'ux-designer'],
  },
  {
    slug: 'supply-chain-manager', title: 'Supply Chain Manager',
    meta: 'Supply chain manager resume example with logistics metrics, key skills, and an ATS-optimized template for 2026.',
    answer: 'A supply chain manager resume is all about efficiency metrics: cost reduction, on-time delivery rates, inventory turns, lead time improvements. Show ERP experience (SAP, Oracle), team size managed, and the scale of operations (revenue, SKUs, facilities).',
    summary: 'Supply chain manager with X+ years overseeing end-to-end supply chain operations across [manufacturing / retail / e-commerce]. Managed $XM+ in annual procurement, improved on-time delivery to X%, and reduced logistics costs by X% through process optimization and vendor negotiation.',
    skills: ['Supply Chain Strategy', 'Procurement & Sourcing', 'Inventory Management', 'SAP / Oracle ERP', 'Demand Planning & Forecasting', 'Logistics & Distribution', 'Vendor Management', 'Lean / Six Sigma', 'S&OP Process', 'Team Leadership'],
    bullets: [
      'Managed end-to-end supply chain for $XM+ in annual revenue, overseeing procurement, warehousing, and distribution.',
      'Improved on-time delivery from X% to X% by restructuring carrier relationships and implementing route optimization.',
      'Reduced procurement costs by X% ($XM annually) through strategic vendor consolidation and contract renegotiation.',
      'Led a team of X across planning, logistics, and warehouse operations, improving productivity by X%.',
      'Implemented demand forecasting models that reduced excess inventory by X% and stockouts by X%.',
      'Drove Lean Six Sigma initiatives that eliminated X days of lead time across the supply chain.',
    ],
    template: 'Executive',
    templateDesc: 'A polished, results-focused layout suitable for management roles, with clear sections for metrics and leadership experience.',
    faq: [
      { q: 'What metrics matter most on a supply chain resume?', a: 'On-time delivery rate, cost reduction ($ and %), inventory turns, lead time, fill rate, and team size. These are the numbers hiring managers scan for.' },
      { q: 'Should I mention Lean Six Sigma certification?', a: 'Yes. Green Belt or Black Belt certification is a strong differentiator. List it in your header or certifications section.' },
      { q: 'Which ERP systems should I highlight?', a: 'Name them: SAP, Oracle, NetSuite, Microsoft Dynamics. ATS systems filter on specific ERP names, and many supply chain roles require specific platform experience.' },
    ],
    related: ['operations-manager', 'project-manager', 'business-analyst'],
  },
  {
    slug: 'interior-designer', title: 'Interior Designer',
    meta: 'Interior designer resume example with project highlights, software skills, and an ATS-friendly template for 2026.',
    answer: 'An interior designer resume should showcase your design aesthetic through project scope and outcomes, name the software you use (AutoCAD, SketchUp, Revit, Adobe Creative Suite), and quantify: projects completed, budgets managed, client satisfaction.',
    summary: 'Interior designer with X+ years of experience in residential and commercial design. Managed projects from concept through installation with budgets up to $X, delivering on time and on budget while maintaining high client satisfaction.',
    skills: ['Space Planning', 'AutoCAD / SketchUp', 'Revit / 3D Rendering', 'Adobe Creative Suite', 'Color Theory & Materials', 'FF&E Selection', 'Budget Management', 'Client Presentation', 'Building Codes & ADA', 'Vendor & Contractor Coordination'],
    bullets: [
      'Designed and delivered X+ residential and commercial interior projects with budgets ranging from $X to $X.',
      'Created space plans, 3D renderings, and construction documents in AutoCAD and SketchUp for client presentations.',
      'Managed FF&E procurement and vendor coordination, maintaining budgets within X% of estimates.',
      'Achieved a X% client satisfaction rate across all projects, generating X% of new business through referrals.',
      'Collaborated with architects and contractors to ensure designs met building codes and ADA requirements.',
      'Presented design concepts to clients using mood boards, material samples, and photorealistic renderings.',
    ],
    template: 'Modern',
    templateDesc: 'A visually clean layout with room for a portfolio link, letting your design work speak alongside your credentials.',
    faq: [
      { q: 'Should I include a portfolio link?', a: 'Yes. Interior design is visual, include a link to your online portfolio in the header. The resume gets you the interview; the portfolio closes it.' },
      { q: 'Which software should I list?', a: 'AutoCAD, SketchUp, Revit, Adobe Creative Suite (Photoshop, InDesign, Illustrator), and any 3D rendering tools you use (V-Ray, Enscape, Lumion).' },
      { q: 'How do I quantify interior design work?', a: 'Use project count, budget ranges managed, client satisfaction rates, referral percentages, or square footage designed. Numbers prove you can manage the business side of design.' },
    ],
    related: ['graphic-designer', 'ux-designer', 'marketing-manager'],
  },
  {
    slug: 'devops-engineer', title: 'DevOps Engineer',
    meta: 'DevOps engineer resume example with infrastructure skills, CI/CD experience, and an ATS-optimized template for 2026.',
    answer: 'A DevOps resume should show infrastructure scale (servers, containers, deployments/day), specific tools (Terraform, Kubernetes, Jenkins, GitHub Actions), cloud platforms (AWS, GCP, Azure), and reliability metrics (uptime, MTTR, deployment frequency).',
    summary: 'DevOps engineer with experience building and maintaining CI/CD pipelines, container orchestration, and cloud infrastructure at scale. Managed X+ production services on AWS/GCP, achieving X% uptime and X+ deployments per day.',
    skills: ['AWS / GCP / Azure', 'Terraform / CloudFormation', 'Kubernetes / Docker', 'CI/CD (Jenkins / GitHub Actions / GitLab CI)', 'Linux Administration', 'Monitoring (Datadog / Prometheus / Grafana)', 'Python / Bash / Go', 'Infrastructure as Code', 'Incident Response & On-Call', 'Security & Compliance'],
    bullets: [
      'Built and maintained CI/CD pipelines processing X+ deployments per day across X+ microservices.',
      'Managed Kubernetes clusters running X+ pods in production, achieving X% uptime SLA.',
      'Automated infrastructure provisioning with Terraform, reducing environment setup time from X hours to X minutes.',
      'Reduced mean time to recovery (MTTR) by X% through improved monitoring, alerting, and runbook automation.',
      'Migrated X+ services from on-premise to AWS, reducing infrastructure costs by X% ($X/month).',
      'Implemented security scanning in CI pipelines, catching X+ vulnerabilities before production deployment.',
    ],
    template: 'FAANG',
    templateDesc: 'A technical single-column layout optimized for engineering roles, with prominent skills and tools sections.',
    faq: [
      { q: 'Should I list every tool I know?', a: 'List the ones relevant to the role. A curated list of 10-15 tools you actually use is stronger than a wall of 40 logos. Tailor to the job description.' },
      { q: 'How do I show DevOps impact?', a: 'Quantify: deployment frequency, uptime percentage, MTTR, cost reduction, build time improvement, incidents prevented. These are the metrics hiring managers care about.' },
      { q: 'Is certification important for DevOps?', a: 'AWS Solutions Architect, CKA (Kubernetes), or HashiCorp Terraform Associate certifications are valued. List them if you have them, but hands-on experience matters more.' },
    ],
    related: ['software-engineer', 'cybersecurity-analyst', 'web-developer'],
  },
  {
    slug: 'physical-therapist', title: 'Physical Therapist',
    meta: 'Physical therapist resume example with clinical skills, patient outcomes, and an ATS-friendly template for 2026.',
    answer: 'A physical therapist resume should highlight your DPT, state licensure, clinical specialties (orthopedic, neurological, pediatric), patient outcomes, and caseload volume. Quantify: patients seen per day, outcome improvements, discharge rates.',
    summary: 'Licensed physical therapist (DPT) with X+ years of experience in [outpatient orthopedic / inpatient rehab / pediatric] settings. Manages a caseload of X+ patients per day, achieving X% of patients meeting or exceeding functional goals at discharge.',
    skills: ['Patient Evaluation & Treatment Planning', 'Manual Therapy', 'Therapeutic Exercise', 'Orthopedic Rehabilitation', 'Neurological Rehabilitation', 'Documentation (EMR / WebPT)', 'Patient Education', 'State Licensure (DPT)', 'CPR / BLS', 'Evidence-Based Practice'],
    bullets: [
      'Evaluated and treated X+ patients per day across orthopedic, post-surgical, and chronic pain populations.',
      'Achieved X% of patients meeting or exceeding functional goals at discharge, above the clinic average of X%.',
      'Developed individualized treatment plans incorporating manual therapy, therapeutic exercise, and patient education.',
      'Reduced average treatment duration by X visits through evidence-based protocol improvements.',
      'Mentored X physical therapy students and new graduates during clinical rotations.',
      'Documented evaluations, progress notes, and discharge summaries in WebPT / Epic, maintaining 100% compliance.',
    ],
    template: 'Professional',
    templateDesc: 'A clean, formal layout that clearly presents licensure, clinical specialties, and outcome metrics.',
    faq: [
      { q: 'Should I list my DPT and licensure on the resume?', a: 'Yes. Put "DPT" after your name and list your state licensure prominently. These are non-negotiable requirements for PT roles.' },
      { q: 'How do I quantify physical therapy outcomes?', a: 'Use patient outcome percentages (% meeting goals), caseload volume (patients/day), treatment duration improvements, or satisfaction scores.' },
      { q: 'What specializations should I highlight?', a: 'Name them: orthopedic, neurological, pediatric, geriatric, sports, or women\'s health. Board-certified specialties (OCS, NCS) should be listed after your name.' },
    ],
    related: ['registered-nurse', 'medical-assistant', 'social-worker'],
  },
  {
    slug: 'event-planner', title: 'Event Planner',
    meta: 'Event planner resume example with event scale, budget management, and an ATS-optimized template for 2026.',
    answer: 'An event planner resume should quantify: events managed per year, attendee counts, budgets, vendor relationships, and satisfaction ratings. Highlight event types (corporate, weddings, conferences) and tools (Cvent, Eventbrite, Salesforce).',
    summary: 'Event planner with X+ years of experience managing corporate events, conferences, and social gatherings for X+ to X+ attendees. Managed budgets up to $X and coordinated X+ vendors per event, consistently delivering on time and within budget.',
    skills: ['Event Planning & Coordination', 'Budget Management', 'Vendor Negotiation', 'Cvent / Eventbrite', 'Contract Management', 'Logistics & Operations', 'Client Relations', 'Marketing & Promotion', 'On-Site Management', 'Post-Event Analysis'],
    bullets: [
      'Planned and executed X+ events per year for X+ to X+ attendees, including conferences, galas, and corporate retreats.',
      'Managed event budgets up to $X, consistently delivering within X% of budget.',
      'Negotiated contracts with X+ vendors per event, reducing costs by X% through volume commitments.',
      'Achieved X% client satisfaction rating across all events, generating X% repeat business.',
      'Coordinated logistics including venue selection, catering, A/V, transportation, and on-site staffing.',
      'Developed post-event reports analyzing attendance, feedback, and ROI for stakeholder review.',
    ],
    template: 'Modern',
    templateDesc: 'A polished layout that conveys organizational skill and creativity, fitting the event planning industry.',
    faq: [
      { q: 'How do I quantify event planning experience?', a: 'Use event count, attendee numbers, budget size, vendor count, satisfaction ratings, and cost savings. Scale matters in this field.' },
      { q: 'Should I list specific event types?', a: 'Yes. Specify: corporate conferences, trade shows, weddings, fundraisers, product launches. Tailor to the types the employer runs.' },
      { q: 'What tools should I mention?', a: 'Cvent, Eventbrite, Social Tables, Salesforce, and any project management tools (Asana, Monday.com) you use for event coordination.' },
    ],
    related: ['marketing-manager', 'project-manager', 'administrative-assistant'],
  },
  {
    slug: 'data-engineer', title: 'Data Engineer',
    meta: 'Data engineer resume example with pipeline experience, technical skills, and an ATS-friendly template for 2026.',
    answer: 'A data engineer resume should feature pipeline scale (TB/day, tables, sources), specific tools (Spark, Airflow, dbt, Snowflake, BigQuery), cloud platforms, and data quality improvements. Show you can build reliable, scalable data infrastructure.',
    summary: 'Data engineer with experience designing and maintaining data pipelines processing X+ TB/day across cloud and on-premise environments. Proficient in Spark, Airflow, dbt, and [Snowflake / BigQuery / Redshift], focused on reliability, data quality, and scalability.',
    skills: ['Apache Spark / PySpark', 'Airflow / Dagster', 'dbt', 'Snowflake / BigQuery / Redshift', 'SQL & Python', 'AWS / GCP / Azure', 'Kafka / Event Streaming', 'Data Modeling', 'ETL/ELT Design', 'Data Quality & Testing'],
    bullets: [
      'Designed and maintained X+ data pipelines processing X+ TB/day, achieving X% uptime SLA.',
      'Built ELT workflows in dbt and Airflow, reducing data freshness from X hours to under X minutes.',
      'Migrated legacy ETL processes to Snowflake, cutting compute costs by X% and query times by X%.',
      'Implemented data quality checks that caught X+ data issues per month before downstream impact.',
      'Modeled X+ dimensional tables serving analytics and ML teams, enabling self-service BI adoption.',
      'Optimized Spark jobs processing X+ GB datasets, reducing runtime by X% through partition and caching strategies.',
    ],
    template: 'FAANG',
    templateDesc: 'A technical single-column layout that highlights the tools and scale data engineering roles demand.',
    faq: [
      { q: 'How do I show data engineering scale?', a: 'Quantify: data volume (TB/day), pipeline count, uptime SLA, freshness improvements, cost savings, or tables modeled. Scale is the differentiator.' },
      { q: 'Should I list dbt and Airflow?', a: 'Yes. These are now standard in modern data stacks. Name them explicitly, ATS systems filter on exact tool names.' },
      { q: 'Is cloud certification useful?', a: 'AWS Data Analytics, GCP Professional Data Engineer, or Snowflake certifications add value, especially when changing roles or industries.' },
    ],
    related: ['data-analyst', 'software-engineer', 'devops-engineer'],
  },
  {
    slug: 'bartender', title: 'Bartender',
    meta: 'Bartender resume example with service skills, revenue metrics, and an ATS-friendly template for 2026.',
    answer: 'A bartender resume should highlight speed, customer service, revenue, and compliance. Quantify: drinks per shift, average check size, upselling results, and certifications (TIPS, ServSafe). Show you can handle high-volume environments.',
    summary: 'Experienced bartender with X+ years in high-volume craft cocktail bars and restaurants. Consistently served X+ guests per shift, maintained X% customer satisfaction, and increased average check size by X% through upselling and cocktail recommendations.',
    skills: ['Craft Cocktail Preparation', 'Speed & High-Volume Service', 'Customer Service', 'POS Systems (Toast / Square)', 'Inventory & Par Management', 'Upselling & Suggestive Selling', 'TIPS / ServSafe Certified', 'Cash Handling', 'Bar Menu Development', 'Team Collaboration'],
    bullets: [
      'Served X+ guests per shift in a high-volume bar generating $X+ in nightly revenue.',
      'Increased average check size by X% through suggestive selling and craft cocktail recommendations.',
      'Managed bar inventory and ordering, reducing waste by X% and maintaining optimal par levels.',
      'Developed X new cocktail recipes adopted into the seasonal menu, increasing cocktail sales by X%.',
      'Trained X new bartenders on drink recipes, POS systems, and responsible service practices.',
      'Maintained a clean, organized bar and ensured compliance with all health and liquor regulations.',
    ],
    template: 'Simple',
    templateDesc: 'A clean, straightforward layout that puts work experience and certifications front and center.',
    faq: [
      { q: 'Should I include TIPS or ServSafe certification?', a: 'Yes. Many employers require responsible beverage service certification. List it prominently, it can be a filter in ATS systems for hospitality roles.' },
      { q: 'How do I quantify bartending experience?', a: 'Use revenue generated per shift, guests served, check size increases, waste reduction, or new hires trained. Numbers make a bartending resume stand out.' },
      { q: 'What if I\'m applying to a different industry?', a: 'Highlight transferable skills: customer service, cash handling, fast-paced multitasking, upselling (sales), inventory management. These translate across industries.' },
    ],
    related: ['customer-service-representative', 'sales-representative', 'event-planner'],
  },
];

function pageHTML(r) {
  const title = `${r.title} Resume Examples & Template (2026)`;
  const url = `${BASE}/resume-examples/${r.slug}`;
  const ld = [
    { "@context":"https://schema.org","@type":"Article","headline":`${r.title} Resume Examples & Template (2026)`,
      "description":r.meta,"url":url,"datePublished":TODAY,"dateModified":TODAY,"inLanguage":"en",
      "author":{"@type":"Organization","name":"Applio"},
      "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":`${BASE}/logo.jpeg`}},
      "mainEntityOfPage":url },
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Resume Examples","item":`${BASE}/resume-examples`},
      {"@type":"ListItem","position":3,"name":`${r.title} Resume Examples`,"item":url} ]},
    { "@context":"https://schema.org","@type":"FAQPage","mainEntity":r.faq.map(f=>(
      {"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}})) }
  ];
  const skills = r.skills.map(s => `<span class="gd-chip">${esc(s)}</span>`).join('');
  const bullets = r.bullets.map(b => `<li>${esc(b)}</li>`).join('');
  const faqs = r.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ');
  const related = r.related.map(s => {
    const t = s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `<a href="/resume-examples/${s}">${esc(t)} Resume Examples &amp; Template</a>`;
  }).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Applio</title>
<meta name="description" content="${esc(r.meta)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${esc(title)} | Applio">
<meta property="og:description" content="${esc(r.meta)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} | Applio">
<meta name="twitter:description" content="${esc(r.meta)}">
${ld.map(o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .gd-wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 80px; }
  .gd-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
  .gd-crumb a { color: var(--muted); } .gd-crumb a:hover { color: var(--accent); }
  .gd-wrap h1 { font-size: clamp(28px,5vw,38px); font-weight: 800; letter-spacing:-.6px; line-height:1.15; }
  .gd-meta { color: var(--muted); font-size: 13px; margin-top: 10px; }
  .gd-answer { margin: 22px 0 8px; padding: 18px 20px; border:1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--r-md); background: var(--bg-1); box-shadow: var(--sh-1); font-size: 16px; line-height: 1.65; }
  .gd-section { margin-top: 34px; }
  .gd-section h2 { font-size: 22px; font-weight: 800; letter-spacing:-.3px; margin-bottom: 12px; }
  .gd-section p, .gd-section li { color: var(--text); line-height: 1.75; font-size: 15.5px; }
  .gd-section ul, .gd-section ol { padding-left: 20px; } .gd-section li { margin-bottom: 8px; }
  .gd-section a { color: var(--accent); } .gd-section a:hover { text-decoration: underline; }
  .gd-example { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); padding:16px 18px; box-shadow: var(--sh-1); font-size:15px; line-height:1.7; color:var(--text); }
  .gd-note { font-size:12.5px; color:var(--muted); margin-top:6px; }
  .gd-chips { display:flex; flex-wrap:wrap; gap:8px; }
  .gd-chip { font-size:12.5px; font-weight:600; color:#a5b4fc; background:rgba(99,102,241,.12); border:1px solid rgba(99,102,241,.24); border-radius:999px; padding:5px 12px; }
  .gd-faq { margin-top: 40px; }
  .gd-faq h2 { font-size: 22px; font-weight: 800; margin-bottom: 12px; }
  .gd-faq details { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); margin-bottom: 10px; box-shadow: var(--sh-1); }
  .gd-faq summary { cursor:pointer; padding: 14px 16px; font-weight: 600; list-style:none; }
  .gd-faq summary::-webkit-details-marker { display:none; }
  .gd-faq p { margin:0; padding: 0 16px 14px; color: var(--muted); line-height: 1.65; font-size: 14.5px; }
  .gd-rel { margin-top: 44px; }
  .gd-rel h2 { font-size: 18px; font-weight: 800; margin-bottom: 12px; }
  .gd-rel a { display:block; padding: 12px 14px; border:1px solid var(--border); border-radius: var(--r-md); margin-bottom: 8px; background: var(--bg-1); box-shadow: var(--sh-1); transition: border-color var(--dur) var(--ease); }
  .gd-rel a:hover { border-color: var(--accent); }
  .gd-final { margin-top: 46px; text-align:center; padding: 34px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); box-shadow: var(--sh-1); }
  .gd-final h2 { font-size: 22px; font-weight: 800; } .gd-final p { color: var(--muted); margin: 8px 0 16px; }
</style>
</head>
<body class="app-body-scroll">
<header class="app-topbar">
  <a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
  <div class="topbar-right">
    <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
    <a class="btn btn-primary btn-sm" href="/login?mode=signup">Build resume free</a>
  </div>
</header>
<main class="gd-wrap">
  <nav class="gd-crumb"><a href="/">Home</a> &rsaquo; <a href="/resume-examples">Resume Examples</a> &rsaquo; ${esc(r.title)}</nav>
  <article>
    <h1>${esc(r.title)} Resume Examples &amp; Template</h1>
    <div class="gd-meta">Updated ${TODAY} &middot; Applio</div>
    <div class="gd-answer">${esc(r.answer)}</div>

    <section class="gd-section">
      <h2>${esc(r.title)} resume summary example</h2>
      <div class="gd-example">${esc(r.summary)}</div>
      <p class="gd-note">Illustrative example. Replace the bracketed figures with your own real numbers.</p>
    </section>

    <section class="gd-section">
      <h2>Key skills for a ${esc(r.title.toLowerCase())} resume</h2>
      <div class="gd-chips">${skills}</div>
    </section>

    <section class="gd-section">
      <h2>${esc(r.title)} resume bullet point examples</h2>
      <ul>${bullets}</ul>
      <p class="gd-note">These are examples to adapt, use your own real achievements and numbers. Applio's AI can help you rewrite your bullets, grounded only in your actual experience.</p>
    </section>

    <section class="gd-section">
      <h2>Best resume template for a ${esc(r.title.toLowerCase())}</h2>
      <p>We recommend the <a href="/resume-templates">${esc(r.template)}</a> template. ${esc(r.templateDesc)} You can start with it free and switch anytime.</p>
    </section>

    <section class="gd-faq">
      <h2>Frequently asked questions</h2>
      ${faqs}
    </section>
  </article>
  <div class="gd-rel">
    <h2>More resume examples</h2>
    ${related}
    <a href="/resume-examples">All resume examples</a>
  </div>
  <div class="gd-final">
    <h2>Build your ${esc(r.title.toLowerCase())} resume free</h2>
    <p>Use Applio's ATS-optimized builder and let AI tailor your resume to any job, grounded in your real experience.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Start free, no credit card</a>
  </div>
</main>
</body>
</html>`;
}

// ---- write files ----
let written = 0, skipped = 0;
for (const r of ROLES) {
  const fp = path.join(DIR, `${r.slug}.html`);
  if (fs.existsSync(fp)) { skipped++; continue; }
  fs.writeFileSync(fp, pageHTML(r));
  written++;
}

// ---- update sitemap.xml ----
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
for (const r of ROLES) {
  const loc = `${BASE}/resume-examples/${r.slug}`;
  if (sm.includes(loc)) continue;
  const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  sm = sm.replace('</urlset>', entry + '\n</urlset>');
}
fs.writeFileSync(smPath, sm);

console.log(`Wrote ${written} new resume example pages (${skipped} already existed). Sitemap updated.`);
