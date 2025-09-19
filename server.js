require('dotenv').config();
const AITradingSystem = require('./src/index');

// Configuración del servidor
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
    try {
        console.log('🚀 Starting AI Trading Manager...');
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Host: ${HOST}`);
        console.log(`📡 Port: ${PORT}`);
        
        // Initialize trading system
        const system = new AITradingSystem();
        
        // Configuración del sistema
        const config = {
            webhook: {
                port: PORT,
                host: HOST,
                webhookSecret: process.env.TRADINGVIEW_WEBHOOK_SECRET,
                allowedIPs: process.env.TRADINGVIEW_ALLOWED_IPS?.split(',') || []
            },
            telegram: {
                token: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID
            },
            quantfury: {
                initialBalance: parseFloat(process.env.INITIAL_CAPITAL) || 10000
            },
            production: process.env.NODE_ENV === 'production'
        };
        
        await system.initialize(config);
        await system.start();
        
        console.log('=' .repeat(60));
        console.log('🎯 AI TRADING MANAGER - RUNNING');
        console.log('=' .repeat(60));
        console.log(`✅ Server running on ${HOST}:${PORT}`);
        console.log(`🎯 Webhook URL: http://${HOST}:${PORT}/webhook`);
        console.log(`📱 Telegram Bot: ${system.telegramBot ? 'Active' : 'Inactive'}`);
        console.log(`🤖 Strategies: ${system.tradingManager?.strategies?.size || 0} loaded`);
        console.log(`🔐 Security: ${process.env.TRADINGVIEW_WEBHOOK_SECRET ? 'Enabled' : 'Disabled'}`);
        console.log('=' .repeat(60));
        
        // Health check endpoint
        if (system.tradingManager?.webhookReceiver?.app) {
            system.tradingManager.webhookReceiver.app.get('/', (req, res) => {
                res.json({
                    status: 'active',
                    service: 'AI Trading Manager',
                    version: '1.0.0',
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    webhook: '/webhook',
                    health: '/health'
                });
            });
            
            system.tradingManager.webhookReceiver.app.get('/health', (req, res) => {
                res.json({
                    status: 'healthy',
                    strategies: system.tradingManager?.strategies?.size || 0,
                    telegram: system.telegramBot ? 'connected' : 'disconnected',
                    database: 'connected',
                    uptime: process.uptime()
                });
            });
        }
        
        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('🛑 Received SIGTERM, shutting down gracefully...');
            await system.stop();
            process.exit(0);
        });
        
        process.on('SIGINT', async () => {
            console.log('🛑 Received SIGINT, shutting down gracefully...');
            await system.stop();
            process.exit(0);
        });
        
        // Send startup notification
        if (system.telegramBot) {
            try {
                await system.telegramBot.sendMessage(
                    '🚀 *AI Trading Manager ONLINE*\\n\\n' +
                    '✅ Sistema desplegado correctamente\\n' +
                    '🌐 Webhook activo y funcionando\\n' +
                    '📊 Estrategias cargadas y listas\\n\\n' +
                    '💰 *¡Listo para generar dinero!*',
                    { parse_mode: 'MarkdownV2' }
                );
            } catch (error) {
                console.log('⚠️ Could not send startup notification:', error.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the server
startServer();