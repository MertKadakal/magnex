// debug.js - Comprehensive Simulation Diagnostics
const fs = require('fs');
const path = require('path');

console.log("Starting comprehensive diagnostic test...");

// Load index.html
const htmlPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Extract the Javascript content
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
let jsContent = '';
while ((match = scriptRegex.exec(htmlContent)) !== null) {
    jsContent += match[1] + '\n';
}

if (!jsContent) {
    console.error("No script tag found in index.html!");
    process.exit(1);
}

// Minimal DOM Mocking
const mockDocument = {
    getElementById: (id) => {
        return {
            classList: {
                add: (cls) => {},
                remove: (cls) => {},
                contains: (cls) => false
            },
            addEventListener: (ev, cb) => {},
            style: {
                opacity: '',
                width: '',
                setProperty: (p, v) => {}
            },
            innerText: '',
            innerHTML: '',
            appendChild: (el) => {},
            querySelectorAll: () => [],
            getContext: (type) => {
                return {
                    clearRect: () => {},
                    save: () => {},
                    restore: () => {},
                    beginPath: () => {},
                    arc: () => {},
                    fill: () => {},
                    stroke: () => {},
                    moveTo: () => {},
                    lineTo: () => {},
                    createRadialGradient: () => {
                        return {
                            addColorStop: () => {}
                        };
                    },
                    fillText: () => {}
                };
            },
            width: 800,
            height: 600,
            getBoundingClientRect: () => {
                return { left: 0, top: 0, width: 800, height: 600 };
            }
        };
    },
    querySelectorAll: (selector) => {
        return {
            forEach: (cb) => {}
        };
    },
    querySelector: (selector) => {
        return {
            classList: {
                add: (cls) => {},
                remove: (cls) => {},
                contains: (cls) => false
            },
            style: {
                setProperty: (p, v) => {}
            },
            offsetWidth: 100
        };
    },
    createElement: (tag) => {
        return {
            className: '',
            innerText: ''
        };
    }
};

const mockWindow = {
    addEventListener: (ev, cb) => {
        if (ev === 'load') {
            if (!mockWindow.onloadCallbacks) mockWindow.onloadCallbacks = [];
            mockWindow.onloadCallbacks.push(cb);
        }
    },
    innerWidth: 1024,
    innerHeight: 768
};

// Mock AudioContext
class MockAudioContext {
    constructor() {
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = {};
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
        return {
            type: '',
            frequency: {
                setValueAtTime: () => {},
                exponentialRampToValueAtTime: () => {}
            },
            connect: () => {},
            start: () => {},
            stop: () => {}
        };
    }
    createGain() {
        return {
            gain: {
                setValueAtTime: () => {},
                exponentialRampToValueAtTime: () => {},
                linearRampToValueAtTime: () => {}
            },
            connect: () => {}
        };
    }
    createBiquadFilter() {
        return {
            type: '',
            frequency: { setValueAtTime: () => {} },
            Q: { setValueAtTime: () => {} },
            connect: () => {}
        };
    }
}

// Sandboxed execution of the Javascript
const sandbox = {
    window: mockWindow,
    document: mockDocument,
    navigator: { userAgent: 'mock' },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    requestAnimationFrame: (cb) => {
        sandbox.rafCallback = cb;
    },
    setTimeout: (cb, delay) => {
        cb();
    },
    console: {
        log: (...args) => {}, // quiet
        error: (...args) => console.error("[Sandbox Error]", ...args),
        warn: (...args) => console.warn("[Sandbox Warn]", ...args)
    },
    Math: Math
};

const jsContentExposed = jsContent + "\nwindow.addEventListener('load', () => { window.game = game; });\nwindow.SoundSynth = SoundSynth;\nwindow.PhysicsEngine = PhysicsEngine;";

try {
    const fn = new Function(...Object.keys(sandbox), jsContentExposed);
    fn(...Object.values(sandbox));
    
    if (mockWindow.onloadCallbacks) {
        mockWindow.onloadCallbacks.forEach(cb => cb());
    }
} catch (e) {
    console.error("Crash during sandbox setup:", e);
    process.exit(1);
}

const gameInstance = sandbox.window.game;
if (!gameInstance) {
    console.error("Game instance was not created!");
    process.exit(1);
}

console.log("SUCCESS: Setup complete!");
console.log(`Initial State: P1 Lives = ${gameInstance.p1Lives}, Hane = ${gameInstance.p1Hane}; P2 Lives = ${gameInstance.p2Lives}, Hane = ${gameInstance.p2Hane}`);

// Place magnet 1
console.log("\n--- Placing Stone 1 (P1 Turn) at (300, 200) ---");
gameInstance.placeMagnet(300, 200);
console.log(`P1 Lives: ${gameInstance.p1Lives} (expected: 5), Hane: ${gameInstance.p1Hane} (expected: 0)`);
console.log(`Board Clusters Count: ${gameInstance.physics.clusters.length}`);

// Run tick to settle physics
console.log("Simulating physics ticks...");
let limit = 0;
while (gameInstance.simulating && limit < 1000) {
    gameInstance.tick();
    limit++;
}
console.log(`Ticks to settle: ${limit}`);
console.log(`Active Player: ${gameInstance.activePlayer} (expected: 2)`);

// Place magnet 2
console.log("\n--- Placing Stone 2 (P2 Turn) at (300, 400) ---");
gameInstance.placeMagnet(300, 400);
console.log(`P2 Lives: ${gameInstance.p2Lives} (expected: 5), Hane: ${gameInstance.p2Hane} (expected: 0)`);
console.log(`Board Clusters Count: ${gameInstance.physics.clusters.length}`);

// Run tick to settle physics
console.log("Simulating physics ticks...");
limit = 0;
while (gameInstance.simulating && limit < 1000) {
    gameInstance.tick();
    limit++;
}
console.log(`Ticks to settle: ${limit}`);
console.log(`Active Player: ${gameInstance.activePlayer} (expected: 1)`);

// Place magnet 3 (within pull range of Magnet 1)
console.log("\n--- Placing Stone 3 (P1 Turn) at (300, 270) ---");
console.log("Stone 3 is 70px away from Stone 1 (300, 200), which is within the 150px Attraction Threshold!");
gameInstance.placeMagnet(300, 270);
console.log(`P1 Lives before physics settlement: ${gameInstance.p1Lives} (expected: 5)`);
console.log(`Board Clusters Count before settlement: ${gameInstance.physics.clusters.length}`);

// Run tick to settle physics and trigger pull/collision snap
console.log("Simulating physics ticks for magnetic attraction and collision snap...");
limit = 0;
while (gameInstance.simulating && limit < 1000) {
    gameInstance.tick();
    limit++;
}
console.log(`Ticks to settle: ${limit}`);
console.log(`Board Clusters Count after collision: ${gameInstance.physics.clusters.length} (expected: 1, since the 2 colliding magnets got snapped and removed)`);
console.log(`P1 Lives after snap: ${gameInstance.p1Lives} (expected: 4, lost 1 life on snap)`);
console.log(`P1 Hane after snap: ${gameInstance.p1Hane} (expected: 2, collected 2 snapped magnets)`);
console.log(`Active Player: ${gameInstance.activePlayer} (expected: 2)`);

if (gameInstance.p1Lives === 4 && gameInstance.p1Hane === 2 && gameInstance.physics.clusters.length === 1) {
    console.log("\nSUCCESS: All new life-based and snapping-score tabletop rules verified successfully!");
    process.exit(0);
} else {
    console.error("\nFAILURE: Rules mismatch!");
    process.exit(1);
}
