const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const repoPath = path.join(__dirname, 'potus-location-live-repo');
const scheduleFile = path.join(repoPath, 'schedule.json');

async function potusDailyBuilder() {
    try {
        const browser = await puppeteer.launch({headless: true, executablePath: '/usr/bin/google-chrome-stable'});
        const page = await browser.newPage();
        await page.goto('https://x.com/WHPressPool', {waitUntil: 'networkidle2'});
        const posts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="tweetText"]')).map(t => t.innerText));
        await browser.close();

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Analyze these 10 reports from WH Press Pool: ${posts.slice(0, 10).join(' | ')}. Extract the President's schedule for the next day. Return a JSON array of objects: { "location": "String", "time": "24h HH:mm" }. If he is staying at The White House all day, return an empty array.`);
        const schedule = JSON.parse(result.response.text());

        fs.writeFileSync(scheduleFile, JSON.stringify(schedule));

        // Create individual cron jobs for each event
        schedule.forEach(event => {
            const [hours, minutes] = event.time.split(':');
            // Schedule map update at the specified time
            execSync(`openclaw tasks create --name "Update Map: ${event.location}" --cron "${minutes} ${hours} * * *" --payload "node ${repoPath}/update_map.js ${event.location}"`);
            // Schedule verification 5 mins later
            const verifierMinutes = (parseInt(minutes) + 5) % 60;
            const verifierHours = parseInt(minutes) + 5 >= 60 ? (parseInt(hours) + 1) % 24 : hours;
            execSync(`openclaw tasks create --name "Verify Map: ${event.location}" --cron "${verifierMinutes} ${verifierHours} * * *" --payload "node ${repoPath}/verify_map.js ${event.location}"`);
        });

        console.log('Daily Builder executed successfully.');
    } catch (e) { console.error(e); }
}

potusDailyBuilder();