const BaseStrategy = require('./BaseStrategy');

class ForexMomentumStrategy extends BaseStrategy {
    constructor(config = {}) {
        super({
            name: 'FOREX_MOMENTUM',
            timeframes: config.timeframes || ['15m', '1h'],
            symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'], // Majors más líquidos
            riskLevel: 'medium',
            ...config
        });
        
        this.parameters = {
            // Momentum indicators
            rsiPeriod: 14,
            rsiMomentumThreshold: 60, // Para confirmar momentum
            rsiOverextended: 80,
            rsiOversold: 20,
            
            // MACD settings
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,
            
            // Moving averages for trend
            smaFast: 10,
            smaSlow: 50,
            
            // ADX for trend strength
            adxPeriod: 14,
            adxTrendThreshold: 25,
            adxStrongTrend: 40,
            
            // Volume confirmation
            volumeMultiplier: 1.5,
            
            // Session filters
            tradingSessions: {
                london: { start: 8, end: 17, active: true },
                ny: { start: 13, end: 22, active: true },
                tokyo: { start: 0, end: 9, active: false }
            },
            
            // Risk management
            riskRewardRatio: 2.0,
            maxConcurrentTrades: 3,
            maxDailyLoss: 0.06, // 6% daily loss limit
            
            ...config.parameters
        };
        
        this.currentTrades = 0;
        this.dailyPnL = 0;
        this.lastResetTime = Date.now();
        this.correlationMatrix = this.buildCorrelationMatrix();
    }

    analyze(candleData, marketData = {}) {
        try {
            const { highs, lows, closes, volumes, opens } = candleData;
            const symbol = marketData.symbol || this.symbols[0];
            
            if (closes.length < Math.max(this.parameters.smaSlow, this.parameters.adxPeriod) + 10) {
                return null;
            }

            // Verificar condiciones generales
            if (!this.canTrade(symbol)) {
                return null;
            }

            // Calcular todos los indicadores
            const indicators = this.calculateAllIndicators(candleData);
            
            // Detectar momentum opportunity
            const momentumSignal = this.detectMomentumOpportunity(indicators, symbol);
            
            if (momentumSignal) {
                return this.createMomentumSignal(momentumSignal, indicators, symbol);
            }

            return null;

        } catch (error) {
            console.error(`Forex Momentum analysis error:`, error);
            return null;
        }
    }

    calculateAllIndicators(candleData) {
        const { highs, lows, closes, volumes } = candleData;
        
        // RSI para momentum
        const rsi = this.calculateRSI(closes);
        
        // MACD para divergencias y señales
        const macd = this.calculateMACD(closes, this.parameters.macdFast, this.parameters.macdSlow, this.parameters.macdSignal);
        
        // SMAs para tendencia
        const smaFast = this.calculateSMA(closes, this.parameters.smaFast);
        const smaSlow = this.calculateSMA(closes, this.parameters.smaSlow);
        
        // ADX para fuerza de tendencia
        const adx = this.calculateADX(highs, lows, closes, this.parameters.adxPeriod);
        
        // Volume analysis
        const volumeAnalysis = this.analyzeVolume(volumes, closes, 20);
        
        // Price action
        const priceAction = this.analyzePriceAction(highs, lows, closes, opens);
        
        return {
            rsi: rsi[rsi.length - 1],
            rsiPrev: rsi[rsi.length - 2],
            macd: macd[macd.length - 1],
            macdPrev: macd[macd.length - 2],
            smaFast: smaFast[smaFast.length - 1],
            smaSlow: smaSlow[smaSlow.length - 1],
            adx: adx,
            volume: volumeAnalysis,
            priceAction,
            currentPrice: closes[closes.length - 1],
            previousPrice: closes[closes.length - 2]
        };
    }

