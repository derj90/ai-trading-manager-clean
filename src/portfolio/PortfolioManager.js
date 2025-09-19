const EventEmitter = require('events');
const moment = require('moment');

class PortfolioManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.initialCapital = config.initialCapital || 10000;
        this.currentCapital = this.initialCapital;
        this.positions = new Map();
        this.closedTrades = [];
        
        // Risk Management
        this.maxRiskPerTrade = config.maxRiskPerTrade || 0.02; // 2%
        this.maxPortfolioRisk = config.maxPortfolioRisk || 0.10; // 10%
        this.maxOpenPositions = config.maxOpenPositions || 5;
        this.correlationThreshold = config.correlationThreshold || 0.7;
        
        // Performance tracking
        this.dailyPnL = [];
        this.lastUpdate = moment();
        
        this.initializeTracking();
    }

    initializeTracking() {
        // Track daily P&L
        setInterval(() => {
            this.updateDailyPnL();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    // Position Management
    canOpenPosition(symbol, strategy, currentPrice) {
        const checks = {
            maxPositions: this.positions.size < this.maxOpenPositions,
            correlation: this.checkCorrelationLimit(symbol),
            riskBudget: this.checkRiskBudget(strategy, currentPrice),
            capital: this.getAvailableCapital() > 0
        };

        const canOpen = Object.values(checks).every(check => check);
        
        if (!canOpen) {
            this.emit('positionRejected', { symbol, strategy, checks });
        }
        
        return canOpen;
    }

    openPosition(signal) {
        if (!this.canOpenPosition(signal.symbol, signal.strategy, signal.price)) {
            return false;
        }

        const positionSize = this.calculatePositionSize(signal);
        const position = {
            id: this.generatePositionId(),
            symbol: signal.symbol,
            strategy: signal.strategy,
            side: signal.side, // 'long' or 'short'
            entryPrice: signal.price,
            size: positionSize,
            timestamp: moment(),
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            status: 'open',
            unrealizedPnL: 0,
            maxDrawdown: 0,
            maxProfit: 0
        };

        this.positions.set(position.id, position);
        this.currentCapital -= positionSize * signal.price;

        this.emit('positionOpened', position);
        return position;
    }

    closePosition(positionId, closePrice, reason = 'manual') {
        const position = this.positions.get(positionId);
        if (!position) return false;

        const pnl = this.calculatePnL(position, closePrice);
        const trade = {
            ...position,
            closePrice,
            closeTimestamp: moment(),
            realizedPnL: pnl,
            reason,
            duration: moment().diff(position.timestamp, 'hours'),
            status: 'closed'
        };

        this.closedTrades.push(trade);
        this.positions.delete(positionId);
        this.currentCapital += (position.size * closePrice);

        this.emit('positionClosed', trade);
        return trade;
    }

    // Risk Management
    calculatePositionSize(signal) {
        const riskAmount = this.currentCapital * this.maxRiskPerTrade;
        const stopDistance = Math.abs(signal.price - signal.stopLoss) / signal.price;
        
        // Position size based on risk and stop distance
        let positionValue = riskAmount / stopDistance;
        
        // Don't exceed available capital
        const maxPositionValue = this.getAvailableCapital() * 0.8;
        positionValue = Math.min(positionValue, maxPositionValue);
        
        return positionValue / signal.price; // Return size in units
    }

    checkRiskBudget(strategy, currentPrice) {
        const currentRisk = this.getCurrentPortfolioRisk();
        const newTradeRisk = this.maxRiskPerTrade;
        
        return (currentRisk + newTradeRisk) <= this.maxPortfolioRisk;
    }

    checkCorrelationLimit(symbol) {
        // Simplified correlation check - in production use real correlation data
        const correlatedSymbols = this.getCorrelatedSymbols(symbol);
        const correlatedPositions = Array.from(this.positions.values())
            .filter(pos => correlatedSymbols.includes(pos.symbol));
        
        return correlatedPositions.length < 2; // Max 2 correlated positions
    }

    getCorrelatedSymbols(symbol) {
        // Simplified - in production use actual correlation matrix
        const correlationGroups = {
            'BTC': ['ETH', 'LTC', 'BCH'],
            'ETH': ['BTC', 'ADA', 'DOT'],
            'ADA': ['ETH', 'DOT', 'SOL'],
            'DOT': ['ETH', 'ADA', 'LINK']
        };
        
        const baseSymbol = symbol.replace('/USDT', '').replace('/USD', '');
        return correlationGroups[baseSymbol] || [];
    }

    // Performance Analytics
    updatePositions(marketData) {
        for (const [id, position] of this.positions) {
            const currentPrice = marketData[position.symbol];
            if (!currentPrice) continue;

            const unrealizedPnL = this.calculatePnL(position, currentPrice);
            const pnlPercent = unrealizedPnL / (position.size * position.entryPrice);

            // Update position metrics
            position.unrealizedPnL = unrealizedPnL;
            position.maxProfit = Math.max(position.maxProfit, pnlPercent);
            position.maxDrawdown = Math.min(position.maxDrawdown, pnlPercent);

            // Check stop loss / take profit
            this.checkExitConditions(id, position, currentPrice);
        }

        this.emit('positionsUpdated', this.getPortfolioSummary());
    }

    checkExitConditions(positionId, position, currentPrice) {
        let shouldClose = false;
        let reason = '';

        if (position.side === 'long') {
            if (currentPrice <= position.stopLoss) {
                shouldClose = true;
                reason = 'stop_loss';
            } else if (currentPrice >= position.takeProfit) {
                shouldClose = true;
                reason = 'take_profit';
            }
        } else { // short
            if (currentPrice >= position.stopLoss) {
                shouldClose = true;
                reason = 'stop_loss';
            } else if (currentPrice <= position.takeProfit) {
                shouldClose = true;
                reason = 'take_profit';
            }
        }

        if (shouldClose) {
            this.closePosition(positionId, currentPrice, reason);
        }
    }

    calculatePnL(position, currentPrice) {
        const priceDiff = position.side === 'long' 
            ? currentPrice - position.entryPrice
            : position.entryPrice - currentPrice;
        
        return position.size * priceDiff;
    }

    // Portfolio Analytics
    getPortfolioSummary() {
        const totalValue = this.getTotalPortfolioValue();
        const openPositionsValue = this.getOpenPositionsValue();
        const unrealizedPnL = this.getTotalUnrealizedPnL();
        
        return {
            initialCapital: this.initialCapital,
            currentCapital: this.currentCapital,
            totalValue,
            openPositionsValue,
            availableCapital: this.getAvailableCapital(),
            unrealizedPnL,
            totalReturn: (totalValue - this.initialCapital) / this.initialCapital,
            openPositions: this.positions.size,
            totalTrades: this.closedTrades.length,
            winRate: this.getWinRate(),
            profitFactor: this.getProfitFactor(),
            maxDrawdown: this.getMaxDrawdown(),
            sharpeRatio: this.getSharpeRatio()
        };
    }

    getTotalPortfolioValue() {
        return this.currentCapital + this.getOpenPositionsValue();
    }

    getOpenPositionsValue() {
        return Array.from(this.positions.values())
            .reduce((total, pos) => total + (pos.size * pos.entryPrice), 0);
    }

    getTotalUnrealizedPnL() {
        return Array.from(this.positions.values())
            .reduce((total, pos) => total + pos.unrealizedPnL, 0);
    }

    getAvailableCapital() {
        return this.currentCapital;
    }

    getCurrentPortfolioRisk() {
        return Array.from(this.positions.values())
            .reduce((risk, pos) => {
                const positionRisk = Math.abs(pos.entryPrice - pos.stopLoss) / pos.entryPrice;
                return risk + positionRisk;
            }, 0);
    }

    // Performance Metrics
    getWinRate() {
        if (this.closedTrades.length === 0) return 0;
        const wins = this.closedTrades.filter(trade => trade.realizedPnL > 0).length;
        return wins / this.closedTrades.length;
    }

    getProfitFactor() {
        const wins = this.closedTrades.filter(t => t.realizedPnL > 0);
        const losses = this.closedTrades.filter(t => t.realizedPnL < 0);
        
        const totalWins = wins.reduce((sum, t) => sum + t.realizedPnL, 0);
        const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnL, 0));
        
        return totalLosses === 0 ? totalWins : totalWins / totalLosses;
    }

    getMaxDrawdown() {
        // Simplified max drawdown calculation
        let peak = this.initialCapital;
        let maxDD = 0;
        
        for (const trade of this.closedTrades) {
            const currentValue = this.initialCapital + 
                this.closedTrades.slice(0, this.closedTrades.indexOf(trade) + 1)
                    .reduce((sum, t) => sum + t.realizedPnL, 0);
            
            if (currentValue > peak) peak = currentValue;
            const drawdown = (peak - currentValue) / peak;
            if (drawdown > maxDD) maxDD = drawdown;
        }
        
        return maxDD;
    }

    getSharpeRatio() {
        if (this.dailyPnL.length < 2) return 0;
        
        const returns = this.dailyPnL.map(pnl => pnl / this.initialCapital);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const stdDev = Math.sqrt(
            returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        );
        
        return stdDev === 0 ? 0 : (avgReturn * Math.sqrt(252)) / (stdDev * Math.sqrt(252)); // Annualized
    }

    updateDailyPnL() {
        const currentValue = this.getTotalPortfolioValue();
        const previousValue = this.dailyPnL.length > 0 
            ? this.initialCapital + this.dailyPnL.reduce((sum, pnl) => sum + pnl, 0)
            : this.initialCapital;
        
        const dailyPnL = currentValue - previousValue;
        this.dailyPnL.push(dailyPnL);
        
        // Keep only last 252 days (1 year)
        if (this.dailyPnL.length > 252) {
            this.dailyPnL.shift();
        }
    }

    // Utilities
    generatePositionId() {
        return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Rebalancing
    rebalancePortfolio() {
        const summary = this.getPortfolioSummary();
        
        // Close underperforming positions
        for (const [id, position] of this.positions) {
            const pnlPercent = position.unrealizedPnL / (position.size * position.entryPrice);
            
            // Close if loss > 15% or if position is underperforming significantly
            if (pnlPercent < -0.15) {
                this.closePosition(id, position.entryPrice * (1 + pnlPercent), 'rebalance_loss');
            }
            
            // Take partial profits on big winners
            if (pnlPercent > 0.25) {
                this.emit('partialProfitSuggestion', { position, currentPnL: pnlPercent });
            }
        }
        
        this.emit('portfolioRebalanced', summary);
    }
}

module.exports = PortfolioManager;