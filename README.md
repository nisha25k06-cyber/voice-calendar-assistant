# Voice Calendar Assistant

AI-powered Google Calendar assistant with voice input, multi-event commands, conversational follow-ups, a 30-day dashboard, recurring events, and an installable mobile PWA.

## New in v3

- **Multi-event scheduling:** “Book lunch tomorrow at 1 PM and a workout at 6 PM.”
- **Conversational follow-ups:** when required information is missing, the assistant asks a question and remembers the pending conversation for the browser session.
- **Calendar dashboard:** upcoming events for the next 30 days.
- **Recurring events:** commands such as “team standup every weekday at 9 AM” create Google Calendar RRULE events.
- **Mobile app version:** responsive layout plus PWA installation on Android, iOS Safari (Add to Home Screen), and desktop browsers.
- Existing OpenAI/Gemini parsing, reminders, CRUD commands, and voice confirmations remain supported.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`, connect Google Calendar, and use Chrome or Edge for voice input. On a phone, open the deployed HTTPS URL and choose **Install app** or **Add to Home Screen**.

## Configuration

Set Google OAuth credentials and one optional AI provider in `.env`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
# Or: AI_PROVIDER=openai, OPENAI_API_KEY=..., OPENAI_MODEL=gpt-4o-mini
```

Enable Google Calendar API and add the redirect URI to your OAuth client. Keep `.env` and `tokens.json` private. For a real mobile deployment, use HTTPS and a production token store instead of the local `tokens.json` file.

## Examples

- `Schedule a project review tomorrow at 3 PM for 45 minutes and a workout at 6 PM`
- `Create a standup every weekday at 9 AM for 15 minutes`
- `Move my dentist appointment to Friday at 4 PM`
- `Delete my team meeting`
- `What is on my calendar this week?`
- `Make it 30 minutes later` (after the assistant asks a follow-up)
