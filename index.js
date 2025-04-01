/**
 * Web3DNA SDK Server-Side Integration Module
 * This module provides functions for integrating Web3DNA into Express applications
 */

const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * Sets up Web3DNA integration in an Express app
 * @param {Object} app - Express application
 * @param {Object} server - HTTP server instance
 * @param {Object} options - Configuration options
 * @returns {Object} Web3DNA utility functions
 */
function setupWeb3DNA(app, server, options = {}) {
  // Default options
  const config = {
    mattermostWebhookUrl: process.env.MATTERMOST_WEBHOOK_URL || options.mattermostWebhookUrl,
    adminWebhookUrl: process.env.ADMIN_WEBHOOK_URL || options.adminWebhookUrl,
    storage: options.storage || null
  };

  // Set up WebSocket server for real-time alerts
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/dna-alerts'
  });

  // Serve the client-side SDK script
  app.get('/sdk/web3dna.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'web3dna.sdk.js'));
  });

  // In-memory fraud signatures storage (if no storage provided)
  const fraudSignatures = [
    // Example initial signatures - replace with real database in production
    { 
      fraud_id: 'fraud-001', 
      dna_hash: '7b5e11e2ade1a8b5ba87245b7bc7c01c5c818133cb363e8e6e631f76fd5fd91d', 
      tags: ['rugpull', 'vpn'], 
      source: 'RugHunter AI',
      added_at: new Date()
    }
  ];

  // Send alert to Mattermost
  async function sendMattermostAlert(data) {
    if (!config.mattermostWebhookUrl) return;
    
    try {
      // Format the message for Mattermost
      const { severity, wallet, risk_score, platform, matched_tags, dna_hash } = data;
      
      // Create emoji based on severity
      const severityEmoji = severity === 'critical' ? '🚨' : severity === 'moderate' ? '⚠️' : '📊';
      
      // Format message
      const message = {
        text: `${severityEmoji} **Web3DNA Alert** ${severityEmoji}`,
        attachments: [
          {
            color: severity === 'critical' ? '#FF0000' : severity === 'moderate' ? '#FFA500' : '#0000FF',
            fields: [
              { short: true, title: "Risk Score", value: `${risk_score}/100` },
              { short: true, title: "Severity", value: severity.toUpperCase() },
              { short: true, title: "Wallet", value: wallet || 'N/A' },
              { short: true, title: "Platform", value: platform || 'Unknown' },
              { short: false, title: "Tags", value: matched_tags.length ? matched_tags.join(', ') : 'None' },
              { short: false, title: "DNA Hash", value: `\`${dna_hash}\`` }
            ],
            footer: "Unmask Protocol Web3DNA",
            footer_icon: "https://unmaskprotocol.com/logo.png",
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };
      
      // Send to Mattermost
      await axios.post(config.mattermostWebhookUrl, message);
      console.log('✅ Alert sent to Mattermost');
    } catch (error) {
      console.error('❌ Error sending alert to Mattermost:', error.message);
    }
  }

  // Send alert to admin panel webhook
  async function sendAdminWebhookAlert(data) {
    if (!config.adminWebhookUrl) return;
    
    try {
      await axios.post(config.adminWebhookUrl, {
        event: 'FRAUD_MATCH',
        ...data
      });
      console.log('✅ Alert sent to admin webhook');
    } catch (error) {
      console.error('❌ Error sending alert to admin webhook:', error.message);
    }
  }

  // WebSocket alert broadcast
  function broadcastAlert(data) {
    // 1. WebSocket broadcast to connected admin panels
    const payload = JSON.stringify({ event: 'FRAUD_MATCH', ...data });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
    
    // 2. Send to Mattermost channel
    sendMattermostAlert(data);
    
    // 3. Send to admin webhook if configured
    sendAdminWebhookAlert(data);
  }

  // WebSocket handshake route
  wss.on('connection', (ws) => {
    console.log('🔌 Admin panel connected to /ws/dna-alerts');
  });

  // Return public methods and properties
  return {
    sendAlert: broadcastAlert,
    sendMattermostAlert,
    sendAdminWebhookAlert,
    addFraudSignature: (signature) => {
      // Add fraud signature to the in-memory store or database
      fraudSignatures.push({
        ...signature,
        fraud_id: signature.fraud_id || `fraud-${uuidv4().slice(0, 8)}`,
        added_at: new Date()
      });
    },
    getWebSocketServer: () => wss,
    getFraudSignatures: () => [...fraudSignatures]
  };
}

module.exports = setupWeb3DNA;