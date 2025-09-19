require('dotenv').config();
const TradingManager = require('./TradingManager');
const TradingTelegramBot = require('./telegram/TelegramBot');

class AITradingSystem {
    constructor() {
        this.config = this.loadConfiguration();
        this.tradingManager = null;
        this.telegramBot = null;
        this.isRunning = false;
        
        // Premium integrations
        this.premiumIntegrations = {
            zeroMkt: null,
            antigeneric: null,
            wordpress: null
        };
    }

    loadConfiguration() {
        return {
            // TradingView Configuration
            webhook: {
                port: process.env.TRADINGVIEW_WEBHOOK_PORT || 3000,
                webhookSecret: process.env.TRADINGVIEW_WEBHOOK_SECRET,
                allowedIPs: process.env.TRADINGVIEW_ALLOWED_IPS?.split(',') || [],
                signalTTL: 60000 // 1 minute
            },
            
            // Portfolio Configuration
            portfolio: {
                initialCapital: parseFloat(process.env.INITIAL_CAPITAL) || 10000,
                maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE) || 0.02,
                maxPortfolioRisk: parseFloat(process.env.MAX_PORTFOLIO_RISK) || 0.10,
                maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS) || 5,
                correlationThreshold: 0.7
            },
            
            // Trading Configuration
            trading: {
                paperTrading: process.env.PAPER_TRADING === 'true',
                exchanges: {
                    binance: {
                        apiKey: process.env.BINANCE_API_KEY,
                        secret: process.env.BINANCE_SECRET,
                        testnet: process.env.BINANCE_TESTNET === 'true'
                    },
                    bybit: {
                        apiKey: process.env.BYBIT_API_KEY,
                        secret: process.env.BYBIT_SECRET,
                        testnet: process.env.BYBIT_TESTNET === 'true'
                    }
                }
            },
            
            // Telegram Configuration
            telegram: {
                token: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID
            },
            
            // AI & Analysis
            ai: {
                openaiKey: process.env.OPENAI_API_KEY,
                newsApiKey: process.env.NEWS_API_KEY,
                chartImgKey: process.env.CHART_IMG_API_KEY
            },
            
