const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const scopes = ['https://www.googleapis.com/auth/calendar'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = () => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`);
const tokens = () => { try { return JSON.parse(fs.readFileSync(TOKEN_PATH)); } catch { return null; } };
const calendar = () => { const auth = client(); auth.setCredentials(tokens() || {}); return google.calendar({ version: 'v3', auth }); };
const iso = d => new Date(d).toISOString();

function fallbackParse(command) {
  const text = command.trim(); const lower = text.toLowerCase();
  const action = /\b(delete|remove|cancel)\b/.test(lower) ? 'delete' : /\b(update|edit|move|change|reschedule)\b/.test(lower) ? 'update' : /\b(list|show|what.*events|schedule)\b/.test(lower) && !/\b(create|add|book|set)\b/.test(lower) ? 'list' : 'create';
  const date = new Date();
  if (lower.includes('tomorrow')) date.setDate(date.getDate() + 1);
  const day = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (day) { const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; let n = (names.indexOf(day[1]) - date.getDay() + 7) % 7 || 7; date.setDate(date.getDate() + n); }
  const dm = lower.match(/(?:on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (dm) { date.setMonth(+dm[1] - 1, +dm[2]); if (dm[3]) date.setFullYear(+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]); }
  const tm = text.match(/(?:at|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i); let h = tm ? +tm[1] : 9; const min = tm && tm[2] ? +tm[2] : 0; if (tm && /pm/i.test(tm[3]) && h < 12) h += 12; if (tm && /am/i.test(tm[3]) && h === 12) h = 0; date.setHours(h, min, 0, 0);
  const dur = text.match(/for\s+(\d+)\s*(minute|min|hour|hr)/i); const minutes = dur ? +dur[1] * (/hour|hr/i.test(dur[2]) ? 60 : 1) : 60;
  const title = text.replace(/\b(create|add|schedule|set|book|make|plan|delete|remove|cancel|update|edit|move|change|reschedule|event|appointment|meeting|calendar|today|tomorrow|next\s+\w+|at\s+[^ ]+|for\s+\d+\s*\w+)\b/gi, '').replace(/\s+/g, ' ').trim() || 'Calendar event';
  return { action, summary: title, start: iso(date), end: iso(new Date(date.getTime() + minutes * 60000)), durationMinutes: minutes, reminders: [{method:'popup', minutes:10}], query: text};
}

async function askAI(command) {
  const schema = 'Return ONLY JSON with keys action (create|update|delete|list), summary, start, end, location, description, eventId, reminders (array of {method: popup|email, minutes}), query. Interpret relative dates in the current date/time. Use ISO 8601 dates. Default duration is 60 minutes and default reminder is popup 10 minutes before. If details are missing, preserve null values.';
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  try {
    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body: JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature:0, response_format:{type:'json_object'}, messages:[{role:'system',content:`You are a calendar assistant. ${schema}`},{role:'user',content:`Current time: ${new Date().toISOString()}\nCommand: ${command}`}]})});
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'OpenAI request failed'); return JSON.parse(j.choices[0].message.content);
    }
    if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'; const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:`${schema}\nCurrent time: ${new Date().toISOString()}\nCommand: ${command}`}]}], generationConfig:{temperature:0, responseMimeType:'application/json'}})}); const j=await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Gemini request failed'); return JSON.parse(j.candidates[0].content.parts[0].text);
    }
  } catch (e) { console.warn('AI parser unavailable, using fallback:', e.message); }
  return fallbackParse(command);
}

function normalize(parsed) {
  const p = {...fallbackParse(parsed.query || parsed.summary || '') , ...parsed};
  p.reminders = Array.isArray(parsed.reminders) && parsed.reminders.length ? parsed.reminders : [{method:'popup', minutes:10}];
  if (p.start && !p.end) p.end = iso(new Date(new Date(p.start).getTime()+3600000));
  return p;
}

app.get('/api/status', (req,res) => res.json({connected: !!tokens(), provider: process.env.AI_PROVIDER || 'fallback'}));
app.get('/auth/google', (req,res) => { if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(400).send('Add Google OAuth credentials to .env'); const a=client(); res.redirect(a.generateAuthUrl({access_type:'offline',scope:scopes,prompt:'consent'})); });
app.get('/oauth2callback', async (req,res) => { try { const a=client(); const result=await a.getToken(req.query.code); fs.writeFileSync(TOKEN_PATH, JSON.stringify(result.tokens)); res.send('<h2>Google Calendar connected.</h2><p>Return to the app.</p>'); } catch(e) { res.status(500).send(`Authentication failed: ${e.message}`); } });

app.post('/api/command', async (req,res) => {
  if (!tokens()) return res.status(401).json({error:'Connect Google Calendar first.', authUrl:'/auth/google'});
  if (!req.body.command?.trim()) return res.status(400).json({error:'Please provide a command.'});
  const p = normalize(await askAI(req.body.command)); const cal = calendar();
  try {
    if (p.action === 'list') { const result=await cal.events.list({calendarId:'primary',timeMin:p.start || new Date().toISOString(),timeMax:p.end || iso(new Date(Date.now()+7*86400000)),singleEvents:true,orderBy:'startTime',maxResults:20}); return res.json({action:'list', events:result.data.items || [], message:`I found ${(result.data.items||[]).length} event(s).`}); }
    if ((p.action === 'delete' || p.action === 'update') && !p.eventId) { const result=await cal.events.list({calendarId:'primary',timeMin:iso(new Date(Date.now()-86400000)),timeMax:iso(new Date(Date.now()+31*86400000)),q:p.summary,singleEvents:true,orderBy:'startTime',maxResults:10}); const match=result.data.items?.[0]; if (!match) return res.status(404).json({error:`I couldn't find an event matching “${p.summary}”.`}); p.eventId=match.id; }
    if (p.action === 'delete') { await cal.events.delete({calendarId:'primary',eventId:p.eventId}); return res.json({action:'delete',message:`Deleted “${p.summary || 'the event'}”.`}); }
    const body={summary:p.summary || 'Calendar event',description:p.description || req.body.command,location:p.location || undefined,start:{dateTime:p.start},end:{dateTime:p.end},reminders:{useDefault:false,overrides:p.reminders}};
    if (p.action === 'update') await cal.events.update({calendarId:'primary',eventId:p.eventId,requestBody:body}); else await cal.events.insert({calendarId:'primary',requestBody:body});
    return res.json({action:p.action, parsed:p, message:`${p.action==='update'?'Updated':'Created'} “${body.summary}”.`});
  } catch(e) { console.error(e.response?.data || e); return res.status(500).json({error:e.message}); }
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.listen(PORT,()=>console.log(`Running on http://localhost:${PORT}`));
