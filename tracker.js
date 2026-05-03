const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const repoPath = path.join(__dirname, 'potus-location-live-repo');
const stateFile = path.join(repoPath, 'last_location.json');
const mapFile = path.join(repoPath, 'index.html');

async function updatePotusLocation() {
    try {
        const browser = await puppeteer.launch({headless: true, executablePath: '/usr/bin/google-chrome-stable'});
        const page = await browser.newPage();
        await page.goto('https://x.com/WHPressPool', {waitUntil: 'networkidle2'});
        const posts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="tweetText"]')).map(t => t.innerText));
        await browser.close();

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Analyze these 10 reports from WH Press Pool: ${posts.slice(0, 10).join(' | ')}. Where is the President currently? Return ONLY the city, state, or location name. Normalize all White House locations (Oval Office, South Lawn, etc.) to "The White House". If he is traveling, return the specific destination. If unknown or he is resting, return "The White House".`);
        const locationName = result.response.text().trim();
        
        console.log('POTUS Status:', locationName);

        const currentHour = new Date().getUTCHours() - 5; // Simple ET offset adjustment
        const gifSource = (currentHour >= 6 && currentHour < 22) ? 'PotusLive3.gif' : 'PotusLid2.gif';

        let lastState = { location: "Unknown", gif: "" };
        if (fs.existsSync(stateFile)) lastState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        if (lastState.location === locationName && lastState.gif === gifSource) {
            execSync('openclaw message send --channel telegram --target 7954693898 --message "Potus Tracker running. No POTUS location change."');
            return;
        }

        fs.writeFileSync(stateFile, JSON.stringify({ location: locationName, gif: gifSource }));

        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body, html, #map { height: 100%; margin: 0; padding: 0; width: 100%; } #marker-overlay { position: absolute; width: 100px; height: 100px; z-index: 1000; pointer-events: none; }</style><script src="https://maps.googleapis.com/maps/api/js?key=AIzaSyAZg9pzWoBhlkiArmE0rWtLhFTonsPO1jI"></script></head><body><div id="map"></div><div id="marker-overlay"><img src="${gifSource}" width="100" height="100" /></div><script>function initMap() { var whiteHouse = {lat: 38.8977, lng: -77.0365}; var map = new google.maps.Map(document.getElementById('map'), { zoom: 18, center: whiteHouse, mapTypeId: 'roadmap' }); var overlay = new google.maps.OverlayView(); overlay.onAdd = function() { this.getPanes().overlayImage.appendChild(document.getElementById('marker-overlay')); }; overlay.draw = function() { var projection = this.getProjection(); var pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(whiteHouse.lat, whiteHouse.lng)); var div = document.getElementById('marker-overlay'); div.style.left = (pos.x - 50) + 'px'; div.style.top = (pos.y - 50) + 'px'; }; overlay.setMap(map); } window.onload = initMap;</script></body></html>`;

        fs.writeFileSync(mapFile, html);
        execSync('cd ' + repoPath + ' && git add . && git commit -m "Auto-update: POTUS at ' + locationName + '" && git push origin main');
        execSync('openclaw message send --channel telegram --target 7954693898 --message "Potus Tracker running. Potus Location changed to: ' + locationName + '\\n\\nMap: https://papirealmagic-cyber.github.io/potus-location-live/index.html"');
        
    } catch (e) { console.error(e); }
}

updatePotusLocation();