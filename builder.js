const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const repoPath = path.join(__dirname, 'potus-location-live-repo');
const scheduleFile = path.join(repoPath, 'daily_schedule.json');

async function buildSchedule() {
    try {
        const browser = await puppeteer.launch({headless: true, executablePath: '/usr/bin/google-chrome-stable'});
        const page = await browser.newPage();
        await page.goto('https://x.com/WHPressPool', {waitUntil: 'networkidle2'});
        const posts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="tweetText"]')).map(t => t.innerText));
        await browser.close();

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Analyze these 10 reports from WH Press Pool: ${posts.slice(0, 10).join(' | ')}. Extract the POTUS travel schedule for tomorrow. Return a JSON array of: { "location": "String", "time_et": "HH:mm" }. Example: [{"location": "Phoenix, AZ", "time_et": "14:00"}]. If no travel, return [].`);
        const schedule = JSON.parse(result.response.text());
        fs.writeFileSync(scheduleFile, JSON.stringify(schedule));

        for (const event of schedule) {
            const [h, m] = event.time_et.split(':');
            // 1. One-time Update Job
            execSync(`openclaw tasks create --cron "${m} ${h} * * *" "node ${repoPath}/update_map.js '${event.location}'"`);
            // 2. One-time Verifier Job (15 mins later)
            const vMin = (parseInt(m) + 15) % 60;
            const vHour = parseInt(m) + 15 >= 60 ? (parseInt(h) + 1) % 24 : h;
            execSync(`openclaw tasks create --cron "${vMin} ${vHour} * * *" "node ${repoPath}/verify_map.js '${event.location}'"`);
        }
        execSync(`openclaw message send --channel telegram --target 7954693898 --message "POTUS Daily Builder: Schedule set for ${schedule.length} events."`);
    } catch (e) { console.error(e); }
}

buildSchedule();