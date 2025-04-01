/**
 * Web3DNA Fingerprinting SDK
 * Version: 1.0.0
 * 
 * A sophisticated digital fingerprinting solution for Web3 platforms
 * to prevent fraud and securely identify users while preserving privacy.
 * 
 * Part of the Unmask Protocol security toolkit
 */

(function (global) {
  // ========== UTILITY ==========
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hmacSha256(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function safeGet(fn, fallback = 'unavailable') {
    try { return fn(); } catch { return fallback; }
  }

  // ========== SIGNAL COLLECTORS ==========
  function getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'webgl_unsupported';
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      return `${vendor}|${renderer}`;
    } catch (e) {
      return 'webgl_error';
    }
  }

  async function getAudioFingerprint() {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const processor = context.createScriptProcessor(4096, 1, 1);

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, context.currentTime);
      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      oscillator.start(0);
      return await new Promise((resolve) => {
        processor.onaudioprocess = function (event) {
          const out = event.inputBuffer.getChannelData(0).slice(0, 50);
          oscillator.stop();
          processor.disconnect();
          gain.disconnect();
          context.close();
          resolve(sha256(out.toString()));
        };
      });
    } catch (e) {
      return 'audio_error';
    }
  }

  function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = "16px Arial";
      ctx.fillText('Web3DNA-Test', 2, 2);
      return canvas.toDataURL();
    } catch (e) {
      return 'canvas_error';
    }
  }

  async function checkIPRiskNoKey() {
    try {
      const res = await fetch('https://ip-api.io/json');
      const data = await res.json();
      const asn = (data.asn || '').toLowerCase();
      const suspiciousProviders = ["digitalocean", "ovh", "contabo", "linode", "hetzner", "vultr", "cloudflare", "amazon", "azure", "google"];
      const match = suspiciousProviders.some(name => asn.includes(name));
      const suspicious = !!data.proxy || match;
      return {
        ip: data.ip,
        country: data.country,
        isp: data.connection?.isp || 'unknown',
        proxy: data.proxy || false,
        asn: data.asn || '',
        suspicious,
        tag: suspicious ? '⚠️ Suspicious (Possible VPN/Proxy)' : '🛡️ Safe'
      };
    } catch (e) {
      return {
        ip: 'unavailable',
        proxy: false,
        suspicious: false,
        tag: '❓ Unknown (API Failed)'
      };
    }
  }

  async function collectDeviceFingerprint(verbose = false) {
    const signals = {
      userAgent: safeGet(() => navigator.userAgent),
      language: safeGet(() => navigator.language),
      platform: safeGet(() => navigator.platform),
      screen: `${screen.width}x${screen.height}`,
      pixelRatio: safeGet(() => window.devicePixelRatio),
      timezone: safeGet(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      doNotTrack: safeGet(() => navigator.doNotTrack),
      plugins: safeGet(() => Array.from(navigator.plugins).map(p => p.name).join(',')),
      webgl: getWebGLFingerprint(),
      canvas: getCanvasFingerprint(),
      audio: await getAudioFingerprint(),
      ipinfo: await checkIPRiskNoKey()
    };

    const raw = Object.values(signals).join('|');
    const fingerprint = await sha256(raw);

    if (verbose) {
      console.table(signals);
      console.log('Web3DNA Fingerprint:', fingerprint);
      console.log('IP Risk Tag:', signals.ipinfo.tag);
    }

    return { fingerprint, rawSignals: signals };
  }

  // ========== IDENTITY + DNA ==========
  async function generateIdentitySignature({ name, dob, selfieVector, idNumber }) {
    const input = `${name}|${dob}|${selfieVector}|${idNumber}`;
    return { identityHash: await sha256(input) };
  }

  async function generateWeb3DNA(identityHash, deviceHash, secret = '', useHmac = false) {
    const combo = `${identityHash}|${deviceHash}|${secret}`;
    return useHmac ? await hmacSha256(secret, combo) : await sha256(combo);
  }

  // ========== EXPORT ==========
  global.Web3DNA = {
    collectDeviceFingerprint,
    generateIdentitySignature,
    generateWeb3DNA,
    checkIPRiskNoKey
  };
})(typeof window !== 'undefined' ? window : global);