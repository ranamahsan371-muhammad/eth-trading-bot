import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'bot_state.json');

async function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
    return {
        wins: 0,
        losses: 0,
        consecutiveLosses: 0,
        currentStrategy: 1, // 1 = HYBRID, 2 = TURBO
        history: [],
        pendingTrade: false,
        lastTradeDirection: null,
        lastClosedTime: null
    };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getPrediction(c1, strategy) {
    if (strategy === 1) {
        if (c1 === 'red') return 'red';
        if (c1 === 'green') return 'green';
    } else {
        if (c1 === 'red') return 'green';
        if (c1 === 'green') return 'red';
    }
    return null;
}

async function runBot() {
    try {
        console.log('Fetching live ETHUSDT klines from Binance...');
        const resp = await fetch('https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=15m&limit=10');
        const data = await resp.json();
        if (!Array.isArray(data) || data.length < 2) {
            console.log('Invalid data from Binance');
            return;
        }

        const lastClosedCandleRaw = data[data.length - 2];
        const c1CandleRaw = data[0];

        const lastClosedCandle = {
            open: parseFloat(lastClosedCandleRaw[1]),
            close: parseFloat(lastClosedCandleRaw[4]),
            time: new Date(lastClosedCandleRaw[0]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
            color: parseFloat(lastClosedCandleRaw[4]) >= parseFloat(lastClosedCandleRaw[1]) ? 'green' : 'red',
            rawTime: lastClosedCandleRaw[0]
        };

        const c1Color = parseFloat(c1CandleRaw[4]) >= parseFloat(c1CandleRaw[1]) ? 'green' : 'red';

        let state = await loadState();

        if (state.lastClosedTime === lastClosedCandle.rawTime) {
            console.log('Candle already evaluated. Skipping...');
            return;
        }

        // 1. Evaluate Trade Result
        if (state.pendingTrade && state.lastTradeDirection) {
            const actualColor = lastClosedCandle.color;
            const isWin = (state.lastTradeDirection === actualColor);
            const appliedStrategyName = state.currentStrategy === 1 ? 'HYBRID' : 'TURBO';

            if (isWin) {
                state.wins++;
                state.consecutiveLosses = 0;
                state.history.unshift({
                    time: lastClosedCandle.time,
                    prediction: state.lastTradeDirection === 'green' ? 'BUY' : 'SELL',
                    strategy: appliedStrategyName,
                    result: 'WIN',
                    price: lastClosedCandle.close.toFixed(2)
                });
                console.log(`[WIN] Trade matched! Strategy: ${appliedStrategyName}`);
            } else {
                state.losses++;
                state.consecutiveLosses++;
                state.history.unshift({
                    time: lastClosedCandle.time,
                    prediction: state.lastTradeDirection === 'green' ? 'BUY' : 'SELL',
                    strategy: appliedStrategyName,
                    result: 'LOSS',
                    price: lastClosedCandle.close.toFixed(2)
                });
                console.log(`[LOSS] Trade failed! Shifting strategy from ${appliedStrategyName}...`);

                // SHIFT STRATEGY ON LOSS
                state.currentStrategy = state.currentStrategy === 1 ? 2 : 1;
            }
        }

        // 2. Generate Next Prediction
        const nextPrediction = getPrediction(c1Color, state.currentStrategy);
        if (nextPrediction) {
            state.pendingTrade = true;
            state.lastTradeDirection = nextPrediction;
        } else {
            state.pendingTrade = false;
            state.lastTradeDirection = null;
        }

        state.lastClosedTime = lastClosedCronTime(lastClosedCandle.rawTime); // Fixed sync reference

        if (state.history.length > 30) {
            state.history = state.history.slice(0, 30);
        }

        saveState(state);
        console.log('Bot state successfully updated and saved.');
    } catch (e) {
        console.error('Error running bot:', e);
    }
}

function lastClosedCronTime(t) {
    return t;
}

runBot();
