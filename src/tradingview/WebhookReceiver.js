const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');

class TradingViewWebhookReceiver extends EventEmitter {
    constructor(config = {}) {
        super();
        this.port = config.port || 3000;
        this.webhookSecret = config.webhookSecret || process.env.TRADINGVIEW_WEBHOOK_SECRET;
        this.allowedIPs = config.allowedIPs || []; // TradingView IPs for security
        this.app = express();
        this.server = null;
        
        // Store recent signals to prevent duplicates
        this.recentSignals = new Map();
        this.signalTTL = config.signalTTL || 60000; // 1 minute
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Parse JSON with larger limit for TradingView data
        this.app.use(express.json({ limit: '1mb' }));
        
        // Security middleware
        this.app.use((req, res, next) => {
            // Log all webhook attempts
            console.log(`Webhook received from ${req.ip} at ${new Date().toISOString()}`);
            
            // IP whitelist (optional)
            if (this.allowedIPs.length > 0 && !this.allowedIPs.includes(req.ip)) {
                console.warn(`Rejected webhook from unauthorized IP: ${req.ip}`);
                return res.status(403).json({ error: 'Unauthorized IP' });
            }
            
            next();
        });

        // Signature verification middleware
        this.app.use('/webhook', (req, res, next) => {
            if (this.webhookSecret) {
                const signature = req.headers['x-tradingview-signature'];
                if (!this.verifySignature(req.body, signature)) {
                    console.warn('Invalid webhook signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }
            next();
        });
    }

    setupRoutes() {
        // Main webhook endpoint
        this.app.post('/webhook', (req, res) => {
            try {
                const signal = this.parseWebhookData(req.body);
                
                if (this.isDuplicateSignal(signal)) {
                    console.log('Duplicate signal ignored:', signal.id);
                    return res.status(200).json({ status: 'duplicate_ignored' });
                }
                
                this.processSignal(signal);
                res.status(200).json({ status: 'received', signalId: signal.id });
                
            } catch (error) {
                console.error('Webhook processing error:', error);
                res.status(400).json({ error: 'Invalid webhook data' });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'active', 
                timestamp: new Date().toISOString(),
                recentSignals: this.recentSignals.size
            });
        });

        // Signal history endpoint
        this.app.get('/signals/recent', (req, res) => {
            const signals = Array.from(this.recentSignals.values())
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 50);
            res.json(signals);
        });
    }

    parseWebhookData(data) {
        // Parse TradingView webhook JSON
        const signal = {
            id: this.generateSignalId(),
            timestamp: Date.now(),
            raw: data,
            ...this.extractSignalData(data)
        };

        return signal;
    }

    extractSignalData(data) {
        // Extract standardized signal data from TradingView webhook
        const extracted = {
            symbol: null,
            action: null, // 'buy', 'sell', 'close'
            price: null,
            strategy: null,
            timeframe: null,
            indicators: {},
            metadata: {}
        };

        // Handle different TradingView alert formats
        if (typeof data === 'string') {
            // Text-based alert
            extracted.symbol = this.extractSymbolFromText(data);
            extracted.action = this.extractActionFromText(data);
            extracted.price = this.extractPriceFromText(data);
            extracted.strategy = this.extractStrategyFromText(data);
        } else if (typeof data === 'object') {
            // JSON-based alert (recommended format)
            extracted.symbol = data.symbol || data.ticker;
            extracted.action = data.action || data.signal;
            extracted.price = parseFloat(data.price || data.close);
            extracted.strategy = data.strategy || data.indicator;
            extracted.timeframe = data.timeframe || data.interval;
            
            // Extract technical indicators
            extracted.indicators = {
                rsi: parseFloat(data.rsi),
                macd: parseFloat(data.macd),
                ema20: parseFloat(data.ema20),
                ema50: parseFloat(data.ema50),
                volume: parseFloat(data.volume),
                atr: parseFloat(data.atr)
            };

            // Stop loss and take profit levels
            extracted.stopLoss = parseFloat(data.stop_loss || data.sl);
            extracted.takeProfit = parseFloat(data.take_profit || data.tp);
            
            // Additional metadata
            extracted.metadata = {
                confidence: parseFloat(data.confidence),
                riskReward: parseFloat(data.risk_reward),
                trend: data.trend,
                support: parseFloat(data.support),
                resistance: parseFloat(data.resistance),
                exchange: data.exchange || 'BINANCE'
            };
        }

        return extracted;
    }

    // Text parsing helpers for basic TradingView alerts
    extractSymbolFromText(text) {
        const symbolMatch = text.match(/([A-Z]{2,10}USDT?)/i);
        return symbolMatch ? symbolMatch[1].toUpperCase() : null;
    }

    extractActionFromText(text) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('buy') || lowerText.includes('long')) return 'buy';
        if (lowerText.includes('sell') || lowerText.includes('short')) return 'sell';
        if (lowerText.includes('close') || lowerText.includes('exit')) return 'close';
        return null;
    }

    extractPriceFromText(text) {
        const priceMatch = text.match(/price[:\s]*(\d+\.?\d*)/i);
        return priceMatch ? parseFloat(priceMatch[1]) : null;
    }

    extractStrategyFromText(text) {
        const strategyPatterns = [
            /strategy[:\s]*([a-zA-Z_\d\s]+)/i,
            /indicator[:\s]*([a-zA-Z_\d\s]+)/i
        ];
        
        for (const pattern of strategyPatterns) {
            const match = text.match(pattern);
            if (match) return match[1].trim();
        }
        return 'TradingView Alert';
    }

    processSignal(signal) {
        // Store signal for duplicate detection
        this.recentSignals.set(signal.id, signal);
        
        // Clean old signals
        this.cleanOldSignals();
        
        // Validate signal
        if (!this.isValidSignal(signal)) {
            console.warn('Invalid signal received:', signal);
            this.emit('invalidSignal', signal);
            return;
        }

        // Emit signal based on action
        switch (signal.action) {
            case 'buy':
            case 'long':
                this.emit('buySignal', signal);
                break;
            case 'sell':
            case 'short':
                this.emit('sellSignal', signal);
                break;
            case 'close':
            case 'exit':
                this.emit('closeSignal', signal);
                break;
            default:
                this.emit('signal', signal);
        }

        console.log(`Processed ${signal.action} signal for ${signal.symbol}:`, signal);
    }

    isValidSignal(signal) {
        // Basic validation
        if (!signal.symbol || !signal.action) {
            return false;
        }

        // Symbol format validation
        if (!/^[A-Z]{2,10}(USDT?|BTC|ETH)$/i.test(signal.symbol)) {
            return false;
        }

        // Action validation
        if (!['buy', 'sell', 'close', 'long', 'short', 'exit'].includes(signal.action.toLowerCase())) {
            return false;
        }

        return true;
    }

    isDuplicateSignal(signal) {
        // Check for duplicate signals within TTL window
        for (const [id, existingSignal] of this.recentSignals) {
            if (existingSignal.symbol === signal.symbol && 
                existingSignal.action === signal.action &&
                (signal.timestamp - existingSignal.timestamp) < this.signalTTL) {
                return true;
            }
        }
        return false;
    }

    cleanOldSignals() {
        const now = Date.now();
        for (const [id, signal] of this.recentSignals) {
            if ((now - signal.timestamp) > this.signalTTL * 10) { // Keep for 10x TTL
                this.recentSignals.delete(id);
            }
        }
    }

    verifySignature(payload, signature) {
        if (!this.webhookSecret || !signature) return true; // Skip if no secret
        
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
            
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    generateSignalId() {
        return `tv_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`TradingView Webhook receiver started on port ${this.port}`);
                    resolve(this.port);
                }
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('TradingView Webhook receiver stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // Configuration methods
    setWebhookSecret(secret) {
        this.webhookSecret = secret;
    }

    addAllowedIP(ip) {
        if (!this.allowedIPs.includes(ip)) {
            this.allowedIPs.push(ip);
        }
    }

    getStats() {
        return {
            port: this.port,
            recentSignalsCount: this.recentSignals.size,
            allowedIPs: this.allowedIPs.length,
            hasSecret: !!this.webhookSecret
        };
    }
}

module.exports = TradingViewWebhookReceiver;