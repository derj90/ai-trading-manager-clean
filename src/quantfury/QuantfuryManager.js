const EventEmitter = require('events');
const axios = require('axios');

class QuantfuryManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        
        // Quantfury no tiene API pública, así que manejamos todo via alertas inteligentes
        this.activeSignals = new Map();
        this.executedTrades = [];
        this.virtualPortfolio = {
            balance: config.initialBalance || 10000,
            positions: new Map(),
            unrealizedPnL: 0,
            realizedPnL: 0
        };
        
        // Instrumentos disponibles en Quantfury
        this.instruments = {
            // Forex
            'EURUSD': { type: 'forex', leverage: 30, spread: 0.1, commission: 0 },
            'GBPUSD': { type: 'forex', leverage: 30, spread: 0.2, commission: 0 },
            'USDJPY': { type: 'forex', leverage: 30, spread: 0.1, commission: 0 },
            'AUDUSD': { type: 'forex', leverage: 30, spread: 0.1, commission: 0 },
            'USDCAD': { type: 'forex', leverage: 30, spread: 0.1, commission: 0 },
            
            // Commodities
            'XAUUSD': { type: 'metal', leverage: 20, spread: 0.5, commission: 0 },
            'XAGUSD': { type: 'metal', leverage: 20, spread: 0.02, commission: 0 },
            'WTICRUD': { type: 'commodity', leverage: 10, spread: 0.05, commission: 0 },
            
            // Crypto
            'BTCUSD': { type: 'crypto', leverage: 10, spread: 1, commission: 0 },
            'ETHUSD': { type: 'crypto', leverage: 10, spread: 0.5, commission: 0 },
            'ADAUSD': { type: 'crypto', leverage: 10, spread: 0.001, commission: 0 },
            'DOTUSD': { type: 'crypto', leverage: 10, spread: 0.01, commission: 0 },
            
            // Stocks
            'AAPL': { type: 'stock', leverage: 5, spread: 0.01, commission: 0 },
            'TSLA': { type: 'stock', leverage: 5, spread: 0.02, commission: 0 },
            'GOOGL': { type: 'stock', leverage: 5, spread: 0.05, commission: 0 },
            'AMZN': { type: 'stock', leverage: 5, spread: 0.05, commission: 0 },
            'MSFT': { type: 'stock', leverage: 5, spread: 0.01, commission: 0 }
        };
        
        this.priceData = new Map();
        this.alertQueue = [];
    }

    // Configuración específica para Quantfury
    generateQuantfuryAlert(signal) {
        const instrument = this.instruments[signal.symbol];
        if (!instrument) {
            console.warn(`⚠️ Instrument ${signal.symbol} not available on Quantfury`);
            return null;
        }

        // Calcular position size óptimo basado en leverage y riesgo
        const leverage = instrument.leverage;
        const riskAmount = this.virtualPortfolio.balance * 0.02; // 2% risk
        const stopDistance = Math.abs(signal.price - signal.stopLoss) / signal.price;
        const positionSize = (riskAmount / stopDistance) / signal.price;
        const leveragedSize = positionSize * leverage;

        const alert = {
            id: this.generateAlertId(),
            timestamp: Date.now(),
            platform: 'quantfury',
            instrument: signal.symbol,
            action: signal.side, // 'long' o 'short'
            price: signal.price,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            positionSize: leveragedSize,
            leverage: leverage,
            riskAmount: riskAmount,
            
            // Información específica de Quantfury
            spread: instrument.spread,
            type: instrument.type,
            
            // Instrucciones para ejecución manual
            instructions: this.generateExecutionInstructions(signal, instrument, leveragedSize),
            
            // Alertas de precio
            priceAlerts: this.generatePriceAlerts(signal),
            
            // Análisis de riesgo
            riskAnalysis: this.analyzeRisk(signal, instrument, leveragedSize)
        };

        return alert;
    }

    generateExecutionInstructions(signal, instrument, positionSize) {
        const instructions = {
            setup: [
                `🎯 Abrir Quantfury app`,
                `📊 Buscar instrumento: ${signal.symbol}`,
                `📈 Seleccionar timeframe: ${signal.timeframe || '1H'}`,
                `⚙️ Configurar leverage: ${instrument.leverage}x`
            ],
            entry: [
                `📍 Precio de entrada: $${signal.price.toFixed(4)}`,
                `💰 Tamaño posición: $${positionSize.toFixed(2)}`,
                `🎯 Dirección: ${signal.side.toUpperCase()}`,
                `⏰ Ejecutar AHORA o a precio de mercado`
            ],
            riskManagement: [
                `🛑 Stop Loss: $${signal.stopLoss.toFixed(4)}`,
                `🎯 Take Profit: $${signal.takeProfit.toFixed(4)}`,
                `📊 Risk/Reward: ${signal.riskRewardRatio?.toFixed(2) || 'N/A'}`,
                `💸 Riesgo máximo: $${(positionSize * 0.02).toFixed(2)}`
            ],
            monitoring: [
                `📱 Configurar alertas de precio en ${signal.stopLoss} y ${signal.takeProfit}`,
                `📊 Monitorear en TradingView para confirmaciones adicionales`,
                `⏰ Revisar posición cada 4 horas`,
                `📈 Considerar toma parcial de ganancias en 50% del target`
            ]
        };

        return instructions;
    }

    generatePriceAlerts(signal) {
        const alerts = [];
        
        // Alert de entrada
        alerts.push({
            type: 'entry',
            price: signal.price,
            message: `🚀 ENTRADA: ${signal.symbol} ${signal.side.toUpperCase()} @ $${signal.price.toFixed(4)}`,
            urgency: 'high'
        });

        // Alerts de gestión de riesgo
        alerts.push({
            type: 'stop_loss',
            price: signal.stopLoss,
            message: `🛑 STOP LOSS: Cerrar ${signal.symbol} @ $${signal.stopLoss.toFixed(4)}`,
            urgency: 'critical'
        });

        alerts.push({
            type: 'take_profit',
            price: signal.takeProfit,
            message: `🎯 TAKE PROFIT: Cerrar ${signal.symbol} @ $${signal.takeProfit.toFixed(4)}`,
            urgency: 'high'
        });

        // Alerts intermedios
        const midPoint = signal.side === 'long' 
            ? signal.price + ((signal.takeProfit - signal.price) * 0.5)
            : signal.price - ((signal.price - signal.takeProfit) * 0.5);

        alerts.push({
            type: 'partial_profit',
            price: midPoint,
            message: `💰 PROFIT PARCIAL: Considerar cerrar 50% @ $${midPoint.toFixed(4)}`,
            urgency: 'medium'
        });

        return alerts;
    }

    analyzeRisk(signal, instrument, positionSize) {
        const analysis = {
            instrumentRisk: this.getInstrumentRisk(instrument),
            leverageRisk: this.getLeverageRisk(instrument.leverage),
            positionRisk: this.getPositionRisk(positionSize),
            marketRisk: this.getMarketRisk(signal.symbol),
            overallRisk: 'medium'
        };

        // Calcular riesgo general
        const riskScore = (
            analysis.instrumentRisk.score + 
            analysis.leverageRisk.score + 
            analysis.positionRisk.score + 
            analysis.marketRisk.score
        ) / 4;

        if (riskScore > 7) analysis.overallRisk = 'high';
        else if (riskScore < 4) analysis.overallRisk = 'low';

        analysis.score = riskScore;
        analysis.recommendations = this.generateRiskRecommendations(analysis);

        return analysis;
    }

    getInstrumentRisk(instrument) {
        const riskLevels = {
            'forex': { score: 4, description: 'Riesgo medio - Mercado líquido' },
            'crypto': { score: 8, description: 'Riesgo alto - Alta volatilidad' },
            'stock': { score: 5, description: 'Riesgo medio-alto - Depende de empresa' },
            'metal': { score: 3, description: 'Riesgo bajo-medio - Refugio de valor' },
            'commodity': { score: 6, description: 'Riesgo medio-alto - Volatilidad por supply/demand' }
        };

        return riskLevels[instrument.type] || { score: 5, description: 'Riesgo desconocido' };
    }

    getLeverageRisk(leverage) {
        if (leverage >= 20) return { score: 8, description: 'Leverage muy alto - Riesgo extremo' };
        if (leverage >= 10) return { score: 6, description: 'Leverage alto - Riesgo elevado' };
        if (leverage >= 5) return { score: 4, description: 'Leverage medio - Riesgo moderado' };
        return { score: 2, description: 'Leverage bajo - Riesgo controlado' };
    }

    getPositionRisk(positionSize) {
        const portfolioPercent = (positionSize / this.virtualPortfolio.balance) * 100;
        
        if (portfolioPercent > 50) return { score: 9, description: 'Posición muy grande - Riesgo extremo' };
        if (portfolioPercent > 25) return { score: 7, description: 'Posición grande - Riesgo alto' };
        if (portfolioPercent > 10) return { score: 5, description: 'Posición media - Riesgo moderado' };
        return { score: 3, description: 'Posición pequeña - Riesgo bajo' };
    }

    getMarketRisk(symbol) {
        // Análisis simplificado de riesgo de mercado
        const volatileSymbols = ['BTCUSD', 'ETHUSD', 'TSLA', 'XAUUSD'];
        const stableSymbols = ['EURUSD', 'USDJPY', 'AAPL', 'MSFT'];

        if (volatileSymbols.includes(symbol)) {
            return { score: 7, description: 'Mercado volátil - Movimientos grandes esperados' };
        } else if (stableSymbols.includes(symbol)) {
            return { score: 3, description: 'Mercado estable - Movimientos predecibles' };
        }

        return { score: 5, description: 'Mercado normal - Volatilidad media' };
    }

    generateRiskRecommendations(analysis) {
        const recommendations = [];

        if (analysis.score > 7) {
            recommendations.push('🚨 ALTO RIESGO: Considerar reducir tamaño de posición');
            recommendations.push('⚠️ Usar stop loss muy ajustado');
            recommendations.push('📊 Monitorear constantemente');
        } else if (analysis.score < 4) {
            recommendations.push('✅ BAJO RIESGO: Posición segura');
            recommendations.push('📈 Considerar aumentar ligeramente el tamaño');
        } else {
            recommendations.push('📊 RIESGO MODERADO: Mantener plan original');
            recommendations.push('🎯 Seguir estrictamente stop loss y take profit');
        }

        if (analysis.leverageRisk.score > 6) {
            recommendations.push('⚠️ Leverage alto: Especial cuidado con el sizing');
        }

        return recommendations;
    }

    // Procesar señal de TradingView para Quantfury
    async processQuantfurySignal(signal) {
        try {
            console.log(`📱 Processing Quantfury signal: ${signal.symbol} ${signal.action}`);

            // Generar alerta específica para Quantfury
            const alert = this.generateQuantfuryAlert(signal);
            if (!alert) return;

            // Almacenar señal activa
            this.activeSignals.set(alert.id, alert);

            // Emitir alerta
            this.emit('quantfuryAlert', alert);

            // Generar notificación formateada para Telegram
            const notification = this.formatQuantfuryNotification(alert);
            this.emit('telegramNotification', notification);

            // Agregar a cola de alertas
            this.alertQueue.push(alert);

            console.log(`✅ Quantfury alert generated: ${alert.id}`);
            return alert;

        } catch (error) {
            console.error('❌ Error processing Quantfury signal:', error);
            throw error;
        }
    }

    formatQuantfuryNotification(alert) {
        let message = `🎯 **QUANTFURY ALERT**\\n\\n`;
        message += `📊 **${alert.instrument}** ${alert.action.toUpperCase()}\\n`;
        message += `💰 Precio: $${alert.price.toFixed(4)}\\n`;
        message += `🎯 TP: $${alert.takeProfit.toFixed(4)}\\n`;
        message += `🛑 SL: $${alert.stopLoss.toFixed(4)}\\n`;
        message += `📈 Leverage: ${alert.leverage}x\\n`;
        message += `💸 Tamaño: $${alert.positionSize.toFixed(2)}\\n\\n`;
        
        message += `**INSTRUCCIONES:**\\n`;
        alert.instructions.entry.forEach(instruction => {
            message += `• ${instruction}\\n`;
        });

        message += `\\n**GESTIÓN DE RIESGO:**\\n`;
        alert.instructions.riskManagement.forEach(instruction => {
            message += `• ${instruction}\\n`;
        });

        message += `\\n🚨 **Riesgo General: ${alert.riskAnalysis.overallRisk.toUpperCase()}**\\n`;
        
        if (alert.riskAnalysis.score > 7) {
            message += `⚠️ **ATENCIÓN**: Riesgo elevado\\!`;
        }

        return {
            text: message,
            parse_mode: 'MarkdownV2',
            alert_id: alert.id
        };
    }

    // Simulación de ejecución para tracking
    simulateExecution(alertId, executionPrice, executionTime = Date.now()) {
        const alert = this.activeSignals.get(alertId);
        if (!alert) {
            console.error(`❌ Alert ${alertId} not found`);
            return null;
        }

        const execution = {
            id: this.generateExecutionId(),
            alertId: alertId,
            symbol: alert.instrument,
            side: alert.action,
            entryPrice: executionPrice,
            positionSize: alert.positionSize,
            leverage: alert.leverage,
            stopLoss: alert.stopLoss,
            takeProfit: alert.takeProfit,
            timestamp: executionTime,
            status: 'open',
            unrealizedPnL: 0
        };

        // Agregar a portfolio virtual
        this.virtualPortfolio.positions.set(execution.id, execution);
        this.executedTrades.push(execution);

        console.log(`✅ Simulated execution: ${execution.id}`);
        this.emit('executionSimulated', execution);

        return execution;
    }

    // Cerrar posición simulada
    closePosition(executionId, closePrice, reason = 'manual') {
        const position = this.virtualPortfolio.positions.get(executionId);
        if (!position) {
            console.error(`❌ Position ${executionId} not found`);
            return null;
        }

        // Calcular PnL
        const priceDiff = position.side === 'long' 
            ? closePrice - position.entryPrice
            : position.entryPrice - closePrice;
        
        const pnl = priceDiff * position.positionSize;
        const pnlPercent = (priceDiff / position.entryPrice) * 100;

        // Actualizar posición
        position.status = 'closed';
        position.closePrice = closePrice;
        position.closeTime = Date.now();
        position.realizedPnL = pnl;
        position.pnlPercent = pnlPercent;
        position.closeReason = reason;

        // Actualizar portfolio
        this.virtualPortfolio.realizedPnL += pnl;
        this.virtualPortfolio.balance += pnl;
        this.virtualPortfolio.positions.delete(executionId);

        console.log(`💰 Position closed: ${executionId} PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
        this.emit('positionClosed', position);

        return position;
    }

    // Obtener rendimiento del sistema
    getPerformanceStats() {
        const closedTrades = this.executedTrades.filter(t => t.status === 'closed');
        const winningTrades = closedTrades.filter(t => t.realizedPnL > 0);
        
        const stats = {
            totalTrades: closedTrades.length,
            winningTrades: winningTrades.length,
            losingTrades: closedTrades.length - winningTrades.length,
            winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
            totalPnL: this.virtualPortfolio.realizedPnL,
            totalReturn: ((this.virtualPortfolio.balance - this.config.initialBalance) / this.config.initialBalance) * 100,
            openPositions: this.virtualPortfolio.positions.size,
            averageWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0) / winningTrades.length : 0,
            averageLoss: (closedTrades.length - winningTrades.length) > 0 ? 
                closedTrades.filter(t => t.realizedPnL < 0).reduce((sum, t) => sum + t.realizedPnL, 0) / (closedTrades.length - winningTrades.length) : 0
        };

        stats.profitFactor = stats.averageLoss !== 0 ? Math.abs(stats.averageWin / stats.averageLoss) : 0;

        return stats;
    }

    // Utilidades
    generateAlertId() {
        return `qf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    getActiveAlerts() {
        return Array.from(this.activeSignals.values());
    }

    getRecentAlerts(limit = 10) {
        return this.alertQueue.slice(-limit);
    }
}

module.exports = QuantfuryManager;