            // Strategies Configuration
            strategies: [
                {
                    type: 'EMA_CROSSOVER',
                    enabled: true,
                    symbols: ['BTC/USDT', 'ETH/USDT', 'ADA/USDT', 'DOT/USDT'],
                    timeframes: ['4h', '1d'],
                    parameters: {
                        emaShort: 20,
                        emaLong: 50,
                        volumeThreshold: 1.5,
                        rsiConfirmation: true,
                        minRiskReward: 2.0
                    }
                }
            ]
        };
    }

    async initialize() {
        try {
            console.log('🚀 Initializing AI Trading System...');
            
            // Initialize Trading Manager
            this.tradingManager = new TradingManager(this.config);
            
            // Initialize Telegram Bot
            if (this.config.telegram.token) {
                this.telegramBot = new TradingTelegramBot(this.config.telegram);
                this.telegramBot.setTradingManager(this.tradingManager);
                console.log('📱 Telegram Bot initialized');
            }
            
            // Load premium integrations
            await this.loadPremiumIntegrations();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            console.log('✅ AI Trading System initialized successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize AI Trading System:', error);
            throw error;
        }
    }

    async loadPremiumIntegrations() {
        console.log('🔧 Loading premium integrations...');
        
        try {
            // Load Zero MKT Agents for landing page generation
            const zeroMktPath = '/Users/coordinacion/zero-mkt-agents';
            if (require('fs').existsSync(zeroMktPath)) {
                this.premiumIntegrations.zeroMkt = {
                    path: zeroMktPath,
                    available: true,
                    description: 'Landing page generation for trading services'
                };
                console.log('✅ Zero MKT Agents integration loaded');
            }
            
            // Load Antigeneric Agents for UI/UX optimization
            const antigenericPath = '/Users/coordinacion/antigeneric-agents';
            if (require('fs').existsSync(antigenericPath)) {
                this.premiumIntegrations.antigeneric = {
                    path: antigenericPath,
                    available: true,
                    description: 'Anti-generic UI/UX design for trading interfaces'
                };
                console.log('✅ Antigeneric Agents integration loaded');
            }
            
            // Load WordPress Agents for content management
            const wordpressPath = '/Users/coordinacion/instant-wordpress-agents';
            if (require('fs').existsSync(wordpressPath)) {
                this.premiumIntegrations.wordpress = {
                    path: wordpressPath,
                    available: true,
                    description: 'WordPress site generation for trading blog/education'
                };
                console.log('✅ WordPress Agents integration loaded');
            }
            
        } catch (error) {
            console.warn('⚠️ Some premium integrations failed to load:', error.message);
        }
    }

    setupEventHandlers() {
        // Trading Manager events
        this.tradingManager.on('started', () => {
            console.log('📈 Trading Manager started');
            this.isRunning = true;
        });

        this.tradingManager.on('stopped', () => {
            console.log('📉 Trading Manager stopped');
            this.isRunning = false;
        });

        this.tradingManager.on('positionOpened', (position) => {
            console.log(`🟢 New position: ${position.symbol} ${position.side} @ $${position.entryPrice}`);
        });

        this.tradingManager.on('positionClosed', (trade) => {
            const pnlEmoji = trade.realizedPnL > 0 ? '🟢' : '🔴';
            console.log(`${pnlEmoji} Position closed: ${trade.symbol} PnL: $${trade.realizedPnL.toFixed(2)}`);
        });

        this.tradingManager.on('signalQueued', (signal) => {
            console.log(`📡 Signal queued: ${signal.type} ${signal.symbol}`);
        });

        // Process termination handlers
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.gracefulShutdown('EXCEPTION');
        });
    }

    async start() {
        try {
            if (this.isRunning) {
                console.log('⚠️ System is already running');
                return;
            }

            console.log('🎯 Starting AI Trading System...');
            
            // Start trading manager
            await this.tradingManager.start();
            
            // Send startup notification
            if (this.telegramBot) {
                await this.telegramBot.sendMessage('🚀 AI Trading System started successfully!');
            }
            
            this.displayStartupInfo();
            
        } catch (error) {
            console.error('❌ Failed to start system:', error);
            throw error;
        }
    }

    async stop() {
        try {
            console.log('🛑 Stopping AI Trading System...');
            
            if (this.tradingManager) {
                await this.tradingManager.stop();
            }
            
            if (this.telegramBot) {
                await this.telegramBot.sendMessage('🛑 AI Trading System stopped');
            }
            
            this.isRunning = false;
            console.log('✅ System stopped successfully');
            
        } catch (error) {
            console.error('❌ Error stopping system:', error);
        }
    }

    async gracefulShutdown(signal) {
        console.log(`\\n🚨 Received ${signal}, shutting down gracefully...`);
        
        try {
            await this.stop();
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    displayStartupInfo() {
        console.log('\\n' + '='.repeat(60));
        console.log('🤖 AI TRADING MANAGER - SYSTEM STATUS');
        console.log('='.repeat(60));
        
        const status = this.tradingManager.getStatus();
        
        console.log(`📊 Trading Mode: ${status.paperTrading ? '📝 PAPER TRADING' : '💰 LIVE TRADING'}`);
        console.log(`🎯 Active Strategies: ${status.activeStrategies}`);
        console.log(`💼 Initial Capital: $${this.config.portfolio.initialCapital.toLocaleString()}`);
        console.log(`⚡ Max Risk per Trade: ${(this.config.portfolio.maxRiskPerTrade * 100).toFixed(1)}%`);
        console.log(`📍 Max Open Positions: ${this.config.portfolio.maxOpenPositions}`);
        
        console.log('\\n📡 WEBHOOK CONFIGURATION:');
        console.log(`🌐 Port: ${this.config.webhook.port}`);
        console.log(`🔐 Secret: ${this.config.webhook.webhookSecret ? '✅ Configured' : '❌ Not set'}`);
        console.log(`🛡️ IP Whitelist: ${this.config.webhook.allowedIPs.length} IPs`);
        
        console.log('\\n🔧 PREMIUM INTEGRATIONS:');
        Object.entries(this.premiumIntegrations).forEach(([name, integration]) => {
            const status = integration?.available ? '✅' : '❌';
            const description = integration?.description || 'Not available';
            console.log(`${status} ${name.toUpperCase()}: ${description}`);
        });
        
        console.log('\\n📱 TELEGRAM BOT:');
        if (this.telegramBot) {
            console.log('✅ Bot initialized and ready');
            console.log('📝 Available commands: /start, /status, /positions, /performance, /help');
        } else {
            console.log('❌ Bot not configured (missing TELEGRAM_BOT_TOKEN)');
        }
        
        console.log('\\n🎯 TRADINGVIEW WEBHOOK URL:');
        console.log(`📍 http://your-server:${this.config.webhook.port}/webhook`);
        console.log('\\n' + '='.repeat(60));
        console.log('🚀 System is ready for trading signals!');
        console.log('='.repeat(60) + '\\n');
    }

    // Premium integration methods
    async generateTradingLandingPage(config = {}) {
        if (!this.premiumIntegrations.zeroMkt?.available) {
            throw new Error('Zero MKT Agents not available');
        }
        
        console.log('🎨 Generating trading service landing page...');
        
        // This would integrate with the Zero MKT system
        const landingPageConfig = {
            title: config.title || 'AI Trading Manager Pro',
            description: config.description || 'Automated trading system with TradingView integration',
            features: [
                'TradingView Webhook Integration',
                'Real-time Portfolio Management',
                'Risk Management System',
                'Telegram Bot Control',
                'Multiple Strategy Support'
            ],
            pricing: config.pricing || {
                starter: { price: 97, features: ['Basic strategies', 'Paper trading', 'Telegram alerts'] },
                pro: { price: 197, features: ['All strategies', 'Live trading', 'Advanced analytics'] },
                enterprise: { price: 497, features: ['Custom strategies', 'Multi-exchange', 'Priority support'] }
            }
        };
        
        // Return config for Zero MKT integration
        return landingPageConfig;
    }

    async optimizeUserInterface() {
        if (!this.premiumIntegrations.antigeneric?.available) {
            throw new Error('Antigeneric Agents not available');
        }
        
        console.log('🎨 Optimizing UI/UX with anti-generic design...');
        
        // This would integrate with the Antigeneric system
        return {
            theme: 'trading-professional',
            components: ['portfolio-dashboard', 'position-cards', 'performance-charts'],
            optimizations: ['conversion-focused', 'accessibility-compliant', 'mobile-responsive']
        };
    }

    async createTradingBlog() {
        if (!this.premiumIntegrations.wordpress?.available) {
            throw new Error('WordPress Agents not available');
        }
        
        console.log('📝 Creating trading education blog...');
        
        // This would integrate with the WordPress system
        return {
            theme: 'trading-education',
            content: ['trading-strategies', 'market-analysis', 'system-tutorials'],
            plugins: ['analytics', 'seo-optimization', 'newsletter']
        };
    }

    // Status and monitoring
    getSystemStatus() {
        return {
            isRunning: this.isRunning,
            tradingManager: this.tradingManager?.getStatus(),
            premiumIntegrations: Object.entries(this.premiumIntegrations).reduce((acc, [name, integration]) => {
                acc[name] = {
                    available: integration?.available || false,
                    description: integration?.description || 'Not available'
                };
                return acc;
            }, {}),
            config: {
                paperTrading: this.config.trading.paperTrading,
                webhook: {
                    port: this.config.webhook.port,
                    hasSecret: !!this.config.webhook.webhookSecret
                }
            }
        };
    }

    // CLI commands for development
    async runCommand(command, args = []) {
        switch (command) {
            case 'start':
                await this.start();
                break;
            case 'stop':
                await this.stop();
                break;
            case 'status':
                console.log(JSON.stringify(this.getSystemStatus(), null, 2));
                break;
            case 'generate-landing':
                const landingConfig = await this.generateTradingLandingPage(args[0] || {});
                console.log('Landing page config:', landingConfig);
                break;
            case 'test-webhook':
                await this.testWebhook();
                break;
            default:
                console.log('Available commands: start, stop, status, generate-landing, test-webhook');
        }
    }

    async testWebhook() {
        console.log('🧪 Testing webhook with sample signal...');
        
        const sampleSignal = {
            symbol: 'BTC/USDT',
            action: 'buy',
            price: 45000,
            strategy: 'EMA_CROSSOVER_TEST',
            indicators: {
                rsi: 55,
                ema20: 44800,
                ema50: 44500
            }
        };
        
        if (this.tradingManager) {
            this.tradingManager.queueSignal({
                ...sampleSignal,
                type: 'buy',
                source: 'test'
            });
            console.log('✅ Test signal queued');
        }
    }
}

// Main execution
async function main() {
    const system = new AITradingSystem();
    
    try {
        await system.initialize();
        
        // Handle command line arguments
        const command = process.argv[2];
        if (command) {
            await system.runCommand(command, process.argv.slice(3));
        } else {
            // Default: start the system
            await system.start();
            
            // Keep the process running
            process.stdin.resume();
        }
        
    } catch (error) {
        console.error('❌ System error:', error);
        process.exit(1);
    }
}

// Export for testing
module.exports = AITradingSystem;

// Run if this is the main module
if (require.main === module) {
    main();
}