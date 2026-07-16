export const meta = {
  name: 'catalyst-learnings-scan',
  description: 'Fan out a fleet to scan catalystathletics.com articles + exercise library and extract transferable training-methodology learnings for the trAIner app',
  phases: [
    { title: 'Harvest', detail: 'fetch article section indexes, collect article URLs', model: 'sonnet' },
    { title: 'Read', detail: 'read a representative sample of articles per section, extract learnings', model: 'sonnet' },
    { title: 'Distill', detail: 'synthesize per-section learnings + app opportunities', model: 'sonnet' },
    { title: 'Library', detail: 'characterize exercise library taxonomy + program structure', model: 'sonnet' },
  ],
}

const BASE = 'https://www.catalystathletics.com'
const FETCH_HOWTO = 'To fetch a URL: first call ToolSearch with query "select:WebFetch" to load the WebFetch tool, then call WebFetch(url, prompt).'

const SECTIONS = [
  { key:'program-design',   id:13, slug:'Weightlifting-Program-Design',    name:'Weightlifting Program Design',     count:91,  sample:14 },
  { key:'general-training', id:1,  slug:'General-Training',                 name:'General Training',                  count:31,  sample:8  },
  { key:'ow-training',      id:18, slug:'Olympic-Weightlifting-Training',   name:'Olympic Weightlifting Training',    count:27,  sample:7  },
  { key:'mobility-recovery',id:10, slug:'Mobility-Prep-Recovery-Injury',    name:'Mobility, Prep, Recovery & Injury', count:38,  sample:8  },
  { key:'mental-emotional', id:15, slug:'Mental-Emotional',                 name:'Mental & Emotional',                count:55,  sample:8  },
  { key:'technique',        id:17, slug:'Olympic-Weightlifting-Technique',  name:'Olympic Weightlifting Technique',   count:173, sample:12 },
  { key:'nutrition',        id:3,  slug:'Nutrition',                        name:'Nutrition',                         count:9,   sample:5  },
  { key:'editorial',        id:7,  slug:'Editorial',                        name:'Editorial',                         count:65,  sample:6  },
  { key:'coaching-gym',     id:16, slug:'Weightlifting-Coaching-Gym',       name:'Weightlifting Coaching & Gym',      count:35,  sample:6  },
  { key:'competition',      id:14, slug:'Weightlifting-Competition',        name:'Weightlifting Competition',         count:33,  sample:6  },
  { key:'ow-general',       id:19, slug:'Olympic-Weightlifting-General',     name:'Olympic Weightlifting General',     count:60,  sample:6  },
]

function pageUrls(s){
  const n = Math.min(5, Math.ceil(s.count/30))
  const urls = []
  for(let p=0;p<n;p++){ urls.push(BASE+`/articles/section/${s.id}/${s.slug}/`+(p===0?'':`?start=${p*30}`)) }
  return urls
}
function stride(arr,n){
  if(!arr || arr.length===0) return []
  if(arr.length<=n) return arr
  const out=[]; const step=arr.length/n
  for(let i=0;i<n;i++){ out.push(arr[Math.floor(i*step)]) }
  return out
}

const HARVEST_SCHEMA = { type:'object', additionalProperties:false, required:['articles'], properties:{
  articles:{ type:'array', items:{ type:'object', additionalProperties:false, required:['title','url'], properties:{ title:{type:'string'}, url:{type:'string'} } } }
}}
const LEARNING_SCHEMA = { type:'object', additionalProperties:false, required:['title','summary','transferable_principles','app_relevance'], properties:{
  title:{type:'string'},
  url:{type:'string'},
  summary:{type:'string'},
  transferable_principles:{ type:'array', items:{type:'string'} },
  frameworks_or_models:{ type:'array', items:{type:'string'} },
  heuristics_rules:{ type:'array', items:{type:'string'} },
  oly_specific_caveats:{ type:'array', items:{type:'string'} },
  app_relevance:{type:'string'}
}}
const DISTILL_SCHEMA = { type:'object', additionalProperties:false, required:['section','themes','core_principles','app_opportunities'], properties:{
  section:{type:'string'},
  themes:{ type:'array', items:{type:'string'} },
  core_principles:{ type:'array', items:{type:'string'} },
  frameworks:{ type:'array', items:{type:'string'} },
  app_opportunities:{ type:'array', items:{ type:'object', additionalProperties:false, required:['area','idea'], properties:{ area:{type:'string'}, idea:{type:'string'}, evidence:{type:'string'} } } },
  notable_rules:{ type:'array', items:{type:'string'} }
}}
const EX_SCHEMA = { type:'object', additionalProperties:false, required:['taxonomy','per_exercise_fields','app_relevance'], properties:{
  taxonomy:{ type:'array', items:{type:'string'} },
  per_exercise_fields:{ type:'array', items:{type:'string'} },
  example_exercises:{ type:'array', items:{ type:'object', additionalProperties:false, required:['name'], properties:{ name:{type:'string'}, url:{type:'string'}, fields_present:{ type:'array', items:{type:'string'} } } } },
  app_relevance:{type:'string'}
}}
const PROG_SCHEMA = { type:'object', additionalProperties:false, required:['program_types','app_relevance'], properties:{
  program_types:{ type:'array', items:{type:'string'} },
  variables_exposed:{ type:'array', items:{type:'string'} },
  structure_observations:{ type:'array', items:{type:'string'} },
  app_relevance:{type:'string'}
}}

