const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const { getSetting } = require('../utils/settings');
const tmdbService = require('./tmdbService');
const libraryService = require('./libraryService');

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.chatId = null;
  }

  init() {
    const token = getSetting('telegramBotToken');
    const chatId = getSetting('telegramChatId');

    if (!token || !chatId) {
      console.log('[TelegramBot] Not initialized: Token or Chat ID is missing.');
      return;
    }

    this.chatId = String(chatId);
    this.bot = new TelegramBot(token, { polling: true });

    console.log('[TelegramBot] Initialized interactive bot.');

    this.bot.onText(/\/(start|help)/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/(request|search) (.+)/, (msg, match) => this.handleSearch(msg, match[2]));
    
    // Also listen to normal text messages that aren't commands
    this.bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        this.handleSearch(msg, msg.text);
      }
    });

    this.bot.on('callback_query', (callbackQuery) => this.handleCallbackQuery(callbackQuery));
    
    this.bot.on('polling_error', (error) => {
      console.error(`[TelegramBot] Polling error: ${error.code} - ${error.message}`);
    });
  }

  isAllowed(msg) {
    return String(msg.chat.id) === this.chatId;
  }

  handleStart(msg) {
    if (!this.isAllowed(msg)) return;
    this.bot.sendMessage(msg.chat.id, "Welcome to Atlas! Send me the name of a movie or TV show, and I'll find it for you.");
  }

  async handleSearch(msg, query) {
    if (!this.isAllowed(msg)) return;
    if (!query || query.trim().length === 0) return;

    this.bot.sendMessage(msg.chat.id, `🔍 Searching for "${query}"...`);

    try {
      const results = await tmdbService.searchMulti(query);
      
      if (!results || results.length === 0) {
        this.bot.sendMessage(msg.chat.id, `❌ No results found for "${query}".`);
        return;
      }

      // Just take the top 3 results to not spam the chat
      const topResults = results.slice(0, 3);

      for (const item of topResults) {
        const type = item.media_type === 'movie' ? 'Movie' : 'TV Show';
        const year = (item.release_date || item.first_air_date || '').split('-')[0] || 'Unknown';
        const title = item.title || item.name;
        
        let text = `*${title}* (${year})\n${type} ⭐️ ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}\n\n`;
        text += item.overview ? `${item.overview.substring(0, 200)}...` : 'No overview available.';

        const keyboard = {
          inline_keyboard: [[
            {
              text: `📥 Request ${type}`,
              callback_data: `req:${item.media_type}:${item.id}`
            }
          ]]
        };

        const opts = { parse_mode: 'Markdown', reply_markup: JSON.stringify(keyboard) };

        if (item.poster_path) {
          const posterUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
          await this.bot.sendPhoto(msg.chat.id, posterUrl, { ...opts, caption: text });
        } else {
          await this.bot.sendMessage(msg.chat.id, text, opts);
        }
      }
    } catch (err) {
      console.error('[TelegramBot] Search error:', err.message);
      this.bot.sendMessage(msg.chat.id, `❌ An error occurred while searching.`);
    }
  }

  async handleCallbackQuery(callbackQuery) {
    const msg = callbackQuery.message;
    if (!this.isAllowed(msg)) {
      this.bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    const data = callbackQuery.data;
    if (data.startsWith('req:')) {
      const parts = data.split(':');
      const type = parts[1]; // movie or tv
      const tmdbId = parts[2];

      try {
        if (type === 'movie') {
          await libraryService.addMovie(tmdbId);
        } else {
          await libraryService.addShow(tmdbId);
        }

        // Edit the message to remove the button and confirm
        const newCaption = `${msg.caption || msg.text}\n\n✅ *Successfully requested!*`;
        
        if (msg.photo) {
          this.bot.editMessageCaption(newCaption, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        } else {
          this.bot.editMessageText(newCaption, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        }

        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Request added to library!' });
      } catch (err) {
        console.error('[TelegramBot] Request error:', err.message);
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Failed to add request. It might already exist.', show_alert: true });
      }
    }
  }
}

module.exports = new TelegramBotService();
