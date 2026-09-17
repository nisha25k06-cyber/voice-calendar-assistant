const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const sessions = new Map();
const scopes = ['https://www.googleapis.com/auth/calendar'];
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authClient = () => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`);
const readTokens = () => { try { return JSON.parse(fs.readFileSync(TOKEN_PATH)); } catch { return null; } };
const getCalendar = () => { const auth = authClient(); auth.setCredentials(readTokens() || {}); return google.calendar({version:'v3', auth}); };
const iso = value => new Date(value).toISOString();
const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function fallbackAction(text) {
  const lower = text.toLowerCase();
  const action = /\b(delete|remove|cancel)\b/.test(lower) ? 'delete' : /\b(update|edit|move|change|reschedule)\b/.test(lower) ? 'update' : /\b(list|show|what.*calendar|what.*events)\b/.test(lower) ? 'list' : 'create';
  const date = new Date();
  if (lower.includes('tomorrow')) date.setDate(date.getDate()+1);
  if (lower.includes('next week')) date.setDate(date.getDate()+7);
  const weekday = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (weekday) { const delta=(dayNames.indexOf(weekday[1])-date.getDay()+7)%7 || 7; date.setDate(date.getDate()+delta); }
  const dm=lower.match(/(?:on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if(dm){date.setMonth(+dm[1]-1,+dm[2]);if(dm[3])date.setFullYear(+dm[3]<100?2000 + +dm[3]:+dm[3]);}
  const tm=text.match(/(?:at|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i); let h=tm?+tm[1]:9; const m=tm&&tm[2]?+tm[2]:0; if(tm&&/pm/i.test(tm[3])&&h<12)h+=12;if(tm&&/am/i.test(tm[3])&&h===12)h=0; date.setHours(h,m,0,0);
  const duration=text.match(/for\s+(\d+)\s*(minute|min|minutes|hour|hr|hours|hrs)/i); const minutes=duration?+duration[1]*(/hour|hr/i.test(duration[2])?60:1):60;
  const reminder=text.match(/(\d+)\s*(minute|min|hour|hr)s?\s*before/i); const reminderMinutes=reminder?+reminder[1]*(/hour|hr/i.test(reminder[2])?60:1):10;
  const summary=text.replace(/\b(create|add|schedule|set|book|make|plan|delete|remove|cancel|update|edit|move|change|reschedule|event|appointment|meeting|calendar|today|tomorrow|next\s+\w+|at\s+[^ ]+|for\s+\d+\s*\w+|\d+\s*\w+\s*before)\b/gi,'').replace(/\s+/g,' ').trim() || 'Calendar event';
  const recurrence = /every\s+(day|weekday|week|month)/i.exec(text);
  const recurrenceRule = recurrence ? `RRULE:FREQ=${recurrence[1].toUpperCase()==='WEEKDAY'?'WEEKLY;BYDAY=MO,TU,WE,TH,FR':recurrence[1].toUpperCase()}` : null;
  return {action,summary,start:iso(date),end:iso(new Date(date.getTime()+minutes*60000)),reminders:[{method:'popup',minutes:reminderMinutes}],recurrence:recurrenceRule?[recurrenceRule]:[],query:text};
}

async function parseCommand(command, context='') {
  const schema = `Return ONLY JSON: {"actions":[{"action":"create|update|delete|list","summary":string,"start":ISO|null,"end":ISO|null,"location":string|null,"description":string|null,"eventId":string|null,"reminders":[{"method":"popup|email","minutes":number}],"recurrence":["RRULE:..."]}],"needsClarification":boolean,"question":string|null}. Parse multiple requested events into actions. Use current time ${new Date().toISOString()}. Ask one concise question if a required detail is missing. Preserve context and resolve follow-up answers.`;
  try {
    const provider=(process.env.AI_PROVIDER||'').toLowerCase(); const prompt=`${schema}\nConversation context: ${context || 'none'}\nUser: ${command}`;
    if(provider==='openai'&&process.env.OPENAI_API_KEY){const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:schema},{role:'user',content:prompt}]})});const j=await r.json();if(!r.ok)throw Error(j.error?.message);return JSON.parse(j.choices[0].message.content);}
    if(provider==='gemini'&&process.env.GEMINI_API_KEY){const model=process.env.GEMINI_MODEL||'gemini-2.0-flash';const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}})});const j=await r.json();if(!r.ok)throw Error(j.error?.message);return JSON.parse(j.candidates[0].content.parts[0].text);}
  } catch(error) { console.warn('AI parser fallback:',error.message); }
  const chunks=command.split(/\s+(?:and then|then|also)\s+|\s*;\s*/i).filter(Boolean); return {actions:chunks.map(fallbackAction),needsClarification:false,question:null};
}

function normalize(result) { return {...result,actions:(result.actions||[]).map(a=>({...fallbackAction(a.query||a.summary||''),...a,reminders:a.reminders?.length?a.reminders:[{method:'popup',minutes:10}],recurrence:a.recurrence||[]}))}; }
async function findEvent(cal, action) { if(action.eventId)return action.eventId; const result=await cal.events.list({calendarId:'primary',timeMin:iso(new Date(Date.now()-86400000*30)),timeMax:iso(new Date(Date.now()+86400000*365)),q:action.summary,singleEvents:true,orderBy:'startTime',maxResults:10}); return result.data.items?.[0]?.id; }
function eventBody(a, original) { const body={summary:a.summary||'Calendar event',description:a.description||original,start:{dateTime:a.start},end:{dateTime:a.end},reminders:{useDefault:false,overrides:a.reminders}}; if(a.location)body.location=a.location;if(a.recurrence?.length)body.recurrence=a.recurrence;return body; }

app.get('/api/status',(req,res)=>res.json({connected:!!readTokens(),provider:process.env.AI_PROVIDER||'fallback'}));
app.get('/auth/google',(req,res)=>{if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return res.status(400).send('Add Google OAuth credentials to .env');res.redirect(authClient().generateAuthUrl({access_type:'offline',scope:scopes,prompt:'consent'}));});
app.get('/oauth2callback',async(req,res)=>{try{const result=await authClient().getToken(req.query.code);fs.writeFileSync(TOKEN_PATH,JSON.stringify(result.tokens));res.send('<h2>Google Calendar connected.</h2><p>Return to the app.</p>');}catch(e){res.status(500).send(`Authentication failed: ${e.message}`);}});

app.post('/api/command',async(req,res)=>{
  if(!readTokens())return res.status(401).json({error:'Connect Google Calendar first.',authUrl:'/auth/google'});
  const command=req.body.command?.trim();if(!command)return res.status(400).json({error:'Please provide a command.'});
  const sessionId=req.body.sessionId||'default';const previous=sessions.get(sessionId);const parsed=normalize(await parseCommand(command,previous?.context));
  if(parsed.needsClarification){sessions.set(sessionId,{context:`${previous?.context||''}\nUser: ${command}`,pending:command});return res.json({needsClarification:true,message:parsed.question||'What details should I use?',question:parsed.question});}
  sessions.delete(sessionId);const cal=getCalendar();const responses=[];
  try { for(const action of parsed.actions){ if(action.action==='list'){const r=await cal.events.list({calendarId:'primary',timeMin:action.start||new Date().toISOString(),timeMax:action.end||iso(new Date(Date.now()+7*86400000)),singleEvents:true,orderBy:'startTime',maxResults:50});responses.push({action:'list',events:r.data.items||[]});continue;} const id=await findEvent(cal,action);if((action.action==='update'||action.action==='delete')&&!id){responses.push({error:`I couldn't find “${action.summary}”.`});continue;}if(action.action==='delete'){await cal.events.delete({calendarId:'primary',eventId:id});responses.push({message:`Deleted “${action.summary}”.`});continue;}const body=eventBody(action,command);if(action.action==='update')await cal.events.update({calendarId:'primary',eventId:id,requestBody:body});else await cal.events.insert({calendarId:'primary',requestBody:body});responses.push({message:`${action.action==='update'?'Updated':'Created'} “${body.summary}”.`});} const listed=responses.flatMap(x=>x.events||[]);const messages=responses.map(x=>x.message).filter(Boolean);if(listed.length)messages.push(`I found ${listed.length} event(s):\n${listed.map(e=>`• ${e.summary} — ${e.start?.dateTime||e.start?.date}`).join('\n')}`);res.json({messages,results:responses,message:messages.join('\n')||'Done.'}); } catch(e){console.error(e.response?.data||e);res.status(500).json({error:e.message});}
});

app.get('/api/dashboard',async(req,res)=>{if(!readTokens())return res.status(401).json({error:'Connect Google Calendar first.'});try{const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+30);const r=await getCalendar().events.list({calendarId:'primary',timeMin:iso(start),timeMax:iso(end),singleEvents:true,orderBy:'startTime',maxResults:100});res.json({events:r.data.items||[]});}catch(e){res.status(500).json({error:e.message});}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.listen(PORT,()=>console.log(`Running on http://localhost:${PORT}`));
