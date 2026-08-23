
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

let history = [];
let wins = 0;
let losses = 0;
let consecutiveLosses = 0;
let currentStrategy = 1;
let lastTradeDirection = null;
let pendingTrade = false;
let lastCandleTime = null;

function getPrediction(c1, c4, strategy) {
    if (strategy === 1) {
        if (c1 === 'red' && c4 === 'red') return 'SELL';
        if (c1 === 'green' && c4 === 'green') return 'BUY';
        if (c1 === 'red' && c4 === 'green') return 'SELL';
        if (c1 === 'green' && c4 === 'red') return 'BUY';
    } else {
        if (c1 === 'red' && c4 === 'red') return 'BUY';
        if (c1 === 'green' && c4 === 'green') return 'SELL';
        if (c1 === 'red' && c4 === 'green') return 'BUY';
        if (c1 === 'green' && c4 === 'red') return 'SELL';
    }
    return null;
}

function switchStrategy() {
    if (currentStrategy === 1) {
        currentStrategy = 2;
        console.log('🔄 Switched to STRATEGY #2 (TURBO)');
    } else {
        currentStrategy = 1;
        console.log('🔄 Switched to STRATEGY #1 (HYBRID)');
    }
    consecutiveLosses = 0;
}

async function getCandles() {
    try {
        const url = 'https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=15m&limit=7';
        const response = await axios.get(url);
        const data = response.data;
        const candles = data.slice(0, 6).map(c => ({
            open: parseFloat(c[1]),
            close: parseFloat(c[4]),
            time: c[0],
            color: parseFloat(c[4]) >= parseFloat(c[1]) ? 'green' : 'red'
        }));
        return candles;
    } catch (error) {
        console.error('❌ Error fetching candles:', error.message);
        return null;
    }
}

async function getPrice() {
    try {
        const url = 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT';
        const response = await axios.get(url);
        return parseFloat(response.data.price);
    } catch (error) {
        console.error('❌ Error fetching price:', error.message);
        return null;
    }
}

function processTrade(candle) {
    if (!pendingTrade || !lastTradeDirection) return null;
    const actualColor = candle.color;
    const price = candle.close;
    const isWin = (lastTradeDirection === actualColor);
    let result = {
        time: new Date(candle.time).toLocaleTimeString(),
        prediction: lastTradeDirection === 'green' ? 'BUY' : 'SELL',
        result: isWin ? 'WIN' : 'LOSS',
        price: price.toFixed(2),
        strategy: currentStrategy === 1 ? 'HYBRID' : 'TURBO'
    };
    if (isWin) {
        wins++;
        consecutiveLosses = 0;
        console.log(`✅ WIN! Price: $${price.toFixed(2)}`);
    } else {
        losses++;
        consecutiveLosses++;
        console.log(`❌ LOSS! Price: $${price.toFixed(2)} | Consecutive: ${consecutiveLosses}`);
        if (consecutiveLosses >= 1) {
            switchStrategy();
            pendingTrade = false;
            lastTradeDirection = null;
            return { ...result, strategySwitch: true };
        }
    }
    pendingTrade = false;
    lastTradeDirection = null;
    history.unshift(result);
    if (history.length > 100) history.pop();
    saveHistory();
    return result;
}

function saveHistory() {
    const data = { history, wins, losses, currentStrategy, totalTrades: wins + losses };
    try {
        fs.writeFileSync('history.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Error saving history:', error.message);
    }
}

function loadHistory() {
    try {
        if (fs.existsSync('history.json')) {
            const data = JSON.parse(fs.readFileSync('history.json', 'utf8'));
            history = data.history || [];
            wins = data.wins || 0;
            losses = data.losses || 0;
            currentStrategy = data.currentStrategy || 1;
            console.log(`📂 Loaded history: ${wins}W / ${losses}L`);
        }
    } catch (error) {
        console.error('❌ Error loading history:', error.message);
    }
}

async function runBot() {
    console.log(`\n🔄 BOT RUNNING - ${new Date().toISOString()}`);
    console.log(`📊 Current Strategy: ${currentStrategy === 1 ? 'HYBRID' : 'TURBO'}`);
    const candles = await getCandles();
    if (!candles || candles.length < 6) {
        console.log('❌ No candles data');
        return;
    }
    const price = await getPrice();
    if (price) {
        console.log(`💰 Price: $${price.toFixed(2)}`);
    }
    const lastCandle = candles[candles.length - 1];
    if (lastCandle.time === lastCandleTime) {
        console.log('⏳ Same candle - waiting...');
        return;
    }
    if (pendingTrade && lastCandleTime) {
        const prevCandle = candles.find(c => c.time === lastCandleTime);
        if (prevCandle) {
            const result = processTrade(prevCandle);
            if (result) {
                console.log(`📊 Trade Result: ${result.result} | ${result.prediction} at $${result.price}`);
            }
        }
    }
    lastCandleTime = lastCandle.time;
    const c1 = candles[0];
    const c4 = candles[3];
    const prediction = getPrediction(c1.color, c4.color, currentStrategy);
    if (prediction) {
        const direction = prediction === 'BUY' ? 'green' : 'red';
        if (!pendingTrade) {
            pendingTrade = true;
            lastTradeDirection = direction;
            console.log(`📊 SIGNAL: ${prediction} | C1:${c1.color} C4:${c4.color} | Strategy: ${currentStrategy === 1 ? 'HYBRID' : 'TURBO'}`);
        }
    } else {
        console.log('⏸️ No signal - waiting');
    }
    console.log(`📊 Status: ${pendingTrade ? 'PENDING TRADE' : 'WAITING'} | ${wins}W / ${losses}L`);
}

app.get('/', (req, res) => {
    const strategyName = currentStrategy === 1 ? 'HYBRID' : 'TURBO';
    res.json({
        status: 'running',
        strategy: strategyName,
        wins: wins,
        losses: losses,
        totalTrades: wins + losses,
        winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(2) + '%' : '0%',
        pendingTrade: pendingTrade,
        lastTrades: history.slice(0, 10)
    });
});

async function start() {
    console.log('🤖 ETHUSDT TRADING BOT');
    console.log('📊 15-Minute Timeframe');
    console.log('🔄 Strategy Switch on 1 Loss');
    console.log('====================================');
    loadHistory();
    setInterval(runBot, 60000);
    await runBot();
    app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
        console.log(`📊 Status: http://localhost:${PORT}`);
    });
}

start();