    detectMomentumOpportunity(indicators, symbol) {
        const signals = [];
        
        // 1. MACD Momentum Crossover (Bullish)
        if (this.isMACDMomentumBullish(indicators)) {
            signals.push({
                type: 'macd_momentum_bull',
                side: 'long',
                strength: this.calculateMomentumStrength('bull', indicators),
                reasoning: 'MACD bullish crossover with strong momentum confirmation'
            });
        }
        
        // 2. MACD Momentum Crossover (Bearish)
        if (this.isMACDMomentumBearish(indicators)) {
            signals.push({
                type: 'macd_momentum_bear',
                side: 'short',
                strength: this.calculateMomentumStrength('bear', indicators),
                reasoning: 'MACD bearish crossover with strong momentum confirmation'
            });
        }
        
        // 3. RSI Momentum Breakout (Bullish)
        if (this.isRSIMomentumBullish(indicators)) {
            signals.push({
                type: 'rsi_momentum_bull',
                side: 'long',
                strength: this.calculateMomentumStrength('bull', indicators),
                reasoning: 'RSI momentum breakout above 60 with trend alignment'
            });
        }
        
        // 4. RSI Momentum Breakout (Bearish)
        if (this.isRSIMomentumBearish(indicators)) {
            signals.push({
                type: 'rsi_momentum_bear',
                side: 'short',
                strength: this.calculateMomentumStrength('bear', indicators),
                reasoning: 'RSI momentum breakdown below 40 with trend alignment'
            });
        }
        
        // 5. ADX Strong Trend + SMA Alignment (Bullish)
        if (this.isADXTrendBullish(indicators)) {
            signals.push({
                type: 'adx_trend_bull',
                side: 'long',
                strength: this.calculateMomentumStrength('bull', indicators),
                reasoning: 'Strong ADX trend with SMA alignment and momentum'
            });
        }
        
        // 6. ADX Strong Trend + SMA Alignment (Bearish)
        if (this.isADXTrendBearish(indicators)) {
            signals.push({
                type: 'adx_trend_bear',
                side: 'short',
                strength: this.calculateMomentumStrength('bear', indicators),
                reasoning: 'Strong ADX trend with SMA alignment and momentum'
            });
        }
        
        // Filtrar por correlación si hay trades activos
        const filteredSignals = this.filterByCorrelation(signals, symbol);
        
        // Seleccionar la mejor señal
        if (filteredSignals.length > 0) {
            return filteredSignals.reduce((best, current) => 
                current.strength > best.strength ? current : best
            );
        }
        
        return null;
    }

    isMACDMomentumBullish(indicators) {
        const { macd, macdPrev, smaFast, smaSlow, adx, volume } = indicators;
        
        return (
            // MACD cruzó por encima de la línea de señal
            macd.MACD > macd.signal && macdPrev.MACD <= macdPrev.signal &&
            // MACD está por encima de cero (momentum positivo)
            macd.MACD > 0 &&
            // Tendencia alcista confirmada por SMAs
            smaFast > smaSlow &&
            // Tendencia fuerte confirmada por ADX
            adx > this.parameters.adxTrendThreshold &&
            // Volume confirmación
            volume.volumeRatio > this.parameters.volumeMultiplier
        );
    }

    isMACDMomentumBearish(indicators) {
        const { macd, macdPrev, smaFast, smaSlow, adx, volume } = indicators;
        
        return (
            // MACD cruzó por debajo de la línea de señal
            macd.MACD < macd.signal && macdPrev.MACD >= macdPrev.signal &&
            // MACD está por debajo de cero (momentum negativo)
            macd.MACD < 0 &&
            // Tendencia bajista confirmada por SMAs
            smaFast < smaSlow &&
            // Tendencia fuerte confirmada por ADX
            adx > this.parameters.adxTrendThreshold &&
            // Volume confirmación
            volume.volumeRatio > this.parameters.volumeMultiplier
        );
    }

    isRSIMomentumBullish(indicators) {
        const { rsi, rsiPrev, smaFast, smaSlow, currentPrice, adx } = indicators;
        
        return (
            // RSI rompió por encima del threshold de momentum
            rsi > this.parameters.rsiMomentumThreshold && rsiPrev <= this.parameters.rsiMomentumThreshold &&
            // RSI no está sobrecomprado
            rsi < this.parameters.rsiOverextended &&
            // Precio por encima de SMA rápida
            currentPrice > smaFast &&
            // Tendencia general alcista
            smaFast > smaSlow &&
            // ADX confirma tendencia
            adx > this.parameters.adxTrendThreshold
        );
    }

    isRSIMomentumBearish(indicators) {
        const { rsi, rsiPrev, smaFast, smaSlow, currentPrice, adx } = indicators;
        
        return (
            // RSI rompió por debajo del threshold inverso de momentum
            rsi < (100 - this.parameters.rsiMomentumThreshold) && rsiPrev >= (100 - this.parameters.rsiMomentumThreshold) &&
            // RSI no está sobrevendido
            rsi > this.parameters.rsiOversold &&
            // Precio por debajo de SMA rápida
            currentPrice < smaFast &&
            // Tendencia general bajista
            smaFast < smaSlow &&
            // ADX confirma tendencia
            adx > this.parameters.adxTrendThreshold
        );
    }

