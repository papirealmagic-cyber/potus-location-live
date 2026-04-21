const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const repoPath = path.join(__dirname, 'potus-location-live-repo');
const stateFile = path.join(repoPath, 'last_location.json');

async function updatePotusLocation() {
    try {
        const browser = await puppeteer.launch({headless: true, executablePath: '/usr/bin/google-chrome-stable'});
        const page = await browser.newPage();
        await page.goto('https://x.com/WHPressPool', {waitUntil: 'networkidle2'});
        const posts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="tweetText"]')).map(t => t.innerText));
        await browser.close();

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Analyze these reports: ${posts.slice(0, 10).join(' | ')}. Where is the President currently? Return ONLY the city, state, or location name (e.g., "The White House"). If location is ambiguous or he is resting, return "The White House".`);
        const locationName = result.response.text().trim();
        
        console.log(`POTUS Status: ${locationName}`);

        let lastState = { location: "Unknown" };
        if (fs.existsSync(stateFile)) lastState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        if (lastState.location === locationName) {
            execSync(`openclaw message send --channel telegram --target 7954693898 --message "Potus Tracker running. No POTUS location change."`);
            return;
        }

        fs.writeFileSync(stateFile, JSON.stringify({ location: locationName }));

        // Update map files logic omitted for brevity, keeping existing structure
        execSync(`cd ${repoPath} && git add . && git commit -m "Auto-update: POTUS at ${locationName}" && git push origin main`);
        execSync(`openclaw message send --channel telegram --target 7954693898 --message "Potus Tracker running. Potus Location changed to: ${locationName}\n\nMap: https://papirealmagic-cyber.github.io/potus-location-live/index.html"`);
        
    } catch (e) { console.error(e); }
}

updatePotusLocation();