const harvest = (s) => agent(
`You are harvesting article links from the Catalyst Athletics website section "${s.name}".
Fetch each of these index pages and collect EVERY article link present on them:
${pageUrls(s).map(u=>'- '+u).join('\n')}

${FETCH_HOWTO} For each page, ask WebFetch for every article link (title + href). Article links look like /article/{number}/{slug}/.

Return ALL distinct articles found across the pages. Make every url ABSOLUTE (prefix ${BASE} if it starts with "/"). Deduplicate by url. Only return articles actually present on the pages — do not invent any.`,
  { label:`harvest:${s.key}`, phase:'Harvest', schema:HARVEST_SCHEMA, agentType:'general-purpose', model:'sonnet', effort:'low' }
)

const readArticle = (a, s) => {
  const tail = (String(a.url||'').split('/').filter(Boolean).pop() || s.key).slice(0,40)
  return agent(
`Read this Catalyst Athletics article and extract learnings useful for building "trAIner", a serverless/static workout-training web app that has: (a) an ANALYSIS ENGINE that reviews a user's logged training, and (b) an LLM "PROMPT BUILDER" that generates workout routines. Catalyst is Olympic-weightlifting focused, so prioritize TRANSFERABLE training-methodology, programming logic, and coaching heuristics over sport-specific minutiae — but record OLY-specific caveats where they matter.

Article: "${a.title}"
URL: ${a.url}
(Section: ${s.name})

${FETCH_HOWTO} Ask WebFetch for the article's main arguments, principles, rules-of-thumb, concrete numbers/ratios/percentages, decision criteria, and any named frameworks or step-by-step processes.

Then fill the schema. Be concrete: capture ACTUAL numbers, ratios, thresholds, and decision rules — not vague summaries. In app_relevance, name which part of trAIner it could inform (analysis-engine / prompt-builder / exercise-data-model / goal-modeling / recovery-fatigue / progression / ux) and how.`,
    { label:`read:${tail}`, phase:'Read', schema:LEARNING_SCHEMA, agentType:'general-purpose', model:'sonnet' }
  )
}

const distill = (reads, s) => agent(
`Synthesize learnings from ${reads.length} articles in the Catalyst Athletics section "${s.name}", for the trAIner workout app (has an analysis engine that reviews logged training + an LLM workout-generator prompt builder; serverless/static, no backend).

Per-article extractions (JSON):
${JSON.stringify(reads).slice(0,90000)}

Produce a section-level synthesis: recurring THEMES, the CORE transferable PRINCIPLES, named FRAMEWORKS/models, concrete APP_OPPORTUNITIES (each tagged with area: analysis-engine / prompt-builder / exercise-data-model / goal-modeling / recovery-fatigue / progression / ux), and NOTABLE_RULES/heuristics (keep numbers/thresholds where given). Be specific; avoid generic fitness platitudes.`,
  { label:`distill:${s.key}`, phase:'Distill', schema:DISTILL_SCHEMA, agentType:'general-purpose', model:'sonnet' }
)

const EX_PROMPT =
`Characterize the Catalyst Athletics EXERCISE LIBRARY to inform the exercise data model of "trAIner" (a workout app with an LLM workout-generator + an analysis engine).
${FETCH_HOWTO}
Fetch these, then from a category page open 3-4 INDIVIDUAL exercise pages and inspect them:
- ${BASE}/exercises/
- ${BASE}/exercises/section/8/Snatch-Exercises/
- ${BASE}/exercises/section/17/Accessory-Upper-Body/

Record: (1) the TAXONOMY — how exercises are grouped/classified; (2) PER_EXERCISE_FIELDS — what metadata each exercise page carries (e.g. description, setup, execution cues, common faults/errors, muscles/targets worked, video, variations, prerequisites, programming notes); (3) EXAMPLE_EXERCISES with the fields present on each; (4) APP_RELEVANCE — how this taxonomy + per-exercise metadata could inform trAIner's exercise-data-model and prompt-builder (e.g. movement-pattern tagging, primary/accessory roles, fault libraries, cue text).`

const PROG_PROMPT =
`Characterize how Catalyst Athletics structures its TRAINING PROGRAMS, to inform trAIner's goal modeling and workout-generator prompt builder.
${FETCH_HOWTO}
Fetch the programs index and 1-2 individual program description pages linked from it:
- ${BASE}/olympic-weightlifting-workouts/training-programs/

Record: (1) PROGRAM_TYPES — the categories/kinds of programs offered; (2) VARIABLES_EXPOSED — the parameters a user selects/sees (duration in weeks, days/week, goal, experience level, focus, competition/peaking, equipment); (3) STRUCTURE_OBSERVATIONS — how program structure is described (periodization, cycles, intensity waves, deloads, testing weeks, progression schemes); (4) APP_RELEVANCE — how this maps to trAIner's goal-modeling and prompt-builder.`

phase('Harvest')
log(`Launching scan across ${SECTIONS.length} article sections + exercise library + programs`)

const [sections, library, programs] = await Promise.all([
  pipeline(
    SECTIONS,
    (s) => harvest(s),
    (h, s) => { const picks = stride((h && h.articles) || [], s.sample); return parallel(picks.map(a => () => readArticle(a, s))).then(rs => rs.filter(Boolean)) },
    (reads, s) => distill(reads || [], s)
  ),
  agent(EX_PROMPT,   { label:'exercise-library', phase:'Library', schema:EX_SCHEMA,   agentType:'general-purpose', model:'sonnet' }),
  agent(PROG_PROMPT, { label:'programs',         phase:'Library', schema:PROG_SCHEMA, agentType:'general-purpose', model:'sonnet' }),
])

const distilled = (sections || []).filter(Boolean)
log(`Scan complete: ${distilled.length}/${SECTIONS.length} sections distilled`)
return { sections: distilled, library, programs }