    isADXTrendBullish(indicators) {
        const { adx, smaFast, smaSlow, currentPrice, rsi, macd } = indicators;
        
        return (
            // ADX muestra tendencia muy fuerte
            adx > this.parameters.adxStrongTrend &&
            // Alineación perfecta de SMAs
            currentPrice > smaFast && smaFast > smaSlow &&
            // RSI en zona de momentum pero no sobrecomprado
            rsi > 50 && rsi < this.parameters.rsiOverextended &&
            // MACD positivo
            macd.MACD > 0 && macd.MACD > macd.signal
        );
    }

    isADXTrendBearish(indicators) {
        const { adx, smaFast, smaSlow, currentPrice, rsi, macd } = indicators;
        
        return (
            // ADX muestra tendencia muy fuerte
            adx > this.parameters.adxStrongTrend &&
            // Alineación perfecta de SMAs
            currentPrice < smaFast && smaFast < smaSlow &&
            // RSI en zona de momentum pero no sobrevendido
            rsi < 50 && rsi > this.parameters.rsiOversold &&
            // MACD negativo
            macd.MACD < 0 && macd.MACD < macd.signal
        );
    }

    calculateMomentumStrength(direction, indicators) {
        let strength = 5; // Base
        
        // ADX strength bonus
        if (indicators.adx > this.parameters.adxStrongTrend) strength += 2;
        else if (indicators.adx > this.parameters.adxTrendThreshold) strength += 1;
        
        // Volume confirmation
        if (indicators.volume.volumeRatio > 2.0) strength += 2;
        else if (indicators.volume.volumeRatio > this.parameters.volumeMultiplier) strength += 1;
        
        // MACD momentum
        if (direction === 'bull') {
            if (indicators.macd.MACD > indicators.macd.signal && indicators.macd.MACD > 0) strength += 1;
            if (indicators.rsi > this.parameters.rsiMomentumThreshold) strength += 1;
        } else {
            if (indicators.macd.MACD < indicators.macd.signal && indicators.macd.MACD < 0) strength += 1;
            if (indicators.rsi < (100 - this.parameters.rsiMomentumThreshold)) strength += 1;
        }
        
        // SMA alignment
        if (direction === 'bull' && indicators.smaFast > indicators.smaSlow) strength += 1;
        if (direction === 'bear' && indicators.smaFast < indicators.smaSlow) strength += 1;
        
        // Price action confirmation
        if (indicators.priceAction.bullishCandle && direction === 'bull') strength += 1;
        if (indicators.priceAction.bearishCandle && direction === 'bear') strength += 1;
        
        // Session bonus
        if (this.isActiveSession()) strength += 1;
        
        return Math.max(1, Math.min(10, strength));
    }

    createMomentumSignal(momentumSignal, indicators, symbol) {
        const currentPrice = indicators.currentPrice;
        
        // Calcular stop loss basado en ATR y soporte/resistencia
        const atr = this.calculateATRFromIndicators(indicators);
        let stopLossDistance, takeProfitDistance;
        
        if (momentumSignal.type.includes('adx_trend')) {
            // Trends fuertes: targets más amplios
            stopLossDistance = atr * 2.0;
            takeProfitDistance = atr * 4.0;
        } else if (momentumSignal.type.includes('macd_momentum')) {
            // MACD momentum: targets medios-amplios
            stopLossDistance = atr * 1.5;
            takeProfitDistance = atr * 3.5;
        } else {
            // RSI momentum: targets medios
            stopLossDistance = atr * 1.2;
            takeProfitDistance = atr * 3.0;
        }
        
        const stopLoss = momentumSignal.side === 'long'
            ? currentPrice - stopLossDistance
            : currentPrice + stopLossDistance;
            
        const takeProfit = momentumSignal.side === 'long'
            ? currentPrice + takeProfitDistance
            : currentPrice - takeProfitDistance;
        
        // Verificar risk/reward
        const risk = Math.abs(currentPrice - stopLoss) / currentPrice;
        const reward = Math.abs(takeProfit - currentPrice) / currentPrice;
        const riskRewardRatio = reward / risk;
        
        if (riskRewardRatio < this.parameters.riskRewardRatio) {
            return null;
        }
        
        // Incrementar contador de trades
        this.currentTrades++;
        
        return {
            side: momentumSignal.side,
            price: currentPrice,
            stopLoss,
            takeProfit,
            confidence: momentumSignal.strength / 10,
            risk: risk,
            reward: reward,
            riskRewardRatio,
            reasoning: momentumSignal.reasoning,
            strategy: momentumSignal.type,
            timeframe: this.timeframes[0],
            metadata: {
                symbol: symbol,
                atr: atr,
                adx: indicators.adx,
                rsi: indicators.rsi,
                macdHistogram: indicators.macd.histogram,
                volumeRatio: indicators.volume.volumeRatio,
                session: this.getCurrentSession(),
                correlationRisk: this.getCorrelationRisk(symbol),
                
                // Específico para Quantfury Forex
                leverage: this.getForexLeverage(symbol),
                spread: this.getForexSpread(symbol),
                
                // Gestión avanzada
                trailingStopLevels: this.generateTrailingLevels(currentPrice, momentumSignal.side, atr),
                partialExitLevels: this.generateForexPartialExits(currentPrice, takeProfit, momentumSignal.side)
            }
        };
    }

