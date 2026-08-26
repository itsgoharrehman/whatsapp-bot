import { EventEmitter } from 'events';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  cyan: '\x1b[96m',
  magenta: '\x1b[95m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  red: '\x1b[91m',
  blue: '\x1b[94m'
};

function colorizeTags(text) {
  if (typeof text !== 'string') return text;
  let s = text;
  s = s.replace(/\[(PDF)\]/gi, `${C.bold}${C.cyan}[PDF]${C.reset}`);
  s = s.replace(/\[(PPT|PPTX)\]/gi, `${C.bold}${C.magenta}[$1]${C.reset}`);
  s = s.replace(/\[(STEP\s+\d+\/\d+)\]/gi, `${C.bold}${C.yellow}[$1]${C.reset}`);
  s = s.replace(/\[(SUCCESS|DELIVERED)\]/gi, `${C.bold}${C.green}[$1]${C.reset}`);
  s = s.replace(/\[(ERROR|FAILED)\]/gi, `${C.bold}${C.red}[$1]${C.reset}`);
  s = s.replace(/\[(WARN|COOLDOWN)\]/gi, `${C.bold}${C.yellow}[$1]${C.reset}`);
  s = s.replace(/\[(COMMAND)\]/gi, `${C.bold}${C.magenta}[COMMAND]${C.reset}`);
  s = s.replace(/\[(SYSTEM)\]/gi, `${C.bold}${C.blue}[SYSTEM]${C.reset}`);
  s = s.replace(/\[(SKILLS)\]/gi, `${C.bold}${C.cyan}[SKILLS]${C.reset}`);
  s = s.replace(/\[(INFO)\]/gi, `${C.gray}[INFO]${C.reset}`);

  // Highlight quoted titles in bright white
  s = s.replace(/"([^"]+)"/g, `"${C.bold}${C.white}$1${C.reset}"`);
  // Highlight themes in cyan
  s = s.replace(/\(([a-z_]+)\)/g, `(${C.cyan}$1${C.reset})`);
  // Highlight compiled in Xs in green
  s = s.replace(/(compiled in\s+[0-9.]+s)/gi, `${C.green}$1${C.reset}`);
  // Highlight sent artifacts
  s = s.replace(/(Sent\s+[a-zA-Z0-9_.]+\.pdf)/gi, `${C.green}$1${C.reset}`);
  s = s.replace(/(Sent\s+[a-zA-Z0-9_.]+\.pptx)/gi, `${C.magenta}$1${C.reset}`);

  return s;
}

class LiveLogger extends EventEmitter {
  constructor() {
    super();
    this.logsHistory = [];
    this.maxHistory = 50;
  }

  formatTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  log(level, message, details = null) {
    const rawTime = this.formatTime();
    const isTagged = message && typeof message === 'string' && message.startsWith('[');
    const plainFormatted = isTagged
      ? `[${rawTime}] ${message}`
      : `[${rawTime}] [${level.toUpperCase()}] ${message}`;

    const colorTime = `${C.gray}[${rawTime}]${C.reset}`;
    const coloredMessage = colorizeTags(message);
    const coloredFormatted = isTagged
      ? `${colorTime} ${coloredMessage}`
      : `${colorTime} [${level.toUpperCase()}] ${coloredMessage}`;

    if (level === 'error') {
      console.error(coloredFormatted, details || '');
    } else if (level === 'warn') {
      console.warn(coloredFormatted, details || '');
    } else {
      console.log(coloredFormatted, details || '');
    }

    const logEntry = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      level,
      message: plainFormatted,
      details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null
    };

    this.logsHistory.push(logEntry);
    if (this.logsHistory.length > this.maxHistory) {
      this.logsHistory.shift();
    }

    this.emit('log', logEntry);
  }

  info(msg, details) { this.log('info', msg, details); }
  warn(msg, details) { this.log('warn', msg, details); }
  error(msg, details) { this.log('error', msg, details); }
  success(msg, details) { this.log('success', msg, details); }
  getHistory() { return this.logsHistory; }
  clearHistory() {
    this.logsHistory = [];
    this.emit('cleared');
  }
}

export const logger = new LiveLogger();