    // Utilidades específicas para Forex
    calculateSMA(prices, period) {
        if (prices.length < period) return [];
        
        const sma = [];
        for (let i = period - 1; i < prices.length; i++) {
            const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / period);
        }
        return sma;
    }

    calculateADX(highs, lows, closes, period) {
        if (highs.length < period + 1) return 0;
        
        // Simplified ADX calculation
        let plusDM = 0, minusDM = 0, tr = 0;
        
        for (let i = 1; i < Math.min(highs.length, period + 1); i++) {
            const highDiff = highs[i] - highs[i - 1];
            const lowDiff = lows[i - 1] - lows[i];
            
            if (highDiff > lowDiff && highDiff > 0) plusDM += highDiff;
            if (lowDiff > highDiff && lowDiff > 0) minusDM += lowDiff;
            
            const trueRange = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );
            tr += trueRange;
        }
        
        const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
        const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
        
        const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
        
        return dx;
    }

    analyzePriceAction(highs, lows, closes, opens) {
        const current = closes.length - 1;
        const prev = current - 1;
        
        if (current < 1) return { bullishCandle: false, bearishCandle: false };
        
        const currentCandle = {
            open: opens[current],
            close: closes[current],
            high: highs[current],
            low: lows[current]
        };
        
        const bodySize = Math.abs(currentCandle.close - currentCandle.open);
        const totalRange = currentCandle.high - currentCandle.low;
        const bodyRatio = bodySize / totalRange;
        
        return {
            bullishCandle: currentCandle.close > currentCandle.open && bodyRatio > 0.6,
            bearishCandle: currentCandle.close < currentCandle.open && bodyRatio > 0.6,
            bodyRatio: bodyRatio,
            totalRange: totalRange
        };
    }

    calculateATRFromIndicators(indicators) {
        // Estimación simplificada basada en volatilidad reciente
        const priceChange = Math.abs(indicators.currentPrice - indicators.previousPrice);
        return priceChange * 2; // Aproximación
    }

    buildCorrelationMatrix() {
        // Correlaciones típicas entre pares de forex
        return {
            'EURUSD': { 'GBPUSD': 0.8, 'USDJPY': -0.6, 'AUDUSD': 0.7, 'USDCAD': -0.7 },
            'GBPUSD': { 'EURUSD': 0.8, 'USDJPY': -0.5, 'AUDUSD': 0.6, 'USDCAD': -0.6 },
            'USDJPY': { 'EURUSD': -0.6, 'GBPUSD': -0.5, 'AUDUSD': -0.4, 'USDCAD': 0.5 },
            'AUDUSD': { 'EURUSD': 0.7, 'GBPUSD': 0.6, 'USDJPY': -0.4, 'USDCAD': -0.5 },
            'USDCAD': { 'EURUSD': -0.7, 'GBPUSD': -0.6, 'USDJPY': 0.5, 'AUDUSD': -0.5 }
        };
    }

    filterByCorrelation(signals, symbol) {
        // Si ya tenemos trades activos de pares correlacionados, reducir strength
        const correlations = this.correlationMatrix[symbol] || {};
        
        return signals.map(signal => {
            let adjustedStrength = signal.strength;
            
            // Penalizar si hay trades correlacionados activos
            Object.keys(correlations).forEach(correlatedPair => {
                if (this.hasActiveTrade(correlatedPair) && Math.abs(correlations[correlatedPair]) > 0.6) {
                    adjustedStrength -= 1;
                }
            });
            
            return { ...signal, strength: Math.max(1, adjustedStrength) };
        });
    }

    getForexLeverage(symbol) {
        // Leverage típico en Quantfury para forex majors
        return 30;
    }

    getForexSpread(symbol) {
        const spreads = {
            'EURUSD': 0.1,
            'GBPUSD': 0.2,
            'USDJPY': 0.1,
            'AUDUSD': 0.1,
            'USDCAD': 0.1
        };
        return spreads[symbol] || 0.2;
    }

    generateTrailingLevels(entryPrice, side, atr) {
        const levels = [];
        const direction = side === 'long' ? 1 : -1;
        
        // Trailing stop cada 0.5 ATR de ganancia
        for (let i = 1; i <= 5; i++) {
            const triggerDistance = atr * 0.5 * i;
            const stopDistance = atr * 1.0; // Stop trail a 1 ATR
            
            levels.push({
                triggerPrice: entryPrice + (triggerDistance * direction),
                stopPrice: entryPrice + ((triggerDistance - stopDistance) * direction),
                level: i
            });
        }
        
        return levels;
    }

    generateForexPartialExits(entryPrice, finalTarget, side) {
        const exits = [];
        const totalDistance = Math.abs(finalTarget - entryPrice);
        
        // 25% a 25% del camino
        const exit1 = side === 'long' 
            ? entryPrice + (totalDistance * 0.25)
            : entryPrice - (totalDistance * 0.25);
        exits.push({ percentage: 25, price: exit1 });
        
        // 50% a 50% del camino
        const exit2 = side === 'long' 
            ? entryPrice + (totalDistance * 0.50)
            : entryPrice - (totalDistance * 0.50);
        exits.push({ percentage: 50, price: exit2 });
        
        // 25% al target final
        exits.push({ percentage: 25, price: finalTarget });
        
        return exits;
    }

    canTrade(symbol) {
        // Verificar límites de trading
        if (this.currentTrades >= this.parameters.maxConcurrentTrades) return false;
        if (this.dailyPnL <= -this.parameters.maxDailyLoss) return false;
        if (!this.isActiveSession()) return false;
        
        return true;
    }

    isActiveSession() {
        const hour = new Date().getUTCHours();
        const sessions = this.parameters.tradingSessions;
        
        return (
            (sessions.london.active && hour >= sessions.london.start && hour < sessions.london.end) ||
            (sessions.ny.active && hour >= sessions.ny.start && hour < sessions.ny.end) ||
            (sessions.tokyo.active && hour >= sessions.tokyo.start && hour < sessions.tokyo.end)
        );
    }

    getCurrentSession() {
        const hour = new Date().getUTCHours();
        const sessions = this.parameters.tradingSessions;
        
        if (hour >= sessions.london.start && hour < sessions.london.end) return 'london';
        if (hour >= sessions.ny.start && hour < sessions.ny.end) return 'ny';
        if (hour >= sessions.tokyo.start && hour < sessions.tokyo.end) return 'tokyo';
        return 'inactive';
    }

    hasActiveTrade(symbol) {
        // Implementar lógica para verificar trades activos
        return false; // Placeholder
    }

    getCorrelationRisk(symbol) {
        // Calcular riesgo de correlación con trades activos
        return 'low'; // Placeholder
    }

    resetDailyCounters() {
        this.dailyPnL = 0;
        this.currentTrades = 0;
        this.lastResetTime = Date.now();
        console.log('🔄 Forex daily counters reset');
    }

    updatePnL(amount) {
        this.dailyPnL += amount;
    }

    getStrategyStats() {
        return {
            currentTrades: this.currentTrades,
            maxConcurrentTrades: this.parameters.maxConcurrentTrades,
            dailyPnL: this.dailyPnL,
            maxDailyLoss: this.parameters.maxDailyLoss,
            activeSession: this.getCurrentSession(),
            ...this.getPerformance()
        };
    }

    getStrategyDescription() {
        return `Forex Momentum strategy for major pairs. Uses MACD, RSI, ADX, and SMA alignment to catch strong momentum moves during London/NY sessions. 30x leverage with correlation filtering.`;
    }
}

module.exports = ForexMomentumStrategy;